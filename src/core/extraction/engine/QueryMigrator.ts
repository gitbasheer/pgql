// @ts-nocheck
import { logger } from '../../../utils/logger';
import { PatternExtractedQuery, MigrationManifest, QueryPatternRegistry } from '../types/pattern.types';
import { QueryPatternService } from './QueryPatternRegistry';

export interface MigrationResult {
  query: PatternExtractedQuery;
  migrationNotes: {
    currentVersion: string;
    targetVersion: string;
    action: 'Update queryNames object' | 'Update query string' | 'No migration needed';
    changes: Array<{
      type: 'queryNames' | 'fragment' | 'directive';
      from: string;
      to: string;
      reason: string;
    }>;
  };
  requiresManualReview: boolean;
}

export interface MigrationStrategy {
  preserveApplicationLogic: boolean;
  updateQueryNamesObject: boolean;
  trackVersionProgression: boolean;
  respectFeatureFlags: boolean;
}

export class QueryMigrator {
  private patternService: QueryPatternService;
  private strategy: MigrationStrategy;

  constructor(patternService: QueryPatternService, strategy: Partial<MigrationStrategy> = {}) {
    this.patternService = patternService;
    this.strategy = {
      preserveApplicationLogic: true,
      updateQueryNamesObject: true,
      trackVersionProgression: true,
      respectFeatureFlags: true,
      ...strategy
    };
  }

  /**
   * Main migration method that handles pattern-based migrations
   */
  async migrateQuery(query: PatternExtractedQuery): Promise<MigrationResult> {
    // Check if this query uses dynamic patterns
    if (query.namePattern) {
      return this.migratePatternQuery(query);
    }

    // Handle static queries normally
    return this.migrateStaticQuery(query);
  }

  /**
   * Migrate queries with dynamic patterns
   */
  private async migratePatternQuery(query: PatternExtractedQuery): Promise<MigrationResult> {
    const { namePattern } = query;
    if (!namePattern) {
      throw new Error('Expected namePattern for pattern query');
    }

    const recommendations = this.patternService.getMigrationRecommendations(query);

    if (!recommendations.shouldMigrate) {
      return {
        query,
        migrationNotes: {
          currentVersion: namePattern.version,
          targetVersion: namePattern.version,
          action: 'No migration needed',
          changes: []
        },
        requiresManualReview: false
      };
    }

    const changes: MigrationResult['migrationNotes']['changes'] = [];

    // For dynamic patterns, we don't change the query string
    // Instead, we track what needs to be updated in the queryNames object
    if (recommendations.targetPattern) {
      changes.push({
        type: 'queryNames',
        from: namePattern.template,
        to: recommendations.targetPattern,
        reason: recommendations.reason || `${namePattern.version} is deprecated, use ${this.extractVersionFromPattern(recommendations.targetPattern)}`
      });
    }

    // Track fragment changes
    if (recommendations.fragmentChanges) {
      changes.push({
        type: 'fragment',
        from: recommendations.fragmentChanges.from,
        to: recommendations.fragmentChanges.to,
        reason: 'Fragment upgrade for feature compatibility'
      });
    }

    return {
      query: {
        ...query,
        // Don't modify the query itself - preserve the template
        migrationNotes: {
          preservedTemplate: namePattern.template,
          targetVersion: this.extractVersionFromPattern(recommendations.targetPattern),
          originalVersion: namePattern.version
        }
      },
      migrationNotes: {
        currentVersion: namePattern.version,
        targetVersion: this.extractVersionFromPattern(recommendations.targetPattern),
        action: 'Update queryNames object',
        changes
      },
      requiresManualReview: this.requiresManualReview(query, changes)
    };
  }

