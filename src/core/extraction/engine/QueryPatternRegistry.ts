// @ts-nocheck
import { logger } from '../../../utils/logger.js';
import {
  QueryPatternRegistry,
  PatternExtractedQuery,
  QueryPattern,
  MigrationManifest,
  QueryFingerprint,
} from '../types/pattern.types.js';
import { createHash } from 'crypto';
import { DocumentNode, print, visit } from 'graphql';

export class QueryPatternService {
  private registry: QueryPatternRegistry = {};
  private migrationManifest: MigrationManifest = {
    patterns: {},
    globalReplacements: [],
  };
  private patternCache = new Map<string, QueryPattern>();

  constructor() {
    this.initializeDefaultRegistry();
  }

  private initializeDefaultRegistry(): void {
    // Example registry structure
    this.registry = {
      getVentureById: {
        versions: ['V1', 'V2', 'V3', 'V3Airo'],
        names: {
          V1: 'getVentureHomeDataByVentureIdDashboard',
          V2: 'getVentureHomeDataByVentureIdDashboardV2',
          V3: 'getVentureHomeDataByVentureIdDashboardV3',
          V3Airo: 'getVentureHomeDataByVentureIdDashboardV3Airo',
        },
        deprecations: {
          V1: 'Use V3',
          V2: 'Use V3',
        },
        fragments: {
          V1: 'ventureFields',
          V2: 'ventureFields',
          V3: 'ventureInfinityStoneDataFields',
          V3Airo: 'ventureInfinityStoneDataFields',
        },
        conditions: {
          V3: ['infinityStoneEnabled'],
          V3Airo: ['infinityStoneEnabled', 'airoFeatureEnabled'],
        },
      },
    };

    this.migrationManifest = {
      patterns: {
        'queryNames.byIdV1': {
          to: 'queryNames.byIdV3',
          fragments: {
            old: 'ventureFields',
            new: 'ventureInfinityStoneDataFields',
          },
          conditions: ['infinityStoneEnabled'],
          deprecationReason: 'V1 is deprecated, use V3 with infinity stone support',
        },
        'queryNames.byIdV2': {
          to: 'queryNames.byIdV3',
          fragments: {
            old: 'ventureFields',
            new: 'ventureInfinityStoneDataFields',
          },
          conditions: ['infinityStoneEnabled'],
          deprecationReason: 'V2 is deprecated, use V3 with infinity stone support',
        },
      },
      globalReplacements: [
        {
          from: 'ventureFields',
          to: 'ventureInfinityStoneDataFields',
          type: 'fragment',
        },
      ],
    };
  }

  /**
   * Analyze a query to extract pattern information instead of normalizing names
   */
  analyzeQueryPattern(query: PatternExtractedQuery): PatternExtractedQuery {
    // Check if this query uses dynamic naming patterns
    const patternInfo = this.detectNamePattern(query);

    if (patternInfo) {
      query.namePattern = patternInfo;
      query.contentFingerprint = this.generateContentFingerprint(query);

      logger.debug(`Detected pattern for query: ${query.name || 'unnamed'}`, {
        template: patternInfo.template,
        version: patternInfo.version,
        deprecated: patternInfo.isDeprecated,
      });
    } else {
      // Try to detect patterns from query content even without sourceAST
      const contentPatternInfo = this.detectPatternFromContent(query);
      if (contentPatternInfo) {
        query.namePattern = contentPatternInfo;
      }

      // For all queries, generate fingerprint for duplicate detection
      query.contentFingerprint = this.generateContentFingerprint(query);
    }

    return query;
  }

