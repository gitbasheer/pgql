import { DocumentNode } from 'graphql';
import { ExtractedQuery } from './query.types.js';

export interface QueryPattern {
  templatePattern: string;  // e.g., "query ${queryNames.byIdV1}"
  possibleNames: string[];  // All possible runtime values
  usageContext: {
    file: string;
    conditions: string[];   // e.g., ["infinityStoneEnabled", "ventureId"]
    dependencies: string[]; // Other patterns this depends on
  };
}

export interface QueryPatternRegistry {
  [key: string]: {
    versions: string[];
    names: Record<string, string>;
    deprecations: Record<string, string>;
    fragments: Record<string, string>;
    conditions: Record<string, string[]>;
  };
}

export interface PatternExtractedQuery extends ExtractedQuery {
  namePattern?: {
    template: string;        // "${queryNames.byIdV1}"
    resolvedName: string;    // "getVentureHomeDataByVentureIdDashboard"
    possibleValues: string[]; // All possible runtime values
    patternKey: string;      // "getVentureById"
    version: string;         // "V1"
    isDeprecated: boolean;
    migrationPath?: string;  // Target version/pattern
  };
  contentFingerprint?: string; // Hash of normalized AST structure
}

export interface MigrationManifest {
  patterns: Record<string, {
    to: string;
    fragments: {
      old: string;
      new: string;
    };
    conditions?: string[];
    deprecationReason?: string;
  }>;
  globalReplacements: Array<{
    from: string;
    to: string;
    type: 'fragment' | 'directive' | 'field';
  }>;
}

export interface QueryFingerprint {
  structureHash: string;
  fieldsHash: string;
  variablesHash: string;
  duplicateGroup?: string;
}

export interface PatternGroup {
  fingerprint: string;
  queries: PatternExtractedQuery[];
  representativeQuery: PatternExtractedQuery;
  variations: Array<{
    pattern: string;
    version: string;
    deprecated: boolean;
  }>;
}

export interface MigrationResult {
  queryId: string;
  success: boolean;
  originalPattern?: string;
  migratedPattern?: string;
  changes?: Array<{
    type: 'pattern' | 'fragment' | 'field';
    from: string;
    to: string;
  }>;
  error?: string;
}
