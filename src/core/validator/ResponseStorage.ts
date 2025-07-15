import { Level } from 'level';
import { LRUCache } from 'lru-cache';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../../utils/logger.js';
import {
  CapturedResponse,
  StorageOptions,
  ValidationReport,
  AlignmentFunction
} from './types';

export class ResponseStorage {
  private cache: LRUCache<string, any>;
  private db?: Level;
  private storagePath?: string;

  constructor(private options: StorageOptions) {
    // Initialize in-memory cache regardless of storage type
    this.cache = new LRUCache({
      max: 1000, // Maximum items
      ttl: 1000 * 60 * 60, // 1 hour TTL
      sizeCalculation: (value) => JSON.stringify(value).length,
      maxSize: 50 * 1024 * 1024 // 50MB max size
    });

    this.initialize();
  }

  private async initialize(): Promise<void> {
    switch (this.options.type) {
      case 'file':
        this.storagePath = this.options.path || './validation-storage';
        await this.ensureDirectory(this.storagePath);
        break;

      case 'database':
        const dbPath = this.options.path || './validation-db';
        this.db = new Level(dbPath, { valueEncoding: 'json' });
        break;

      case 'memory':
        // Only use cache, already initialized
        break;
    }

    logger.info(`Initialized ${this.options.type} storage`);
  }

  async store(response: CapturedResponse): Promise<void> {
    const key = this.generateKey(response);
    const data = this.compress(response);

    // Always store in cache
    this.cache.set(key, data);

    // Persist based on storage type
    switch (this.options.type) {
      case 'file':
        await this.storeToFile(key, data);
        break;

      case 'database':
        await this.storeToDatabase(key, data);
        break;
    }
  }

  async retrieve(
    queryId: string, 
    version: 'baseline' | 'transformed'
  ): Promise<CapturedResponse | null> {
    const key = `response:${queryId}:${version}`;

    // Check cache first
    const cached = this.cache.get(key);
    if (cached) {
      return this.decompress(cached);
    }

    // Retrieve from persistent storage
    let data: any;
    switch (this.options.type) {
      case 'file':
        data = await this.retrieveFromFile(key);
        break;

      case 'database':
        data = await this.retrieveFromDatabase(key);
        break;

      default:
        return null;
    }

    if (data) {
      // Store in cache for future access
      this.cache.set(key, data);
      return this.decompress(data);
    }

    return null;
  }

  async storeReport(report: ValidationReport): Promise<void> {
    const key = `report:${report.id}`;
    const data = this.compress(report);

    this.cache.set(key, data);

    switch (this.options.type) {
      case 'file':
        await this.storeToFile(key, data);
        break;

      case 'database':
        await this.storeToDatabase(key, data);
        break;
    }
  }

  async retrieveReport(reportId: string): Promise<ValidationReport | null> {
    const key = `report:${reportId}`;
    
    const cached = this.cache.get(key);
    if (cached) {
      return this.decompress(cached);
    }

    let data: any;
    switch (this.options.type) {
      case 'file':
        data = await this.retrieveFromFile(key);
        break;

      case 'database':
        data = await this.retrieveFromDatabase(key);
        break;

      default:
        return null;
    }

    if (data) {
      this.cache.set(key, data);
      return this.decompress(data);
    }

    return null;
  }

  async storeAlignment(alignment: AlignmentFunction): Promise<void> {
    const key = `alignment:${alignment.queryId}`;
    const data = {
      ...alignment,
      // Don't store the actual function, just the code
      transform: undefined
    };

    this.cache.set(key, data);

    switch (this.options.type) {
      case 'file':
        await this.storeToFile(key, data);
        break;

      case 'database':
        await this.storeToDatabase(key, data);
        break;
    }
  }

  async diff(
    queryId: string,
    v1: 'baseline' | 'transformed',
    v2: 'baseline' | 'transformed'
  ): Promise<{ v1: CapturedResponse | null; v2: CapturedResponse | null }> {
    const response1 = await this.retrieve(queryId, v1);
    const response2 = await this.retrieve(queryId, v2);

    return { v1: response1, v2: response2 };
  }

