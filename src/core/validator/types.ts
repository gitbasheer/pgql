// Response Validation Types
import { DocumentNode } from 'graphql';
import { GraphQLOperation } from '../../types/index';

// Endpoint Configuration
export interface EndpointConfig {
  url: string;
  headers?: Record<string, string>;
  authentication?: AuthConfig;
  timeout?: number;
  retryPolicy?: RetryPolicy;
  environment?: 'production' | 'staging' | 'development';
  name?: string;
}

export interface AuthConfig {
  type: 'bearer' | 'api-key' | 'custom' | 'none' | 'cookie' | 'sso';
  token?: string;
  header?: string;
  customAuth?: (request: any) => Promise<any>;
  cookies?: CookieAuth;
  ssoConfig?: SSOConfig;
}

export interface CookieAuth {
  cookies: Record<string, string>;
  domain?: string;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
}

export interface SSOConfig {
  provider: 'godaddy' | 'custom';
  loginEndpoint?: string;
  credentials?: {
    username?: string;
    password?: string;
    encrypted?: boolean;
  };
  requiredCookies?: string[];
  tokenRefreshInterval?: number;
}

export interface RetryPolicy {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryCondition?: (error: any) => boolean;
}

// Response Capture
export interface CapturedResponse {
  queryId: string;
  operationName?: string;
  variables?: Record<string, any>;
  response: {
    data?: any;
    errors?: GraphQLError[];
    extensions?: Record<string, any>;
  };
  metadata: ResponseMetadata;
  timestamp: Date;
  version: 'baseline' | 'transformed';
}

export interface ResponseMetadata {
  duration: number;
  statusCode?: number;
  headers?: Record<string, string>;
  size: number;
  endpoint: string;
  environment: string;
}

export interface GraphQLError {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  path?: Array<string | number>;
  extensions?: Record<string, any>;
}

export interface BaselineResponses {
  responses: Map<string, CapturedResponse>;
  metadata: {
    capturedAt: Date;
    totalQueries: number;
    successCount: number;
    errorCount: number;
    endpoint: EndpointConfig;
  };
}

export interface TransformedResponses extends BaselineResponses {
  transformationVersion: string;
}

// Response Comparison
export interface ComparisonResult {
  queryId: string;
  operationName?: string;
  identical: boolean;
  differences: Difference[];
  similarity: number; // 0-1
  breakingChanges: BreakingChange[];
  performanceImpact: PerformanceImpact;
  recommendation: 'safe' | 'review' | 'unsafe';
}

export interface Difference {
  path: string[];
  type: DifferenceType;
  baseline: any;
  transformed: any;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  fixable: boolean;
}

export type DifferenceType = 
  | 'missing-field'
  | 'extra-field'
  | 'type-mismatch'
  | 'value-change'
  | 'null-mismatch'
  | 'array-length'
  | 'array-order'
  | 'structure-change';

export interface BreakingChange {
  type: 'removed-field' | 'type-change' | 'required-field' | 'semantic-change';
  path: string[];
  description: string;
  impact: 'high' | 'medium' | 'low';
  migrationStrategy?: string;
}

export interface PerformanceImpact {
  latencyChange: number; // percentage
  sizeChange: number; // percentage
  recommendation: string;
}

// Response Alignment
export interface AlignmentFunction {
  id: string;
  queryId: string;
  differences: Difference[];
  transform: (response: any) => any;
  code: string;
  tests: AlignmentTest[];
}

export interface AlignmentTest {
  input: any;
  expected: any;
  description: string;
}

export interface AlignmentOptions {
  strict: boolean;
  preserveNulls: boolean;
  preserveOrder: boolean;
  customRules?: AlignmentRule[];
}

export interface AlignmentRule {
  path: string | RegExp;
  transform: (value: any, context: any) => any;
}

// A/B Testing
export interface ABTestConfig {
  id: string;
  name: string;
  startDate: Date;
  endDate?: Date;
  splitPercentage: number;
  targetQueries?: string[];
  excludeQueries?: string[];
  rolloutStrategy: RolloutStrategy;
  metrics: ABTestMetrics;
  autoRollback: AutoRollbackConfig;
}

export interface RolloutStrategy {
  type: 'immediate' | 'gradual' | 'canary';
  stages?: RolloutStage[];
}

export interface RolloutStage {
  percentage: number;
  duration: string;
  criteria?: RolloutCriteria;
}

export interface RolloutCriteria {
  minSuccessRate: number;
  maxErrorRate: number;
  minSampleSize: number;
}

export interface ABTestMetrics {
  control: VariantMetrics;
  variant: VariantMetrics;
  summary: {
    winner?: 'control' | 'variant' | 'tie';
    confidence: number;
    recommendation: string;
  };
}

export interface VariantMetrics {
  requests: number;
  successes: number;
  errors: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  errorTypes: Record<string, number>;
}

export interface AutoRollbackConfig {
  enabled: boolean;
  errorThreshold: number;
  latencyThreshold: number;
  evaluationWindow: string;
  cooldownPeriod: string;
}

// Validation Reports
export interface ValidationReport {
  id: string;
  createdAt: Date;
  summary: ValidationSummary;
  comparisons: ComparisonResult[];
  alignments: AlignmentFunction[];
  abTestConfig?: ABTestConfig;
  recommendations: string[];
}

export interface ValidationSummary {
  totalQueries: number;
  identicalQueries: number;
  modifiedQueries: number;
  breakingChanges: number;
  averageSimilarity: number;
  safeToMigrate: boolean;
  estimatedRisk: 'low' | 'medium' | 'high';
}

// Storage
export interface StorageOptions {
  type: 'file' | 'database' | 'memory';
  path?: string;
  connectionString?: string;
  compression?: boolean;
  retention?: string;
}

// Variable Generation
export interface VariableGenerator {
  generateForQuery(query: DocumentNode, schema?: any): Promise<Record<string, any>[]>;
  generateFromExamples(examples: any[]): Record<string, any>[];
  generateEdgeCases(type: string): any[];
}

// Export main validation configuration
export interface ResponseValidationConfig {
  endpoints: EndpointConfig[];
  capture: {
    parallel: boolean;
    maxConcurrency: number;
    timeout: number;
    variableGeneration: 'auto' | 'manual' | 'examples';
  };
  comparison: {
    strict: boolean;
    ignorePaths?: string[];
    customComparators?: Record<string, (a: any, b: any) => boolean>;
  };
  alignment: AlignmentOptions;
  storage: StorageOptions;
  abTesting?: {
    enabled: boolean;
    defaultSplit: number;
    monitoring: {
      provider: 'datadog' | 'prometheus' | 'custom';
      config: Record<string, any>;
    };
  };
} 