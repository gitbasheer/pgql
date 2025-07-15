// API Response Types

export interface ExtractedQuery {
  queryName: string;
  content: string;
  filePath: string;
  lineNumber: number;
  isNested: boolean;
  fragments?: string[];
  hasVariables?: boolean;
  operation?: string;
}

export interface TransformationResult {
  transformedQuery: string;
  warnings: string[];
  mappingCode: string;
}

export interface TestingAccount {
  accountId: string;
  authCookies?: string;
  testEndpoint?: string;
}

export interface ApiResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  timing?: {
    start: number;
    end: number;
    duration: number;
  };
}

export interface DifferenceDetail {
  path: string;
  type: 'added' | 'removed' | 'changed' | 'type_changed';
  oldValue?: unknown;
  newValue?: unknown;
  description: string;
}

export interface BaselineComparison {
  queryName: string;
  timestamp: string;
  testingAccount?: TestingAccount;
  baseline: ApiResponse;
  response: ApiResponse;
  comparison: {
    matches: boolean;
    differences: DifferenceDetail[];
    similarity?: number;
  };
}

export interface RealApiTestResult {
  queryName: string;
  timestamp: string;
  successful: boolean;
  error?: string;
  baselineId?: string;
  comparisonResult?: BaselineComparison;
}

export interface LogDetail {
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface SocketEventData {
  pipelineId?: string;
  queryName?: string;
  message?: string;
  stage?: string;
  progress?: number;
}