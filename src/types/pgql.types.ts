export type Endpoint = 'productGraph' | 'offerGraph' | 'unknown';

export interface ExtractedQuery {
  query: string;
  fullExpandedQuery: string;
  name: string; // Standardized unique name
  variables: Record<string, string>; // e.g., { ventureId: 'UUID!' }
  fragments: string[]; // Resolved fragments
  endpoint: Endpoint;
  sourceFile: string;
}

export interface TestParams {
  query: ExtractedQuery;
  testingAccount: { 
    id: string; 
    ventures?: Array<{ id: string; name: string }>;
    projects?: Array<{ id: string; domain: string }>;
    // other fields from testing account
  };
  auth: { 
    cookies: string; 
    appKey: string;
  };
}

export interface TransformationResult {
  newQuery: string;
  mappingUtil: string; // Generated function code
  abFlag: string; // Hivemind integration
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