export interface TransformResult {
  queryId: string;
  originalQuery: string;
  transformedQuery: string;
  changes: TransformChange[];
  confidence: number;
  metadata?: {
    transformationType: string;
    appliedRules: string[];
    warnings?: string[];
  };
}

export interface TransformChange {
  type: 'field' | 'argument' | 'type' | 'directive' | 'fragment';
  path: string;
  oldValue: string;
  newValue: string;
  reason: string;
}

export interface TransformOptions {
  preserveStructure: boolean;
  validateSemantics: boolean;
  maxIterations?: number;
  useCache?: boolean;
}

export interface TransformContext {
  schemaPath: string;
  transformedQueries: Map<string, TransformResult>;
  errors: Error[];
  warnings: string[];
} 