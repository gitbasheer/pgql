import { DocumentNode } from 'graphql';
import { ExtractedQuery } from './query.types.js';

export interface VariantSwitch {
  variable: string;
  type: 'boolean' | 'enum' | 'ternary';
  possibleValues: any[];
  location: 'fragment' | 'field' | 'variable' | 'directive';
  description?: string;
  source?: string; // Original code that created this switch
}

export interface VariantCondition {
  switches: Record<string, any>;
  description?: string;
}

export interface QueryVariant {
  id: string;
  originalQueryId: string;
  queryName: string;
  filePath: string;
  content: string; // Fully resolved GraphQL
  ast: DocumentNode;
  conditions: VariantCondition;
  usedFragments: string[];
  switchConfig: VariantSwitch[];
}

export interface DynamicPattern {
  type: 'ternary' | 'switch' | 'if-else' | 'function-call';
  location: {
    start: number;
    end: number;
    line: number;
  };
  pattern: string;
  variables: string[];
}

export interface VariantAnalysisResult {
  query: ExtractedQuery;
  isVariant: boolean;
  patterns: DynamicPattern[];
  switches: VariantSwitch[];
  possibleVariants: number;
  variantGenerationStrategy?: 'inline' | 'separate' | 'both';
}
