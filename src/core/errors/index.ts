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

// Import handleError and PgqlError for use in ErrorUtils
import { handleError } from './ErrorHandler.js';
import { PgqlError } from './ErrorTypes.js';

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
      const { handleError } = await import('./ErrorHandler.js');
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
      const { handleError } = require('./ErrorHandler.js');
      handleError(error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  },

  /**
   * Check if error is retryable
   */
  isRetryable(error: Error): boolean {
    try {
      const { PgqlError } = require('./ErrorTypes.js');
      if (error instanceof PgqlError) {
        return error.getAutomatedRecovery().some((action: any) => action.type === 'RETRY');
      }
    } catch {
      // If PgqlError not available, assume not retryable
    }
    return false;
  },

  /**
   * Extract correlation ID from error
   */
  getCorrelationId(error: Error): string | undefined {
    try {
      const { PgqlError } = require('./ErrorTypes.js');
      if (error instanceof PgqlError) {
        return error.details.correlationId;
      }
    } catch {
      // If PgqlError not available, return undefined
    }
    return undefined;
  },
};