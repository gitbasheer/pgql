/**
 * Unified error handling system exports
 */

// Core error types and classes
export {
  PgqlError,
  ExtractionError,
  ValidationError,
  TransformationError,
  SchemaError,
  ConfigurationError,
  CacheError,
  FileSystemError,
  ErrorFactory,
} from './ErrorTypes.js';

export type {
  ErrorSeverity,
  ErrorCategory,
  ErrorContext,
  ErrorRecoveryAction,
  PgqlErrorDetails,
} from './ErrorTypes.js';

// Error handler
export {
  ErrorHandler,
  globalErrorHandler,
  handleError,
  handleErrors,
  createErrorHandler,
} from './ErrorHandler.js';

export type {
  ErrorHandlerOptions,
  ErrorReport,
} from './ErrorHandler.js';

// Utility functions for common error scenarios
export const ErrorUtils = {
  /**
   * Wrap async function with error handling
   */
  async safeExecute<T>(
    fn: () => Promise<T>,
    errorContext?: { operation?: string; component?: string }
  ): Promise<T | null> {
    try {
      return await fn();
    } catch (error) {
      await handleError(error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  },

  /**
   * Wrap sync function with error handling
   */
  safeExecuteSync<T>(
    fn: () => T,
    errorContext?: { operation?: string; component?: string }
  ): T | null {
    try {
      return fn();
    } catch (error) {
      handleError(error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  },

  /**
   * Check if error is retryable
   */
  isRetryable(error: Error | PgqlError): boolean {
    if (error instanceof PgqlError) {
      return error.getAutomatedRecovery().some(action => action.type === 'RETRY');
    }
    return false;
  },

  /**
   * Extract correlation ID from error
   */
  getCorrelationId(error: Error | PgqlError): string | undefined {
    if (error instanceof PgqlError) {
      return error.details.correlationId;
    }
    return undefined;
  },
};