  /**
   * Detect if a query uses dynamic naming patterns
   */
  private detectNamePattern(
    query: PatternExtractedQuery,
  ): PatternExtractedQuery['namePattern'] | undefined {
    if (!query.sourceAST?.templateLiteral) {
      return undefined;
    }

    const { templateLiteral } = query.sourceAST;

    // Look for queryNames usage in template expressions
    for (let i = 0; i < templateLiteral.expressions.length; i++) {
      const expr = templateLiteral.expressions[i];

      if (
        expr.type === 'MemberExpression' &&
        expr.object.type === 'Identifier' &&
        expr.object.name === 'queryNames' &&
        expr.property.type === 'Identifier'
      ) {
        const propertyName = expr.property.name;
        const template = `\${queryNames.${propertyName}}`;

        // Find the corresponding pattern in registry
        const patternInfo = this.findPatternByProperty(propertyName);

        if (patternInfo) {
          return {
            template,
            resolvedName: patternInfo.resolvedName,
            possibleValues: patternInfo.possibleValues,
            patternKey: patternInfo.patternKey,
            version: patternInfo.version,
            isDeprecated: patternInfo.isDeprecated,
            migrationPath: patternInfo.migrationPath,
          };
        }
      }
    }

    return undefined;
  }

  /**
   * Detect patterns from query content (fallback when no sourceAST)
   */
  private detectPatternFromContent(
    query: PatternExtractedQuery,
  ): PatternExtractedQuery['namePattern'] | undefined {
    // Look for ${queryNames.xxx} patterns in the content
    const patternMatch = query.content.match(/\$\{queryNames\.(\w+)\}/);
    if (!patternMatch) return undefined;

    const propertyName = patternMatch[1];
    const template = `\${queryNames.${propertyName}}`;

    // Find the corresponding pattern in registry
    const patternInfo = this.findPatternByProperty(propertyName);

    if (patternInfo) {
      return {
        template,
        resolvedName: patternInfo.resolvedName,
        possibleValues: patternInfo.possibleValues,
        patternKey: patternInfo.patternKey,
        version: patternInfo.version,
        isDeprecated: patternInfo.isDeprecated,
        migrationPath: patternInfo.migrationPath,
      };
    }

    return undefined;
  }

  /**
   * Find pattern information by queryNames property
   */
  private findPatternByProperty(propertyName: string):
    | {
        resolvedName: string;
        possibleValues: string[];
        patternKey: string;
        version: string;
        isDeprecated: boolean;
        migrationPath?: string;
      }
    | undefined {
    // Map property names to registry patterns
    const propertyToPattern: Record<string, { key: string; version: string }> = {
      byIdV1: { key: 'getVentureById', version: 'V1' },
      byIdV2: { key: 'getVentureById', version: 'V2' },
      byIdV3: { key: 'getVentureById', version: 'V3' },
      byIdV3Airo: { key: 'getVentureById', version: 'V3Airo' },
    };

    const mapping = propertyToPattern[propertyName];
    if (!mapping) return undefined;

    const pattern = this.registry[mapping.key];
    if (!pattern) return undefined;

    const resolvedName = pattern.names[mapping.version];
    const isDeprecated = !!pattern.deprecations[mapping.version];
    const migrationPath = isDeprecated
      ? this.findMigrationTarget(mapping.key, mapping.version)
      : undefined;

    return {
      resolvedName,
      possibleValues: Object.values(pattern.names),
      patternKey: mapping.key,
      version: mapping.version,
      isDeprecated,
      migrationPath,
    };
  }

  /**
   * Find migration target for deprecated patterns
   */
  private findMigrationTarget(patternKey: string, version: string): string | undefined {
    const pattern = this.registry[patternKey];
    if (!pattern) return undefined;

    // Find the latest non-deprecated version
    const latestVersion = pattern.versions.find((v) => !pattern.deprecations[v]);
    return latestVersion || pattern.versions[pattern.versions.length - 1];
  }

  /**
   * Generate content fingerprint for duplicate detection
   */
  generateContentFingerprint(query: PatternExtractedQuery): string {
    // For pattern queries, normalize by removing the dynamic parts
    let normalizedContent = query.content;

    // Replace pattern interpolations with a placeholder for fingerprinting
    normalizedContent = normalizedContent.replace(/\$\{[^}]+\}/g, '${PATTERN}');

