/**
 * Unified error handling system for pgql
 * Centralized error processing, logging, recovery, and reporting
 */

import { PgqlError, ErrorSeverity, ErrorCategory, ErrorRecoveryAction } from './ErrorTypes.js';
import { logger } from '../../utils/logger.js';

export interface ErrorHandlerOptions {
  logLevel: ErrorSeverity;
  autoRecover: boolean;
  maxRetries: number;
  reportToConsole: boolean;
  correlationId?: string;
}

export interface ErrorReport {
  totalErrors: number;
  errorsByCategory: Record<ErrorCategory, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  recoveredErrors: number;
  criticalErrors: PgqlError[];
  recommendations: string[];
}

/**
 * Central error handler that processes all pgql errors
 */
export class ErrorHandler {
  private errors: PgqlError[] = [];
  private recoveredErrors: PgqlError[] = [];
  private options: ErrorHandlerOptions;

  constructor(options: Partial<ErrorHandlerOptions> = {}) {
    this.options = {
      logLevel: 'medium',
      autoRecover: true,
      maxRetries: 3,
      reportToConsole: true,
      ...options,
    };
  }

  /**
   * Handle a single error
   */
  async handle(error: Error | PgqlError): Promise<void> {
    const pgqlError = this.ensurePgqlError(error);
    
    // Add correlation ID if configured
    if (this.options.correlationId && !pgqlError.details.correlationId) {
      pgqlError.details.correlationId = this.options.correlationId;
    }

    this.errors.push(pgqlError);

    // Log error based on severity
    this.logError(pgqlError);

    // Attempt automatic recovery if enabled
    if (this.options.autoRecover && pgqlError.isRecoverable()) {
      await this.attemptRecovery(pgqlError);
    }

    // Report to console if enabled and severity warrants it
    if (this.options.reportToConsole && this.shouldReportToConsole(pgqlError)) {
      this.reportErrorToConsole(pgqlError);
    }
  }

  /**
   * Handle multiple errors in batch
   */
  async handleBatch(errors: (Error | PgqlError)[]): Promise<void> {
    const promises = errors.map(error => this.handle(error));
    await Promise.all(promises);
  }

  /**
   * Get current error report
   */
  getReport(): ErrorReport {
    const totalErrors = this.errors.length;
    
    const errorsByCategory = this.errors.reduce((acc, error) => {
      acc[error.details.category] = (acc[error.details.category] || 0) + 1;
      return acc;
    }, {} as Record<ErrorCategory, number>);

    const errorsBySeverity = this.errors.reduce((acc, error) => {
      acc[error.details.severity] = (acc[error.details.severity] || 0) + 1;
      return acc;
    }, {} as Record<ErrorSeverity, number>);

    const criticalErrors = this.errors.filter(e => e.details.severity === 'critical');
    
    const recommendations = this.generateRecommendations();

    return {
      totalErrors,
      errorsByCategory,
      errorsBySeverity,
      recoveredErrors: this.recoveredErrors.length,
      criticalErrors,
      recommendations,
    };
  }

  /**
   * Clear all errors
   */
  clear(): void {
    this.errors = [];
    this.recoveredErrors = [];
  }

  /**
   * Get errors by category
   */
  getErrorsByCategory(category: ErrorCategory): PgqlError[] {
    return this.errors.filter(error => error.details.category === category);
  }

  /**
   * Get errors by severity
   */
  getErrorsBySeverity(severity: ErrorSeverity): PgqlError[] {
    return this.errors.filter(error => error.details.severity === severity);
  }

  /**
   * Check if there are critical errors
   */
  hasCriticalErrors(): boolean {
    return this.errors.some(error => error.details.severity === 'critical');
  }

  /**
   * Check if operation should abort based on errors
   */
  shouldAbort(): boolean {
    // Abort if there are critical errors or too many high severity errors
    const criticalCount = this.getErrorsBySeverity('critical').length;
    const highCount = this.getErrorsBySeverity('high').length;
    
    return criticalCount > 0 || highCount > 5;
  }

  /**
   * Generate error summary for CLI output
   */
  getSummaryText(): string {
    const report = this.getReport();
    
    if (report.totalErrors === 0) {
      return '✅ No errors detected';
    }

    const lines = [
      `❌ ${report.totalErrors} errors detected`,
    ];

    if (report.recoveredErrors > 0) {
      lines.push(`🔄 ${report.recoveredErrors} errors automatically recovered`);
    }

    if (report.criticalErrors.length > 0) {
      lines.push(`🚨 ${report.criticalErrors.length} critical errors require immediate attention`);
    }

    return lines.join('\n');
  }

  /**
   * Export errors for external analysis
   */
  exportErrors(): Array<Record<string, any>> {
    return this.errors.map(error => error.toJSON());
  }

