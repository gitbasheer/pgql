import { SourceAST } from '../extraction/types/query.types.js';
import { TransformationResult } from '../transformer/QueryTransformer.js';

export interface TransformationMapping {
  queryId: string;
  sourceMapping: SourceMapping;
  transformation: TransformationResult;
  preserveInterpolations: boolean;
}

export interface SourceMapping {
  astNode: SourceAST;
  filePath: string;
  originalContent: string;
  templateLiteralInfo?: {
    quasis: string[];
    expressions: string[];
    interpolationTypes: InterpolationType[];
  };
}

export type InterpolationType = 'fragment' | 'variable' | 'function' | 'other';

export interface AppliedChange {
  filePath: string;
  originalContent: string;
  newContent: string;
  changes: MinimalChange[];
  success: boolean;
  error?: string;
}

export interface MinimalChange {
  start: number;
  end: number;
  originalText: string;
  newText: string;
  reason: string;
  code?: string;
  linesAdded?: number;
  linesRemoved?: number;
}

export interface ASTApplicatorOptions {
  preserveFormatting: boolean;
  preserveComments: boolean;
  validateChanges: boolean;
  dryRun: boolean;
} 