    // If we have an AST, try to use it for better normalization
    if (query.ast) {
      try {
        // Normalize the AST by removing names and locations
        const normalizedAST = this.normalizeAST(query.ast);
        normalizedContent = print(normalizedAST);
        // Still replace any remaining patterns after AST normalization
        normalizedContent = normalizedContent.replace(/\$\{[^}]+\}/g, '${PATTERN}');
      } catch (error) {
        logger.warn(`Failed to generate AST fingerprint for query: ${error}`);
        // Fall back to string normalization
      }
    }

    return this.hashContent(normalizedContent);
  }

  /**
   * Normalize AST structure for fingerprinting
   */
  private normalizeAST(ast: DocumentNode): DocumentNode {
    return visit(ast, {
      Name: (node) => {
        // Remove operation names for structure comparison
        if (node.value.match(/^(query|mutation|subscription)/)) {
          return undefined;
        }
        return node;
      },
      // Remove location information
      enter: (node) => {
        if ('loc' in node) {
          delete node.loc;
        }
        return node;
      },
    });
  }

  /**
   * Hash content for fingerprinting
   */
  private hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Group queries by content fingerprint to find duplicates
   */
  groupByFingerprint(queries: PatternExtractedQuery[]): Map<string, PatternExtractedQuery[]> {
    const groups = new Map<string, PatternExtractedQuery[]>();

    for (const query of queries) {
      const fingerprint = query.contentFingerprint || this.generateContentFingerprint(query);

      if (!groups.has(fingerprint)) {
        groups.set(fingerprint, []);
      }
      groups.get(fingerprint)!.push(query);
    }

    return groups;
  }

  /**
   * Get migration recommendations for a query
   */
  getMigrationRecommendations(query: PatternExtractedQuery): {
    shouldMigrate: boolean;
    targetPattern?: string;
    reason?: string;
    fragmentChanges?: { from: string; to: string };
  } {
    if (!query.namePattern?.isDeprecated) {
      return { shouldMigrate: false };
    }

    const { patternKey, version } = query.namePattern;
    const migrationKey = `queryNames.${this.getPropertyName(patternKey, version)}`;
    const migration = this.migrationManifest.patterns[migrationKey];

    if (!migration) {
      return { shouldMigrate: false };
    }

    // Convert old/new structure to from/to for compatibility with tests
    const fragmentChanges = migration.fragments
      ? {
          from: migration.fragments.old,
          to: migration.fragments.new,
        }
      : undefined;

    return {
      shouldMigrate: true,
      targetPattern: migration.to,
      reason: migration.deprecationReason,
      fragmentChanges,
    };
  }

  /**
   * Get property name for pattern and version
   */
  private getPropertyName(patternKey: string, version: string): string {
    // This is a reverse mapping - in practice, you'd maintain this mapping
    const mapping: Record<string, Record<string, string>> = {
      getVentureById: {
        V1: 'byIdV1',
        V2: 'byIdV2',
        V3: 'byIdV3',
        V3Airo: 'byIdV3Airo',
      },
    };

    return mapping[patternKey]?.[version] || 'unknown';
  }

  /**
   * Load patterns from external configuration
   */
  async loadPatterns(configPath: string): Promise<void> {
    try {
      // In a real implementation, this would load from a configuration file
      // For now, we'll use the initialized defaults
      logger.info('Using default pattern registry');
    } catch (error) {
      logger.warn(`Failed to load patterns from ${configPath}: ${error}`);
    }
  }

  /**
   * Get all registered patterns
   */
  getRegisteredPatterns(): QueryPatternRegistry {
    return { ...this.registry };
  }

  /**
   * Get migration manifest
   */
  getMigrationManifest(): MigrationManifest {
    return { ...this.migrationManifest };
  }
}
