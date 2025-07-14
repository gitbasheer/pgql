import { describe, bench, beforeAll } from 'vitest';
import { QueryNamesConverter } from '../../cli/convert-querynames';
import { MigrationValidator } from '../../cli/validate-migration';
import { createDefaultQueryServices } from '../../core/extraction/services/QueryServicesFactory';
import { PatternExtractedQuery } from '../../core/extraction/types/pattern.types';
import { GraphQLExtractor } from '../../core/scanner/GraphQLExtractor';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Pattern Migration Performance', () => {
  let sampleQueries: string[];
  let largeSampleQueries: string[];
  let patternQueries: PatternExtractedQuery[];
  let queryServices: Awaited<ReturnType<typeof createDefaultQueryServices>>;

  beforeAll(async () => {
    // Generate sample data for benchmarks
    sampleQueries = generateSampleQueries(100);
    largeSampleQueries = generateSampleQueries(1000);

    // Create pattern queries
    patternQueries = sampleQueries.map((query, index) => ({
      id: `query-${index}`,
      name: `Query${index}`,
      source: query,
      type: 'query' as const,
      filePath: `test${index}.ts`,
      fragments: [],
      namePattern: undefined,
      resolvedName: `Query${index}`,
      contentFingerprint: '',
      patternMetadata: {
        isDynamic: query.includes('${'),
        hasInterpolation: query.includes('${'),
        confidence: 1.0
      }
    }));

    // Initialize services
    queryServices = await createDefaultQueryServices({
      projectRoot: '.',
      enableIncrementalExtraction: true,
      cacheConfig: {
        memoryLimit: 50 * 1024 * 1024,
        ttl: 30 * 60 * 1000,
      }
    });
  });

  describe('Content Fingerprinting', () => {
    bench('MD5 fingerprint generation - 100 queries', () => {
      for (const query of sampleQueries) {
        const normalized = query.replace(/\s+/g, ' ').trim();
        crypto.createHash('md5').update(normalized).digest('hex');
      }
    });

    bench('SHA256 fingerprint generation - 100 queries', () => {
      for (const query of sampleQueries) {
        const normalized = query.replace(/\s+/g, ' ').trim();
        crypto.createHash('sha256').update(normalized).digest('hex');
      }
    });

    bench('Simple hash fingerprint generation - 100 queries', () => {
      for (const query of sampleQueries) {
        const normalized = query.replace(/\s+/g, ' ').trim();
        generateSimpleHash(normalized);
      }
    });

    bench('Content fingerprinting with normalization - 100 queries', () => {
      for (const query of sampleQueries) {
        const normalized = query
          .replace(/\s+/g, ' ')
          .replace(/\$\{[^}]+\}/g, '${...}')
          .trim();
        crypto.createHash('md5').update(normalized).digest('hex');
      }
    });
  });

  describe('Pattern Detection', () => {
    bench('Pattern detection - 100 queries', () => {
      for (const query of sampleQueries) {
        detectPatternUsage(query);
      }
    });

    bench('Dynamic pattern analysis - 100 queries', () => {
      for (const query of sampleQueries) {
        analyzeDynamicPatterns(query);
      }
    });

    bench('Interpolation detection - 100 queries', () => {
      for (const query of sampleQueries) {
        query.includes('${');
        query.match(/\$\{[^}]+\}/g)?.length || 0;
      }
    });
  });

  describe('Query Processing', () => {
    bench('Pattern-based query processing - 100 queries', async () => {
      for (const query of patternQueries) {
        queryServices.namingService.processQuery(query);
      }
    });

    bench('Cache hit performance - 100 queries', async () => {
      // First pass - populate cache
      for (const query of patternQueries.slice(0, 50)) {
        queryServices.namingService.processQuery(query);
      }

      // Second pass - cache hits
      for (const query of patternQueries.slice(0, 50)) {
        queryServices.namingService.processQuery(query);
      }
    });

    bench('Large dataset processing - 1000 queries', async () => {
      const largePatternQueries = largeSampleQueries.map((query, index) => ({
        id: `large-query-${index}`,
        name: `LargeQuery${index}`,
        source: query,
        type: 'query' as const,
        filePath: `large-test${index}.ts`,
        fragments: [],
        namePattern: undefined,
        resolvedName: `LargeQuery${index}`,
        contentFingerprint: '',
        patternMetadata: {
          isDynamic: query.includes('${'),
          hasInterpolation: query.includes('${'),
          confidence: 1.0
        }
      }));

      for (const query of largePatternQueries) {
        queryServices.namingService.processQuery(query);
      }
    });
  });

  describe('Migration Validation', () => {
    bench('Query comparison - 100 pairs', async () => {
      const validator = new MigrationValidator();

      for (let i = 0; i < 100; i++) {
        const beforeQuery = patternQueries[i];
        const afterQuery = { ...patternQueries[i], name: `Modified${i}` };

        // @ts-ignore - accessing private method for benchmark
        await validator.compareQueries(beforeQuery, afterQuery, { strictMode: false });
      }
    });

    bench('Content normalization - 100 queries', () => {
      for (const query of sampleQueries) {
        query
          .replace(/\s+/g, ' ')
          .replace(/\$\{[^}]+\}/g, '${...}')
          .trim();
      }
    });
  });

  describe('Service Factory Performance', () => {
    bench('Service initialization', async () => {
      await createDefaultQueryServices({
        projectRoot: '.',
        enableIncrementalExtraction: false,
        cacheConfig: {
          memoryLimit: 10 * 1024 * 1024,
          ttl: 10 * 60 * 1000,
        }
      });
    });

    bench('Service initialization with cache', async () => {
      await createDefaultQueryServices({
        projectRoot: '.',
        enableIncrementalExtraction: true,
        cacheConfig: {
          memoryLimit: 50 * 1024 * 1024,
          ttl: 30 * 60 * 1000,
        }
      });
    });
  });

  describe('Memory Usage', () => {
    bench('Memory-efficient processing - 1000 queries', async () => {
      const queries = largeSampleQueries.map((query, index) => ({
        id: `mem-query-${index}`,
        name: `MemQuery${index}`,
        source: query,
        type: 'query' as const,
        filePath: `mem-test${index}.ts`,
        fragments: [],
        namePattern: undefined,
        resolvedName: `MemQuery${index}`,
        contentFingerprint: generateSimpleHash(query).toString(36),
        patternMetadata: {
          isDynamic: query.includes('${'),
          hasInterpolation: query.includes('${'),
          confidence: 1.0
        }
      }));

      // Process in batches to measure memory efficiency
      const batchSize = 100;
      for (let i = 0; i < queries.length; i += batchSize) {
        const batch = queries.slice(i, i + batchSize);
        for (const query of batch) {
          queryServices.namingService.processQuery(query);
        }
      }
    });
  });

  describe('Comparison: Old vs New System', () => {
    bench('Legacy normalization approach - 100 queries', () => {
      const seenNames = new Map<string, string>();

      for (let i = 0; i < 100; i++) {
        const query = sampleQueries[i];
        const name = `Query${i}`;

        // Simulate old normalization logic
        const normalizedContent = query.replace(/\s+/g, ' ').trim();
        const existingContent = seenNames.get(name);

        if (!existingContent) {
          seenNames.set(name, normalizedContent);
        } else if (existingContent !== normalizedContent) {
          let suffix = 1;
          let newName = `${name}_${suffix}`;
          while (seenNames.has(newName)) {
            suffix++;
            newName = `${name}_${suffix}`;
          }
          seenNames.set(newName, normalizedContent);
        }
      }
    });

    bench('Pattern-based approach - 100 queries', async () => {
      for (let i = 0; i < 100; i++) {
        const query = patternQueries[i];
        queryServices.namingService.processQuery(query);
      }
    });
  });
});

