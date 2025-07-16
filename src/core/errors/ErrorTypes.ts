/**
 * Unified error type system for pgql
 * Provides structured, categorized errors with context and recovery suggestions
 */

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ErrorCategory = 
  | 'EXTRACTION' 
  | 'VALIDATION' 
  | 'TRANSFORMATION' 
  | 'SCHEMA' 
  | 'CACHE' 
  | 'FILE_SYSTEM' 
  | 'NETWORK' 
  | 'CONFIGURATION' 
  | 'CLI' 
  | 'INTERNAL';

export interface ErrorContext {
  file?: string;
  line?: number;
  column?: number;
  queryId?: string;
  operation?: string;
  component?: string;
  additionalData?: Record<string, any>;
}

export interface ErrorRecoveryAction {
  type: 'RETRY' | 'SKIP' | 'FALLBACK' | 'USER_INPUT' | 'ABORT';
  description: string;
  automated?: boolean;
  command?: string;
}

export interface PgqlErrorDetails {
  code: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  context?: ErrorContext;
  cause?: Error;
  recoveryActions?: ErrorRecoveryAction[];
  timestamp: Date;
  correlationId?: string;
}

/**
 * Base error class for all pgql errors
 */
export class PgqlError extends Error {
  public readonly details: PgqlErrorDetails;

  constructor(details: Omit<PgqlErrorDetails, 'timestamp'>) {
    super(details.message);
    this.name = 'PgqlError';
    this.details = {
      ...details,
      timestamp: new Date(),
    };

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PgqlError);
    }
  }

  /**
   * Create error with correlation ID for tracing
   */
  static withCorrelation(
    details: Omit<PgqlErrorDetails, 'timestamp' | 'correlationId'>,
    correlationId: string
  ): PgqlError {
    return new PgqlError({
      ...details,
      correlationId,
    });
  }

  /**
   * Create error from another error with additional context
   */
  static fromError(
    error: Error,
    details: Omit<PgqlErrorDetails, 'timestamp' | 'cause' | 'message'>
  ): PgqlError {
    return new PgqlError({
      ...details,
      message: error.message,
      cause: error,
    });
  }

  /**
   * Check if error is recoverable
   */
  isRecoverable(): boolean {
    return this.details.recoveryActions !== undefined && this.details.recoveryActions.length > 0;
  }

  /**
   * Get automated recovery actions
   */
  getAutomatedRecovery(): ErrorRecoveryAction[] {
    return this.details.recoveryActions?.filter(action => action.automated) || [];
  }

  /**
   * Get user recovery actions
   */
  getUserRecovery(): ErrorRecoveryAction[] {
    return this.details.recoveryActions?.filter(action => !action.automated) || [];
  }

  /**
   * Serialize error for logging/reporting
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,
      details: this.details,
    };
  }
}

/**
 * Specialized error classes for different categories
 */

export class ExtractionError extends PgqlError {
  constructor(message: string, context?: ErrorContext, cause?: Error) {
    super({
      code: 'EXTRACTION_FAILED',
      category: 'EXTRACTION',
      severity: 'medium',
      message,
      context,
      cause,
      recoveryActions: [
        {
          type: 'RETRY',
          description: 'Retry extraction with different strategy',
          automated: true,
        },
        {
          type: 'SKIP',
          description: 'Skip problematic file and continue',
          automated: false,
        },
      ],
    });
  }
}

export class ValidationError extends PgqlError {
  constructor(message: string, context?: ErrorContext, cause?: Error) {
    super({
      code: 'VALIDATION_FAILED',
      category: 'VALIDATION',
      severity: 'high',
      message,
      context,
      cause,
      recoveryActions: [
        {
          type: 'USER_INPUT',
          description: 'Review and fix validation errors manually',
          automated: false,
        },
      ],
    });
  }
}

export class TransformationError extends PgqlError {
  constructor(message: string, context?: ErrorContext, cause?: Error) {
    super({
      code: 'TRANSFORMATION_FAILED',
      category: 'TRANSFORMATION',
      severity: 'medium',
      message,
      context,
      cause,
      recoveryActions: [
        {
          type: 'FALLBACK',
          description: 'Use manual transformation mode',
          automated: true,
        },
        {
          type: 'SKIP',
          description: 'Skip transformation for this query',
          automated: false,
        },
      ],
    });
  }
}

export class SchemaError extends PgqlError {
  constructor(message: string, context?: ErrorContext, cause?: Error) {
    super({
      code: 'SCHEMA_ERROR',
      category: 'SCHEMA',
      severity: 'high',
      message,
      context,
      cause,
      recoveryActions: [
        {
          type: 'USER_INPUT',
          description: 'Verify schema file path and format',
          automated: false,
          command: 'pgql validate schema --schema <path>',
        },
      ],
    });
  }
}

export class ConfigurationError extends PgqlError {
  constructor(message: string, context?: ErrorContext, cause?: Error) {
    super({
      code: 'CONFIG_ERROR',
      category: 'CONFIGURATION',
      severity: 'high',
      message,
      context,
      cause,
      recoveryActions: [
        {
          type: 'USER_INPUT',
          description: 'Check configuration file syntax and values',
          automated: false,
        },
        {
          type: 'FALLBACK',
          description: 'Use default configuration',
          automated: true,
        },
      ],
    });
  }
}

export class CacheError extends PgqlError {
  constructor(message: string, context?: ErrorContext, cause?: Error) {
    super({
      code: 'CACHE_ERROR',
      category: 'CACHE',
      severity: 'low',
      message,
      context,
      cause,
      recoveryActions: [
        {
          type: 'FALLBACK',
          description: 'Continue without caching',
          automated: true,
        },
        {
          type: 'RETRY',
          description: 'Clear cache and retry',
          automated: true,
          command: 'rm -rf .pgql-cache',
        },
      ],
    });
  }
}

export class FileSystemError extends PgqlError {
  constructor(message: string, context?: ErrorContext, cause?: Error) {
    super({
      code: 'FILESYSTEM_ERROR',
      category: 'FILE_SYSTEM',
      severity: 'medium',
      message,
      context,
      cause,
      recoveryActions: [
        {
          type: 'USER_INPUT',
          description: 'Check file permissions and paths',
          automated: false,
        },
      ],
    });
  }
}

/**
 * Error factory functions for common scenarios
 */
export const ErrorFactory = {
  parseError: (file: string, line: number, cause: Error): ExtractionError =>
    new ExtractionError(`Failed to parse GraphQL in ${file}:${line}`, { file, line }, cause),

  schemaNotFound: (schemaPath: string): SchemaError =>
    new SchemaError(`Schema file not found: ${schemaPath}`, { file: schemaPath }),

  validationFailed: (queryId: string, errors: string[]): ValidationError =>
    new ValidationError(`Query validation failed: ${errors.join(', ')}`, { queryId }),

  transformationFailed: (queryId: string, reason: string, cause?: Error): TransformationError =>
    new TransformationError(`Transformation failed for ${queryId}: ${reason}`, { queryId }, cause),

  configInvalid: (field: string, value: any): ConfigurationError =>
    new ConfigurationError(`Invalid configuration: ${field} = ${value}`),

  cacheCorrupted: (): CacheError =>
    new CacheError('Cache data appears corrupted'),

  fileNotReadable: (filePath: string, cause: Error): FileSystemError =>
    new FileSystemError(`Cannot read file: ${filePath}`, { file: filePath }, cause),
};