import { logger } from '../../../utils/logger';

export class ProcessingError extends Error {
  constructor(
    message: string,
    public readonly file?: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ProcessingError';
  }
}

export interface ErrorContext {
  file?: string;
  operation?: string;
  details?: Record<string, any>;
}

export class ErrorHandler {
  private errors: Array<{ error: Error; context: ErrorContext }> = [];

  /**
   * Handle an error with appropriate logging and tracking
   */
  handleError(error: unknown, context: ErrorContext): void {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    // Log at appropriate level
    if (this.isExpectedError(errorObj)) {
      logger.debug(`${context.operation || 'Operation'} warning in ${context.file}: ${errorObj.message}`);
    } else {
      logger.error(`${context.operation || 'Operation'} failed in ${context.file}:`, errorObj);
    }

    // Track error for aggregation
    this.errors.push({ error: errorObj, context });
  }

  /**
   * Handle a recoverable error (warning level)
   */
  handleWarning(message: string, context: ErrorContext): void {
    logger.warn(`${context.operation || 'Operation'} warning in ${context.file}: ${message}`);
  }

  /**
   * Execute an operation with error handling
   */
  async tryOperation<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    defaultValue?: T
  ): Promise<T | undefined> {
    try {
      return await operation();
    } catch (error) {
      this.handleError(error, context);
      return defaultValue;
    }
  }

  /**
   * Execute an operation that might fail partially
   */
  async tryPartialOperation<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    recoverFn?: (error: unknown) => T
  ): Promise<T | null> {
    try {
      return await operation();
    } catch (error) {
      this.handleError(error, context);
      
      if (recoverFn) {
        try {
          return recoverFn(error);
        } catch (recoveryError) {
          this.handleError(recoveryError, { ...context, operation: `${context.operation} recovery` });
        }
      }
      
      return null;
    }
  }

  /**
   * Get aggregated error report
   */
  getErrorReport(): {
    totalErrors: number;
    errorsByFile: Map<string, number>;
    errorsByOperation: Map<string, number>;
    errors: Array<{ error: Error; context: ErrorContext }>;
  } {
    const errorsByFile = new Map<string, number>();
    const errorsByOperation = new Map<string, number>();

    for (const { context } of this.errors) {
      if (context.file) {
        errorsByFile.set(context.file, (errorsByFile.get(context.file) || 0) + 1);
      }
      if (context.operation) {
        errorsByOperation.set(context.operation, (errorsByOperation.get(context.operation) || 0) + 1);
      }
    }

    return {
      totalErrors: this.errors.length,
      errorsByFile,
      errorsByOperation,
      errors: this.errors
    };
  }

  /**
   * Clear tracked errors
   */
  clearErrors(): void {
    this.errors = [];
  }

  /**
   * Check if an error is expected/recoverable
   */
  private isExpectedError(error: Error): boolean {
    const expectedMessages = [
      'graphql-tag-pluck might throw for files without GraphQL',
      'Failed to parse',
      'Syntax Error',
      'Expected Name'
    ];

    return expectedMessages.some(msg => error.message.includes(msg));
  }
}