// Helper functions
function generateSampleQueries(count: number): string[] {
  const templates = [
    'query GetUser($id: ID!) { user(id: $id) { id name email } }',
    'query GetVenture($id: ID!) { venture(id: $id) { id name description } }',
    'mutation UpdateUser($input: UserInput!) { updateUser(input: $input) { id name } }',
    'query GetProjects { projects { id name status } }',
    'query GetUserWithVentures($userId: ID!) { user(id: $userId) { id ventures { id name } } }',
    'query ${queryNames.getUserById} { user { id name } }',
    'query ${queryNames.getVentureByDomain} { venture { id domain } }',
    'query ComplexQuery($filter: FilterInput!) { items(filter: $filter) { ...FragmentA ...FragmentB } }'
  ];

  const queries: string[] = [];
  for (let i = 0; i < count; i++) {
    const template = templates[i % templates.length];
    const variation = template.replace(/Query\d*/, `Query${i}`);
    queries.push(variation);
  }

  return queries;
}

function generateSimpleHash(content: string): number {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

function detectPatternUsage(query: string): boolean {
  return query.includes('${queryNames.') || query.includes('${variables.');
}

function analyzeDynamicPatterns(query: string): {
  isDynamic: boolean;
  hasInterpolation: boolean;
  patternCount: number;
} {
  const hasInterpolation = query.includes('${');
  const patterns = query.match(/\$\{[^}]+\}/g) || [];
  const isDynamic = patterns.some(p => p.includes('queryNames') || p.includes('variables'));

  return {
    isDynamic,
    hasInterpolation,
    patternCount: patterns.length
  };
}
