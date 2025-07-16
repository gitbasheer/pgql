/** @fileoverview Shared type definitions for GraphQL Migration Dashboard. Used by both frontend and backend. */

// Endpoint types
export type Endpoint = 'productGraph' | 'offerGraph';

// Source location types
export interface SourceLocation {
  line: number;
  column: number;
  file: string;
}

// Pipeline stages
export const PIPELINE_STAGES = [
  'Extraction',
  'Classification',
  'Validation',
  'Testing',
  'Transformation',
  'PR Generation',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export type PipelineStatus = 'pending' | 'in_progress' | 'completed' | 'error';

// Core query interface used throughout the system
export interface ExtractedQuery {
  // Identity
  id: string;
  queryName: string;
  content: string;
  fullExpandedQuery?: string;
  
  // Required properties for compatibility
  id: string;
  type: 'query' | 'mutation' | 'subscription' | 'fragment';
  
  // Additional properties for compatibility
  queryId?: string;
  hash?: string;

  // Location
  filePath: string;
  lineNumber: number;
  location?: SourceLocation;

  // GraphQL metadata
  type: 'query' | 'mutation' | 'subscription';
  operation?: 'query' | 'mutation' | 'subscription';
  variables?: Record<string, string>;
  fragments?: string[];
  hasVariables?: boolean;

  // Classification
  endpoint?: Endpoint;
  isNested?: boolean;

  // Additional context
  source?: string;
}

// Transformation result
export interface TransformationResult {
  transformedQuery: string;
  originalQuery?: string;
  warnings: string[];
  mappingCode: string;
  changes?: TransformationChange[];
  abFlag?: string;
}

export interface TransformationChange {
  type: 'field' | 'argument' | 'type' | 'fragment' | 'field-rename' | 'nested-replacement' | 'comment-out' | 'enum-value-rename';
  field: string;
  oldValue?: string;
  newValue?: string;
  reason?: string;
}

// Testing account structure
export interface TestingAccount {
  accountId: string;
  authCookies?: string;
  testEndpoint?: string;
  ventures?: Array<{
    id: string;
    name: string;
  }>;
  projects?: Array<{
    id: string;
    domain: string;
  }>;
}

// API test parameters
export interface TestParams {
  query: string;
  variables: Record<string, unknown>;
  endpoint: Endpoint;
  testingAccount?: TestingAccount;
}

// Pipeline configuration
export interface PipelineConfig {
  repoPath: string;
  strategy?: 'pluck' | 'ast' | 'hybrid';
  includeFragments?: boolean;
  testRealApi?: boolean;
  generatePR?: boolean;
}

// Pipeline state
export interface Pipeline {
  id: string;
  config: PipelineConfig;
  status: PipelineStatus;
  currentStage: PipelineStage;
  startTime: number;
  endTime?: number;
  error?: string;
  stats?: PipelineStats;
}

export interface PipelineStats {
  totalQueries: number;
  processedQueries: number;
  transformedQueries: number;
  errors: number;
  warnings: number;
}

// Core configuration interface referenced in documentation
export interface PgqlOptions {
  // Extraction Strategy
  strategy?: 'pluck' | 'ast' | 'hybrid';
  
  // Cache Configuration
  cacheConfig?: {
    enabled?: boolean;
    ttl?: number;        // Cache time-to-live (ms)
    maxSize?: number;    // Memory limit (bytes)
  };
  
  // Schema Configuration  
  schemaConfig?: {
    cacheEnabled?: boolean;
    cacheSize?: number;   // MB
    cacheTtl?: number;    // ms
    fallbackToFile?: boolean;
    enableWarmup?: boolean;
  };
  
  // Transformation Settings
  transformation?: {
    commentOutVague?: boolean;
    addDeprecationComments?: boolean;
    preserveOriginalAsComment?: boolean;
    dryRun?: boolean;
  };
  
  // Performance Tuning
  performance?: {
    parallelFiles?: boolean;
    concurrency?: number;     // Max concurrent operations
    chunkSize?: number;       // Files per chunk
  };
  
  // Schema Validation
  validation?: {
    skipInvalid?: boolean;
    endpoint?: string;       // For real API testing
    auth?: {
      cookies?: string;
      appKey?: string;
    };
  };
}

// Socket.io event types
export interface SocketEvents {
  // Connection events
  connect: void;
  disconnect: void;

  // Pipeline events
  'pipeline:started': { pipelineId: string; config: PipelineConfig };
  'pipeline:stage': { pipelineId: string; stage: PipelineStage; status: PipelineStatus };
  'pipeline:log': LogDetail;
  'pipeline:error': { pipelineId: string; error: string; stage?: PipelineStage };
  'pipeline:completed': { pipelineId: string; stats: PipelineStats };

  // Query events
  'query:extracted': { pipelineId: string; queryName: string; endpoint: Endpoint };
  'query:validated': { pipelineId: string; queryName: string; valid: boolean };
  'query:transformed': { pipelineId: string; queryName: string; changes: number };

  // Real API test events
  'realapi:test:started': { pipelineId: string; queryName: string };
  'realapi:test:completed': { pipelineId: string; queryName: string; success: boolean };
  'realapi:baseline:saved': { pipelineId: string; queryName: string };
}

// Log detail structure
export interface LogDetail {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  pipelineId?: string;
  stage?: PipelineStage;
  details?: {
    queryName?: string;
    endpoint?: Endpoint;
    error?: string;
    [key: string]: unknown;
  };
}

// API response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Query diff details
export interface QueryDiff {
  queryName: string;
  original: string;
  transformed: string;
  changes: TransformationChange[];
  warnings: string[];
  mappingCode?: string;
}

// PR generation request
export interface GeneratePRRequest {
  pipelineId: string;
  title?: string;
  description?: string;
  branch?: string;
}

// PR generation response
export interface GeneratePRResponse {
  prUrl: string;
  prNumber: number;
  branch: string;
  filesChanged: number;
}

// Validation result
export interface ValidationResult {
  queryName: string;
  queryId?: string; // Optional ID for compatibility
  endpoint: Endpoint;
  valid: boolean;
  errors?: string[];
  warnings?: string[];
  responseTime?: number;
}

// Real API test result
export interface RealApiTestResult {
  queryName: string;
  endpoint: Endpoint;
  success: boolean;
  response?: unknown;
  error?: string;
  duration: number;
  baseline?: unknown;
}

// GraphQL response structure for cohort queries
export interface CohortResponse {
  data?: {
    getCohortSelections?: Array<{
      cohortId: string;
      selections: unknown;
    }>;
    getCohort?: {
      cohortId: string;
      data: unknown;
    };
  };
  errors?: Array<{
    message: string;
    path?: string[];
  }>;
}
