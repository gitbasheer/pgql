import { logger } from './logger.js';

export interface StandardError {
  code: string;          // e.g., "EXTRACT_001", "TRANSFORM_002"
  message: string;       // Human-readable message
  module: string;        // Origin module (e.g., "extraction", "transformer")
  file?: string;         // Affected file
  location?: {
    line: number;
    column: number;
  };
  context?: Record<string, unknown>;
  timestamp: string;
  version: string;       // Error format version
  severity: 'error' | 'warning' | 'info';
  originalError?: Error; // Original error for debugging
}

export interface ErrorContext {
  operation?: string;
  file?: string;
  line?: number;
  column?: number;
  [key: string]: unknown;
}

export enum ErrorModule {
  EXTRACTION = 'extraction',
  TRANSFORMATION = 'transformation',
  VALIDATION = 'validation',
  APPLICATION = 'application',
  SCANNER = 'scanner',
  CACHE = 'cache',
  SAFETY = 'safety',
  MONITORING = 'monitoring',
  CLI = 'cli',
  INTEGRATION = 'integration'
}

export enum ErrorCode {
  // Extraction errors
  EXTRACT_PARSE = 'EXTRACT_001',
  EXTRACT_FILE_READ = 'EXTRACT_002',
  EXTRACT_INVALID_QUERY = 'EXTRACT_003',
  EXTRACT_FRAGMENT = 'EXTRACT_004',

  // Transformation errors
  TRANSFORM_PARSE = 'TRANSFORM_001',
  TRANSFORM_APPLY = 'TRANSFORM_002',
  TRANSFORM_VALIDATION = 'TRANSFORM_003',

  // Validation errors
  VALIDATE_SCHEMA = 'VALIDATE_001',
  VALIDATE_RESPONSE = 'VALIDATE_002',
  VALIDATE_SEMANTIC = 'VALIDATE_003',

  // Application errors
  APPLY_AST = 'APPLY_001',
  APPLY_FILE_WRITE = 'APPLY_002',

  // General errors
  GENERAL_UNKNOWN = 'GENERAL_999'
}

const ERROR_FORMAT_VERSION = '1.0.0';

export class StandardErrorHandler {
  private readonly module: ErrorModule;
  private readonly errorLog: StandardError[] = [];

  constructor(module: ErrorModule) {
    this.module = module;
  }

  /**
   * Handle an error with standardized formatting
   */
  handleError(
    error: unknown,
    context: ErrorContext,
    code?: ErrorCode,
    severity: 'error' | 'warning' | 'info' = 'error'
  ): StandardError {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    const errorCode = code || this.inferErrorCode(errorObj, context);

    const standardError: StandardError = {
      code: errorCode,
      message: this.formatMessage(errorObj, context),
      module: this.module,
      file: context.file,
      location: context.line ? {
        line: context.line,
        column: context.column || 0
      } : undefined,
      context: this.sanitizeContext(context),
      timestamp: new Date().toISOString(),
      version: ERROR_FORMAT_VERSION,
      severity,
      originalError: errorObj
    };

    // Log the error
    this.logError(standardError);

    // Store for later analysis
    this.errorLog.push(standardError);

    return standardError;
  }

  /**
   * Create a standardized error without throwing
   */
  createError(
    message: string,
    code: ErrorCode,
    context?: ErrorContext,
    severity: 'error' | 'warning' | 'info' = 'error'
  ): StandardError {
    return {
      code,
      message,
      module: this.module,
      file: context?.file,
      location: context?.line ? {
        line: context.line,
        column: context.column || 0
      } : undefined,
      context: context ? this.sanitizeContext(context) : undefined,
      timestamp: new Date().toISOString(),
      version: ERROR_FORMAT_VERSION,
      severity
    };
  }

  /**
   * Format error for backwards compatibility
   */
  formatLegacy(error: StandardError): string {
    const location = error.location
      ? `${error.file}:${error.location.line}:${error.location.column}`
      : error.file || 'unknown';

    return `[${error.code}] ${error.message} (${location})`;
  }

  /**
   * Get all errors for reporting
   */
  getErrors(): StandardError[] {
    return [...this.errorLog];
  }

  /**
   * Clear error log
   */
  clearErrors(): void {
    this.errorLog.length = 0;
  }

  private inferErrorCode(error: Error, context: ErrorContext): ErrorCode {
    // Infer error code based on error message and context
    const message = error.message.toLowerCase();
    const operation = context.operation?.toLowerCase() || '';

    if (this.module === ErrorModule.EXTRACTION) {
      if (message.includes('parse') || message.includes('syntax')) {
        return ErrorCode.EXTRACT_PARSE;
      }
      if (message.includes('file') || message.includes('read')) {
        return ErrorCode.EXTRACT_FILE_READ;
      }
      if (message.includes('fragment')) {
        return ErrorCode.EXTRACT_FRAGMENT;
      }
      return ErrorCode.EXTRACT_INVALID_QUERY;
    }

    if (this.module === ErrorModule.TRANSFORMATION) {
      if (message.includes('parse')) {
        return ErrorCode.TRANSFORM_PARSE;
      }
      if (message.includes('apply')) {
        return ErrorCode.TRANSFORM_APPLY;
      }
      return ErrorCode.TRANSFORM_VALIDATION;
    }

    if (this.module === ErrorModule.VALIDATION) {
      if (message.includes('schema')) {
        return ErrorCode.VALIDATE_SCHEMA;
      }
      if (message.includes('response')) {
        return ErrorCode.VALIDATE_RESPONSE;
      }
      return ErrorCode.VALIDATE_SEMANTIC;
    }

    return ErrorCode.GENERAL_UNKNOWN;
  }

  private formatMessage(error: Error, context: ErrorContext): string {
    const operation = context.operation ? `[${context.operation}] ` : '';
    return `${operation}${error.message}`;
  }

  private sanitizeContext(context: ErrorContext): Record<string, unknown> {
    const { operation, file, line, column, ...rest } = context;
    return rest;
  }

  private logError(error: StandardError): void {
    const logMessage = `[${error.module}] ${this.formatLegacy(error)}`;

    switch (error.severity) {
      case 'error':
        logger.error(logMessage, error.originalError);
        break;
      case 'warning':
        logger.warn(logMessage);
        break;
      case 'info':
        logger.info(logMessage);
        break;
    }
  }
}

// Factory function for creating module-specific error handlers
export function createErrorHandler(module: ErrorModule): StandardErrorHandler {
  return new StandardErrorHandler(module);
}

// Global error registry for cross-module error tracking
export class ErrorRegistry {
  private static instance: ErrorRegistry;
  private handlers: Map<ErrorModule, StandardErrorHandler> = new Map();

  static getInstance(): ErrorRegistry {
    if (!ErrorRegistry.instance) {
      ErrorRegistry.instance = new ErrorRegistry();
    }
    return ErrorRegistry.instance;
  }

  getHandler(module: ErrorModule): StandardErrorHandler {
    let handler = this.handlers.get(module);
    if (!handler) {
      handler = new StandardErrorHandler(module);
      this.handlers.set(module, handler);
    }
    return handler;
  }

  getAllErrors(): StandardError[] {
    const allErrors: StandardError[] = [];
    for (const handler of this.handlers.values()) {
      allErrors.push(...handler.getErrors());
    }
    return allErrors.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  clearAll(): void {
    for (const handler of this.handlers.values()) {
      handler.clearErrors();
    }
  }
}
