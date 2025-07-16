import { DocumentNode } from 'graphql';
import { ExtractedQuery } from './query.types.js';

/**
 * Types for variant extraction functionality
 */

export interface VariantMetadata {
  isVariant: boolean;
  originalQueryId: string;
  conditions: Record<string, boolean>;
  replacements: Array<{
    original: string;
    replaced: string;
    type: 'fragment' | 'field';
  }>;
}

export interface ExtractedQueryWithVariant extends ExtractedQuery {
  variantMetadata?: VariantMetadata;
}

export interface VariantCondition {
  variable: string;
  type: 'boolean' | 'enum';
  possibleValues: any[];
  usage: Array<{
    queryId: string;
    location: string;
    trueValue: string;
    falseValue: string;
  }>;
}

export interface VariantSwitch {
  variable: string;
  type: 'boolean' | 'enum';
  possibleValues: any[];
  location: 'fragment' | 'field' | 'variable';
  description?: string;
}

export interface VariantExtractionResult {
  queries: ExtractedQuery[];
  variants: ExtractedQueryWithVariant[];
  switches: Map<string, VariantSwitch>;
  conditions: VariantCondition[];
  summary: {
    totalOriginalQueries: number;
    totalVariants: number;
    totalSwitches: number;
    queriesWithVariants: string[];
  };
}

export interface VariantReport {
  conditions: VariantCondition[];
  summary: {
    totalConditions: number;
    totalQueriesWithVariants: number;
    totalPossibleCombinations: number;
  };
  errors?: {
    totalErrors: number;
    errorsByFile: Map<string, number>;
    errorsByOperation: Map<string, number>;
    errors: Array<{ error: Error; context: any }>;
  };
}
