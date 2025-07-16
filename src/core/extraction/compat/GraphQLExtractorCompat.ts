/**
 * Compatibility bridge for GraphQLExtractor
 * Provides the old interface while using modern UnifiedExtractor internally
 * This allows gradual migration away from the deprecated scanner directory
 */

import { UnifiedExtractor } from '../engine/UnifiedExtractor.js';
import { ExtractionOptions } from '../types/index.js';
import { DocumentNode } from 'graphql';

// Re-export the interface from the old scanner for compatibility
export interface ExtractedQuery {
  id: string;
  filePath: string;
  content: string;
  ast: DocumentNode | null;
  location: {
    line: number;
    column: number;
  };
  name?: string;
  originalName?: string;
  type: 'query' | 'mutation' | 'subscription' | 'fragment';
}

/**
 * @deprecated Use UnifiedExtractor from core/extraction/engine instead
 * This is a compatibility bridge to ease migration
 */
export class GraphQLExtractor {
  private unifiedExtractor: UnifiedExtractor;

  constructor() {
    // Initialize with default options
    const defaultOptions: ExtractionOptions = {
      directory: process.cwd(),
      strategies: ['hybrid'],
      resolveFragments: true,
      parallel: true,
      maxConcurrency: 4,
    };
    
    this.unifiedExtractor = new UnifiedExtractor(defaultOptions);
  }

  async extractFromDirectory(
    directory: string,
    patterns: string[] = ['**/*.{js,jsx,ts,tsx}'],
    resolveFragments: boolean = true,
  ): Promise<ExtractedQuery[]> {
    // Update options for this specific extraction
    const options: ExtractionOptions = {
      directory,
      patterns,
      resolveFragments,
      strategies: ['hybrid'],
      parallel: true,
      maxConcurrency: 4,
    };

    // Create new extractor with specific options
    const extractor = new UnifiedExtractor(options);
    const result = await extractor.extract();

    // Convert internal ExtractedQuery format to legacy interface
    return result.queries.map(query => ({
      id: query.id,
      filePath: query.filePath,
      content: query.content,
      ast: query.ast,
      location: query.location || { line: 1, column: 1 },
      name: query.name,
      originalName: query.originalName,
      type: query.type,
    }));
  }

  // Legacy method - redirects to modern implementation
  async extractQueries(
    directory: string,
    options?: { patterns?: string[]; resolveFragments?: boolean }
  ): Promise<ExtractedQuery[]> {
    return this.extractFromDirectory(
      directory,
      options?.patterns,
      options?.resolveFragments
    );
  }
}