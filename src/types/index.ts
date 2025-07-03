import { DocumentNode } from 'graphql';

export interface GraphQLOperation {
  id: string;
  type: 'query' | 'mutation' | 'subscription';
  name: string;
  ast: DocumentNode;
  source: string;
  file: string;
  line: number;
  column: number;
  variables: Variable[];
  fragments: FragmentUsage[];
  directives: Directive[];
  confidence?: ConfidenceScore;
}

export interface Variable {
  name: string;
  type: string;
  defaultValue?: any;
}

export interface FragmentUsage {
  name: string;
  type: string;
  file?: string;
}

export interface Directive {
  name: string;
  arguments: Record<string, any>;
}

export interface CodeChange {
  file: string;
  operation: GraphQLOperation;
  pattern: string;
  oldQuery: string;
  newQuery: string;
  transformations: Transformation[];
  confidence?: ConfidenceScore;
}

export interface Transformation {
  type: 'field-rename' | 'type-change' | 'structure-change' | 'custom';
  description: string;
  from: string;
  to: string;
  automated: boolean;
}

export interface ConfidenceScore {
  score: number; // 0-100
  category: 'automatic' | 'semi-automatic' | 'manual';
  factors: ConfidenceFactors;
  risks: string[];
  requiresReview: boolean;
}

export interface ConfidenceFactors {
  complexity: number;
  patternMatch: number;
  testCoverage: number;
  historicalSuccess: number;
}

export interface MigrationConfig {
  source: {
    include: string[];
    exclude: string[];
  };
  confidence: {
    automatic: number;
    semiAutomatic: number;
    manual: number;
  };
  rollout: {
    initial: number;
    increment: number;
    interval: string;
    maxErrors: number;
  };
  safety: {
    requireApproval: boolean;
    autoRollback: boolean;
    healthCheckInterval: number;
  };
  schemaPath?: string;
}

export interface FeatureFlag {
  name: string;
  operation: string;
  enabled: boolean;
  rolloutPercentage: number;
  enabledSegments: string[];
  fallbackBehavior: 'old' | 'error' | 'retry';
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  successRate: number;
  errorRate: number;
  latency: {
    p50: number;
    p95: number;
    p99: number;
  };
  issues: HealthIssue[];
}

export interface HealthIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  affectedOperations: string[];
  timestamp: Date;
}

export interface RollbackPlan {
  id: string;
  operations: string[];
  checkpoints: Checkpoint[];
  strategy: 'immediate' | 'gradual';
}

export interface Checkpoint {
  id: string;
  timestamp: Date;
  state: Record<string, any>;
  operations: string[];
}