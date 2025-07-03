import { ExtractionOptions, ExtractionError, ExtractionStats } from '../types/index';
import { logger } from '../../../utils/logger';

export class ExtractionContext {
  public readonly options: ExtractionOptions;
  public readonly cache: Map<string, any>;
  public readonly fragments: Map<string, string>;
  public readonly queryNames: Record<string, string>;
  public readonly errors: ExtractionError[];
  public readonly stats: Partial<ExtractionStats>;
  private readonly seenQueryNames: Map<string, string>;
  private startTime: number;

  constructor(options: ExtractionOptions) {
    this.options = this.normalizeOptions(options);
    logger.debug('Normalized options:', this.options);
    this.cache = new Map();
    this.fragments = new Map();
    this.queryNames = {};
    this.errors = [];
    this.stats = {
      totalFiles: 0,
      processedFiles: 0,
      totalQueries: 0,
      totalVariants: 0,
      totalFragments: 0,
      totalErrors: 0,
      strategy: options.strategies?.[0] || 'hybrid'
    };
    this.seenQueryNames = new Map();
    this.startTime = Date.now();
  }

  private normalizeOptions(options: ExtractionOptions): ExtractionOptions {
    return {
      ...options,
      patterns: options.patterns || ['**/*.{js,jsx,ts,tsx}'],
      ignore: options.ignore || ['**/node_modules/**', '**/__generated__/**', '**/*.test.*'],
      strategies: options.strategies || ['hybrid'],
      detectVariants: options.detectVariants ?? true,
      analyzeContext: options.analyzeContext ?? true,
      resolveNames: options.resolveNames ?? true,
      preserveSourceAST: options.preserveSourceAST ?? false,
      resolveFragments: options.resolveFragments ?? true,
      resolveImports: options.resolveImports ?? true,
      normalizeNames: options.normalizeNames ?? true,
      generateVariants: options.generateVariants ?? true,
      inlineFragments: options.inlineFragments ?? false,
      namingConvention: options.namingConvention || 'pascalCase',
      reporters: options.reporters || ['json'],
      cache: options.cache ?? true,
      parallel: options.parallel ?? true,
      maxConcurrency: options.maxConcurrency || 4
    };
  }

  addError(file: string, message: string, line?: number, column?: number): void {
    const error: ExtractionError = { file, message, line, column };
    this.errors.push(error);
    this.stats.totalErrors = (this.stats.totalErrors || 0) + 1;
    logger.error(`Extraction error in ${file}:${line || '?'}:${column || '?'} - ${message}`);
  }

  incrementStat(key: keyof ExtractionStats, value: number = 1): void {
    const current = this.stats[key] as number || 0;
    (this.stats as any)[key] = current + value;
  }

  getCacheKey(type: string, key: string): string {
    return `${type}:${key}`;
  }

  getCached<T>(type: string, key: string): T | undefined {
    if (!this.options.cache) return undefined;
    return this.cache.get(this.getCacheKey(type, key));
  }

  setCached<T>(type: string, key: string, value: T): void {
    if (!this.options.cache) return;
    this.cache.set(this.getCacheKey(type, key), value);
  }

  normalizeQueryName(name: string | undefined, content: string): string | undefined {
    if (!name || !this.options.normalizeNames) return name;
    
    const existingContent = this.seenQueryNames.get(name);
    if (!existingContent) {
      this.seenQueryNames.set(name, this.normalizeContent(content));
      return name;
    }
    
    const normalizedContent = this.normalizeContent(content);
    if (existingContent === normalizedContent) {
      return name;
    }
    
    // Generate unique name for different query
    let suffix = 1;
    let newName = `${name}_${suffix}`;
    
    while (this.seenQueryNames.has(newName)) {
      suffix++;
      newName = `${name}_${suffix}`;
    }
    
    this.seenQueryNames.set(newName, normalizedContent);
    return newName;
  }

  private normalizeContent(content: string): string {
    return content
      .replace(/#.*$/gm, '') // Remove comments
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  finalizeStats(): ExtractionStats {
    return {
      ...this.stats,
      duration: Date.now() - this.startTime
    } as ExtractionStats;
  }
}