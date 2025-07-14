import { ExtractedQuery } from '../types/index';
import { ExtractionContext } from '../engine/ExtractionContext';

export abstract class BaseStrategy {
  protected context: ExtractionContext;

  constructor(context: ExtractionContext) {
    this.context = context;
  }

  abstract get name(): string;

  abstract canHandle(filePath: string): boolean;

  abstract extract(filePath: string, content: string): Promise<ExtractedQuery[]>;

  protected generateQueryId(filePath: string, index: number, name?: string): string {
    const baseName = filePath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'unknown';
    return `${baseName}-${index}-${name || 'unnamed'}`;
  }
}