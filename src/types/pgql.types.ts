// Import shared types for use in this file
import type {
  ExtractedQuery as SharedExtractedQuery,
  TestingAccount as SharedTestingAccount,
} from './shared.types';

// Re-export shared types
export type {
  Endpoint,
  ExtractedQuery,
  TestParams,
  TransformationResult,
  TestingAccount,
  TransformationChange,
  ValidationResult,
  RealApiTestResult,
} from './shared.types';

// Backend-specific extension of TestParams with auth
export interface BackendTestParams {
  query: SharedExtractedQuery;
  testingAccount: SharedTestingAccount;
  auth: {
    cookies: string;
    appKey: string;
  };
}

export interface DeprecationInfo {
  field: string;
  replacement: string;
  type: 'field-rename' | 'nested-replacement' | 'removed';
  reason: string;
}

export interface QueryPattern {
  type: 'direct' | 'factory' | 'dynamic' | 'conditional';
  pattern: string;
  variables?: string[];
  fragments?: string[];
}
