// Import shared types first
import type {
  Endpoint,
  ExtractedQuery,
  TransformationResult,
  TransformationChange,
  TestingAccount,
  TestParams,
  Pipeline,
  PipelineConfig,
  PipelineStage,
  PipelineStatus,
  PipelineStats,
  LogDetail,
  ApiResponse,
  QueryDiff,
  GeneratePRRequest,
  GeneratePRResponse,
  ValidationResult,
  RealApiTestResult,
  CohortResponse,
  SocketEvents
} from '../../../src/types/shared.types';

// Re-export shared types
export type {
  Endpoint,
  ExtractedQuery,
  TransformationResult,
  TransformationChange,
  TestingAccount,
  TestParams,
  Pipeline,
  PipelineConfig,
  PipelineStage,
  PipelineStatus,
  PipelineStats,
  LogDetail,
  ApiResponse,
  QueryDiff,
  GeneratePRRequest,
  GeneratePRResponse,
  ValidationResult,
  RealApiTestResult,
  CohortResponse,
  SocketEvents
};

// Frontend-specific types

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
  baseline: GraphQLResponse;
  response: GraphQLResponse;
  comparison: {
    matches: boolean;
    differences: DifferenceDetail[];
    similarity?: number;
  };
}

export interface GraphQLResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  timing?: {
    start: number;
    end: number;
    duration: number;
  };
}

// Socket event data is now properly typed via SocketEvents interface
export type SocketEventData = SocketEvents[keyof SocketEvents];

// UI-specific pipeline view model
export interface PipelineViewModel {
  pipeline: Pipeline;
  logs: LogDetail[];
  queries: ExtractedQuery[];
  transformations: TransformationResult[];
}

// Form data types
export interface PipelineFormData {
  repoPath: string;
  strategy: 'pluck' | 'ast' | 'hybrid';
  includeFragments: boolean;
  testRealApi: boolean;
  generatePR: boolean;
}

// UI state types
export interface UIState {
  isConnected: boolean;
  isLoading: boolean;
  error?: string;
}