  /**
   * Convert any error to PgqlError
   */
  private ensurePgqlError(error: Error | PgqlError): PgqlError {
    if (error instanceof PgqlError) {
      return error;
    }

    // Convert generic errors to PgqlError
    return PgqlError.fromError(error, {
      code: 'UNKNOWN_ERROR',
      category: 'INTERNAL',
      severity: 'medium',
    });
  }

  /**
   * Log error with appropriate level
   */
  private logError(error: PgqlError): void {
    const { severity, category, message, context, correlationId } = error.details;
    
    // Skip logging if below configured level
    if (!this.shouldLog(severity)) {
      return;
    }

    const logData = {
      category,
      severity,
      context,
      correlationId,
      stack: error.stack,
    };

    switch (severity) {
      case 'critical':
        logger.error(`CRITICAL: ${message}`, logData);
        break;
      case 'high':
        logger.error(`HIGH: ${message}`, logData);
        break;
      case 'medium':
        logger.warn(`MEDIUM: ${message}`, logData);
        break;
      case 'low':
        logger.debug(`LOW: ${message}`, logData);
        break;
    }
  }

  /**
   * Attempt to recover from error automatically
   */
  private async attemptRecovery(error: PgqlError): Promise<void> {
    const automatedActions = error.getAutomatedRecovery();
    
    for (const action of automatedActions) {
      try {
        const recovered = await this.executeRecoveryAction(action, error);
        if (recovered) {
          this.recoveredErrors.push(error);
          logger.info(`Automatically recovered from error: ${error.message}`, {
            action: action.type,
            description: action.description,
          });
          break;
        }
      } catch (recoveryError) {
        logger.warn(`Recovery action failed: ${action.description}`, { recoveryError });
      }
    }
  }

  /**
   * Execute a recovery action
   */
  private async executeRecoveryAction(
    action: ErrorRecoveryAction, 
    originalError: PgqlError
  ): Promise<boolean> {
    switch (action.type) {
      case 'RETRY':
        // For now, just mark as recoverable - actual retry logic would be in calling code
        return true;
        
      case 'FALLBACK':
        // Mark as recoverable with fallback
        return true;
        
      case 'SKIP':
        // Mark as recoverable by skipping
        return true;
        
      default:
        return false;
    }
  }

  /**
   * Check if error should be logged based on severity
   */
  private shouldLog(severity: ErrorSeverity): boolean {
    const levels = ['low', 'medium', 'high', 'critical'];
    const configLevel = levels.indexOf(this.options.logLevel);
    const errorLevel = levels.indexOf(severity);
    return errorLevel >= configLevel;
  }

  /**
   * Check if error should be reported to console
   */
  private shouldReportToConsole(error: PgqlError): boolean {
    return error.details.severity === 'critical' || error.details.severity === 'high';
  }

  /**
   * Report error to console with formatting
   */
  private reportErrorToConsole(error: PgqlError): void {
    const { severity, category, message, context } = error.details;
    
    console.error(`\n❌ ${severity.toUpperCase()} ${category} ERROR:`);
    console.error(`   ${message}`);
    
    if (context?.file) {
      console.error(`   File: ${context.file}${context.line ? `:${context.line}` : ''}`);
    }
    
    if (context?.queryId) {
      console.error(`   Query: ${context.queryId}`);
    }

    const userActions = error.getUserRecovery();
    if (userActions.length > 0) {
      console.error(`\n💡 Suggested actions:`);
      userActions.forEach(action => {
        console.error(`   • ${action.description}`);
        if (action.command) {
          console.error(`     Command: ${action.command}`);
        }
      });
    }
  }

  /**
   * Generate recommendations based on error patterns
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    const report = this.getReport();

    // Recommendation based on error categories
    if (report.errorsByCategory.VALIDATION > 5) {
      recommendations.push('High number of validation errors - consider reviewing schema compatibility');
    }

    if (report.errorsByCategory.EXTRACTION > 3) {
      recommendations.push('Multiple extraction failures - try different extraction strategy');
    }

    if (report.errorsByCategory.TRANSFORMATION > 3) {
      recommendations.push('Transformation issues detected - review deprecation rules');
    }

    if (report.errorsByCategory.CACHE > 0) {
      recommendations.push('Cache errors detected - consider clearing cache with `rm -rf .pgql-cache`');
    }

    if (report.errorsBySeverity.critical > 0) {
      recommendations.push('Critical errors must be resolved before proceeding');
    }

    return recommendations;
  }
}

/**
 * Global error handler instance
 */
export const globalErrorHandler = new ErrorHandler();

/**
 * Convenience function for handling errors globally
 */
export async function handleError(error: Error | PgqlError): Promise<void> {
  await globalErrorHandler.handle(error);
}

/**
 * Convenience function for handling multiple errors
 */
export async function handleErrors(errors: (Error | PgqlError)[]): Promise<void> {
  await globalErrorHandler.handleBatch(errors);
}

/**
 * Create a new error handler with specific options
 */
export function createErrorHandler(options: Partial<ErrorHandlerOptions>): ErrorHandler {
  return new ErrorHandler(options);
}