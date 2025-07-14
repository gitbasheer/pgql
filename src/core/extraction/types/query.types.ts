import { DocumentNode } from 'graphql';
import * as babel from '@babel/types';

export type OperationType = 'query' | 'mutation' | 'subscription' | 'fragment';

export interface SourceLocation {
  line: number;
  column: number;
  file: string;
}

export interface SourceAST {
  node: babel.Node;
  start: number;
  end: number;
  templateLiteral?: {
    quasis: babel.TemplateElement[];
    expressions: babel.Expression[];
  };
  parent: babel.Node;
}

export interface ExtractedQuery {
  id: string;
  filePath: string;
  content: string;
  ast: DocumentNode | null;
  location: SourceLocation;
  name?: string;
  originalName?: string;
  type: OperationType;
  
  // Source AST mapping
  sourceAST?: SourceAST;
  
  // Enhanced metadata
  context?: QueryContext;
  fragments?: string[];
  variables?: QueryVariable[];
  imports?: ImportInfo[];
  metadata?: {
    hasInterpolations?: boolean;
    needsResolution?: boolean;
    fileContent?: string;
    resolvedInterpolations?: any[];
    [key: string]: any;
  };
}

export interface QueryContext {
  functionName?: string;
  componentName?: string;
  exportName?: string;
  surroundingCode?: string;
  isExported?: boolean;
  isDefaultExport?: boolean;
}

export interface QueryVariable {
  name: string;
  type: string;
  defaultValue?: any;
  isRequired: boolean;
}

export interface ImportInfo {
  source: string;
  imported: string[];
  type: 'es6' | 'commonjs';
}

export interface FragmentDefinition {
  name: string;
  content: string;
  ast: DocumentNode;
  filePath: string;
  dependencies: string[]; // Other fragments this one uses
}

export interface ResolvedQuery extends ExtractedQuery {
  resolvedContent: string;
  resolvedFragments: FragmentDefinition[];
  allDependencies: string[];
}