  /**
   * Migrate static queries (fallback for queries without patterns)
   */
  private async migrateStaticQuery(query: PatternExtractedQuery): Promise<MigrationResult> {
    // For static queries, we might still need to update fragments or directives
    const globalReplacements = this.patternService.getMigrationManifest().globalReplacements;
    const changes: MigrationResult['migrationNotes']['changes'] = [];

    let updatedContent = query.content;

    for (const replacement of globalReplacements) {
      if (updatedContent.includes(replacement.from)) {
        changes.push({
          type: replacement.type as 'fragment' | 'directive',
          from: replacement.from,
          to: replacement.to,
          reason: `Global ${replacement.type} replacement`
        });
        updatedContent = updatedContent.replace(
          new RegExp(replacement.from, 'g'),
          replacement.to
        );
      }
    }

    const requiresUpdate = changes.length > 0;

    return {
      query: requiresUpdate ? { ...query, content: updatedContent } : query,
      migrationNotes: {
        currentVersion: 'static',
        targetVersion: 'static',
        action: requiresUpdate ? 'Update query string' : 'No migration needed',
        changes
      },
      requiresManualReview: requiresUpdate
    };
  }

  /**
   * Batch migrate multiple queries
   */
  async migrateQueries(queries: PatternExtractedQuery[]): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];

    for (const query of queries) {
      try {
        const result = await this.migrateQuery(query);
        results.push(result);
      } catch (error) {
        logger.error(`Failed to migrate query ${query.id}: ${error}`);
        results.push({
          query,
          migrationNotes: {
            currentVersion: 'unknown',
            targetVersion: 'unknown',
            action: 'No migration needed',
            changes: []
          },
          requiresManualReview: true
        });
      }
    }

    return results;
  }

  /**
   * Generate migration summary
   */
  generateMigrationSummary(results: MigrationResult[]): {
    totalQueries: number;
    needsMigration: number;
    requiresManualReview: number;
    patternBasedMigrations: number;
    staticMigrations: number;
    versionProgression: Record<string, number>;
    changes: {
      queryNames: number;
      fragments: number;
      directives: number;
    };
  } {
    const summary = {
      totalQueries: results.length,
      needsMigration: 0,
      requiresManualReview: 0,
      patternBasedMigrations: 0,
      staticMigrations: 0,
      versionProgression: {} as Record<string, number>,
      changes: {
        queryNames: 0,
        fragments: 0,
        directives: 0
      }
    };

    for (const result of results) {
      const { migrationNotes, requiresManualReview } = result;

      if (migrationNotes.action !== 'No migration needed') {
        summary.needsMigration++;
      }

      if (requiresManualReview) {
        summary.requiresManualReview++;
      }

      if (migrationNotes.action === 'Update queryNames object') {
        summary.patternBasedMigrations++;
      } else if (migrationNotes.action === 'Update query string') {
        summary.staticMigrations++;
      }

      // Track version progression for pattern-based migrations
      if (migrationNotes.action === 'Update queryNames object' && 
          migrationNotes.currentVersion !== migrationNotes.targetVersion) {
        const progression = `${migrationNotes.currentVersion} → ${migrationNotes.targetVersion}`;
        summary.versionProgression[progression] = (summary.versionProgression[progression] || 0) + 1;
      }

      // Count changes by type
      for (const change of migrationNotes.changes) {
        if (change.type === 'queryNames') {
          summary.changes.queryNames++;
        } else if (change.type === 'fragment') {
          summary.changes.fragments++;
        } else if (change.type === 'directive') {
          summary.changes.directives++;
        }
      }
    }

    return summary;
  }

  /**
   * Generate queryNames object updates
   */
  generateQueryNamesUpdates(results: MigrationResult[]): {
    currentQueryNames: Record<string, string>;
    updatedQueryNames: Record<string, string>;
    changes: Array<{
      property: string;
      from: string;
      to: string;
      reason: string;
    }>;
  } {
    const currentQueryNames: Record<string, string> = {};
    const updatedQueryNames: Record<string, string> = {};
    const changes: Array<{ property: string; from: string; to: string; reason: string }> = [];

    const registry = this.patternService.getRegisteredPatterns();

    // Build current queryNames from registry
    for (const [patternKey, pattern] of Object.entries(registry)) {
      for (const [version, name] of Object.entries(pattern.names)) {
        const property = this.getPropertyName(patternKey, version);
        currentQueryNames[property] = name;
        updatedQueryNames[property] = name; // Start with current
      }
    }

    // Apply migrations
    for (const result of results) {
      // Check if this query has a deprecated pattern
      if (result.query.namePattern?.isDeprecated) {
        const pattern = result.query.namePattern;
        const propertyName = this.getPropertyName(pattern.patternKey, pattern.version);
        
        if (propertyName !== 'unknown' && currentQueryNames[propertyName]) {
          // Find the target property name
          const targetVersion = pattern.migrationPath || 'V3';
          const targetProperty = this.getPropertyName(pattern.patternKey, targetVersion);
          
          if (targetProperty !== 'unknown' && currentQueryNames[targetProperty]) {
            changes.push({
              property: propertyName,
              from: currentQueryNames[propertyName],
              to: currentQueryNames[targetProperty],
              reason: `${pattern.version} is deprecated, use ${targetVersion}`
            });
            // Update the property to point to the new version
            updatedQueryNames[propertyName] = currentQueryNames[targetProperty];
          }
        }
      }
      
      // Also apply explicit migration changes
      for (const change of result.migrationNotes.changes) {
        if (change.type === 'queryNames') {
          const fromMatch = change.from.match(/\${queryNames\.(\w+)}/);
          const toMatch = change.to.match(/queryNames\.(\w+)/); // Remove ${} from pattern

          if (fromMatch && toMatch) {
            const fromProperty = fromMatch[1];
            const toProperty = toMatch[1];

            if (currentQueryNames[fromProperty] && currentQueryNames[toProperty]) {
              // Only add if not already added above
              const existingChange = changes.find(c => c.property === fromProperty);
              if (!existingChange) {
                changes.push({
                  property: fromProperty,
                  from: currentQueryNames[fromProperty],
                  to: currentQueryNames[toProperty],
                  reason: change.reason
                });
                // Update the target property to be used instead
                updatedQueryNames[fromProperty] = currentQueryNames[toProperty];
              }
            }
          }
        }
      }
    }

    return {
      currentQueryNames,
      updatedQueryNames,
      changes
    };
  }

  /**
   * Extract version from pattern string
   */
  private extractVersionFromPattern(pattern?: string): string {
    if (!pattern) return 'unknown';

    // Handle both ${queryNames.xxx} and queryNames.xxx formats
    let property: string;
    const fullMatch = pattern.match(/\${queryNames\.(\w+)}/);
    const simpleMatch = pattern.match(/queryNames\.(\w+)/);
    
    if (fullMatch) {
      property = fullMatch[1];
    } else if (simpleMatch) {
      property = simpleMatch[1];
    } else {
      return 'unknown';
    }

    // Extract version from property name (e.g., byIdV3 -> V3)
    const versionMatch = property.match(/V(\d+(?:\w+)?)/);
    return versionMatch ? versionMatch[0] : 'unknown';
  }

  /**
   * Get property name for pattern and version
   */
  private getPropertyName(patternKey: string, version: string): string {
    // This should match the mapping in QueryPatternService
    const mapping: Record<string, Record<string, string>> = {
      'getVentureById': {
        'V1': 'byIdV1',
        'V2': 'byIdV2',
        'V3': 'byIdV3',
        'V3Airo': 'byIdV3Airo'
      }
    };

    return mapping[patternKey]?.[version] || 'unknown';
  }

  /**
   * Determine if a migration requires manual review
   */
  private requiresManualReview(query: PatternExtractedQuery, changes: MigrationResult['migrationNotes']['changes']): boolean {
    // Require manual review if:
    // 1. There are multiple version jumps (e.g., V1 -> V3)
    // 2. Fragment changes are involved
    // 3. Complex feature flag conditions are present

    const hasFragmentChanges = changes.some(c => c.type === 'fragment');
    const hasComplexMigration = query.namePattern?.version === 'V1' &&
                               changes.some(c => c.to.includes('V3'));

    return hasFragmentChanges || hasComplexMigration;
  }
}