  async listStoredQueries(): Promise<string[]> {
    const queries = new Set<string>();

    switch (this.options.type) {
      case 'file':
        const files = await fs.readdir(this.storagePath!);
        for (const file of files) {
          if (file.startsWith('response:')) {
            const parts = file.split(':');
            if (parts.length >= 2) {
              queries.add(parts[1]);
            }
          }
        }
        break;

      case 'database':
        if (this.db) {
          for await (const key of this.db.keys()) {
            if (key.startsWith('response:')) {
              const parts = key.split(':');
              if (parts.length >= 2) {
                queries.add(parts[1]);
              }
            }
          }
        }
        break;

      case 'memory':
        for (const key of this.cache.keys()) {
          if (key.startsWith('response:')) {
            const parts = key.split(':');
            if (parts.length >= 2) {
              queries.add(parts[1]);
            }
          }
        }
        break;
    }

    return Array.from(queries);
  }

  async cleanup(olderThan?: Date): Promise<number> {
    let cleaned = 0;
    const cutoff = olderThan || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days

    switch (this.options.type) {
      case 'file':
        const files = await fs.readdir(this.storagePath!);
        for (const file of files) {
          const filePath = path.join(this.storagePath!, file);
          const stats = await fs.stat(filePath);
          if (stats.mtime < cutoff) {
            await fs.unlink(filePath);
            cleaned++;
          }
        }
        break;

      case 'database':
        // Level doesn't store timestamps by default
        // Would need to implement custom logic
        logger.warn('Cleanup not implemented for database storage');
        break;

      case 'memory':
        // LRU cache handles cleanup automatically
        break;
    }

    // Clear old items from cache
    this.cache.clear();

    return cleaned;
  }

  async exportData(outputPath: string): Promise<void> {
    const data: Record<string, any> = {};

    // Export all stored data
    const queries = await this.listStoredQueries();
    for (const queryId of queries) {
      const baseline = await this.retrieve(queryId, 'baseline');
      const transformed = await this.retrieve(queryId, 'transformed');
      
      data[queryId] = {
        baseline,
        transformed
      };
    }

    await fs.writeFile(
      outputPath,
      JSON.stringify(data, null, 2),
      'utf-8'
    );

    logger.info(`Exported ${queries.length} queries to ${outputPath}`);
  }

  async importData(inputPath: string): Promise<void> {
    const content = await fs.readFile(inputPath, 'utf-8');
    const data = JSON.parse(content);

    let imported = 0;
    for (const [queryId, responses] of Object.entries(data)) {
      if ((responses as any).baseline) {
        await this.store((responses as any).baseline);
        imported++;
      }
      if ((responses as any).transformed) {
        await this.store((responses as any).transformed);
        imported++;
      }
    }

    logger.info(`Imported ${imported} responses from ${inputPath}`);
  }

  private generateKey(response: CapturedResponse): string {
    return `response:${response.queryId}:${response.version}`;
  }

  private compress(data: any): any {
    if (!this.options.compression) return data;

    // Simple compression: remove null/undefined values
    const compressed = JSON.parse(JSON.stringify(data, (key, value) => {
      if (value === null || value === undefined) return undefined;
      return value;
    }));

    return compressed;
  }

  private decompress(data: any): any {
    // Currently no decompression needed
    return data;
  }

  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  private async storeToFile(key: string, data: any): Promise<void> {
    const filename = key.replace(/:/g, '-') + '.json';
    const filePath = path.join(this.storagePath!, filename);
    
    await fs.writeFile(
      filePath,
      JSON.stringify(data, null, 2),
      'utf-8'
    );
  }

  private async retrieveFromFile(key: string): Promise<any | null> {
    const filename = key.replace(/:/g, '-') + '.json';
    const filePath = path.join(this.storagePath!, filename);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  private async storeToDatabase(key: string, data: any): Promise<void> {
    if (!this.db) return;
    await this.db.put(key, data);
  }

  private async retrieveFromDatabase(key: string): Promise<any | null> {
    if (!this.db) return null;

    try {
      return await this.db.get(key);
    } catch (error) {
      return null;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
    }
    this.cache.clear();
  }
} 