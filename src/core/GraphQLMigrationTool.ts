import { GraphQLSchema, buildSchema } from 'graphql';
import { GraphQLExtractor } from './scanner/GraphQLExtractor.js';
import { SchemaAnalyzer } from './analyzer/SchemaAnalyzer.js';
import { TypeSafeTransformer } from './transformer/TypeSafeTransformer.js';
import { PatternMatcher } from './analyzer/PatternMatcher.js';
import { Config, loadConfig } from './config/ConfigValidator.js';
import { ASTCodeApplicator, TransformationMapping, SourceMapping } from './applicator/index.js';
import * as fs from 'fs/promises';
import { logger } from '../utils/logger.js';

export interface MigrationOptions {
  schemaPath: string;
  targetPath: string;
  configPath?: string;
  dryRun?: boolean;
  interactive?: boolean;
  generateTypes?: boolean;
}

export interface MigrationResult {
  success: boolean;
  totalQueries: number;
  transformedQueries: number;
  errors: MigrationError[];
  warnings: string[];
  duration: number;
}

export interface MigrationError {
  file: string;
  query: string;
  error: string;
}

export class GraphQLMigrationTool {
  private schema!: GraphQLSchema;
  private config!: Config;
  private extractor: GraphQLExtractor;
  private analyzer!: SchemaAnalyzer;
  private patternMatcher: PatternMatcher;

  constructor(private options: MigrationOptions) {
    this.extractor = new GraphQLExtractor();
    this.patternMatcher = new PatternMatcher();
  }

  async run(): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: true,
      totalQueries: 0,
      transformedQueries: 0,
      errors: [],
      warnings: [],
      duration: 0
    };

    try {
      // Load configuration
      this.config = await loadConfig(this.options.configPath);
      
      // Load schema
      await this.loadSchema();
      
      // Extract queries
      const queries = await this.extractor.extractFromDirectory(
        this.options.targetPath,
        this.config.scanner.include
      );
      
      result.totalQueries = queries.length;
      logger.info(`Found ${queries.length} GraphQL operations`);
      
      // Analyze patterns
      for (const query of queries) {
        const pattern = this.patternMatcher.analyzeQueryPattern(query.ast);
        logger.debug(`Query ${query.name} has pattern: ${pattern.type}`);
      }
      
      // Generate migration rules
      const rules = this.analyzer.generateMigrationRules();
      logger.info(`Generated ${rules.length} migration rules`);
      
      // Transform queries
      const transformer = new TypeSafeTransformer(this.schema, rules);
      
      for (const query of queries) {
        try {
          const transformResult = transformer.transform(query.content, {
            file: query.filePath,
            schema: this.schema,
            options: {
              preserveAliases: this.config.transformer.preserveFormatting,
              addTypeAnnotations: this.config.transformer.generateTypeAnnotations,
              generateTests: this.config.output.generateTests
            }
          });

          if (transformResult.isOk()) {
            result.transformedQueries++;
            
            if (!this.options.dryRun) {
              await this.applyTransformation(query.filePath, query, transformResult.value);
            }
            
            // Add warnings
            transformResult.value.warnings.forEach(w => 
              result.warnings.push(`${query.filePath}: ${w.message}`)
            );
          } else {
            result.errors.push({
              file: query.filePath,
              query: query.name || 'unnamed',
              error: transformResult.error.type
            });
          }
        } catch (error) {
          result.success = false;
          result.errors.push({
            file: query.filePath,
            query: query.name || 'unnamed',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      // Generate report
      if (this.config.output.format !== 'json') {
        await this.generateReport(result);
      }
      
    } catch (error) {
      result.success = false;
      logger.error('Migration failed:', error);
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  private async loadSchema(): Promise<void> {
    const schemaContent = await fs.readFile(this.options.schemaPath, 'utf-8');
    this.schema = buildSchema(schemaContent);
    this.analyzer = new SchemaAnalyzer(this.schema);
    logger.info('Schema loaded successfully');
  }

  private async applyTransformation(
    filePath: string,
    query: any,
    result: any
  ): Promise<void> {
    // Use AST-based application if source AST is available
    if (query.sourceAST) {
      const applicator = new ASTCodeApplicator({
        preserveFormatting: true,
        preserveComments: true,
        validateChanges: true,
        dryRun: false
      });
      
      const sourceMapping: SourceMapping = {
        astNode: query.sourceAST,
        filePath: filePath,
        originalContent: query.content
      };
      
      const transformationMapping: TransformationMapping = {
        queryId: query.id || 'unknown',
        sourceMapping,
        transformation: {
          original: result.originalCode,
          transformed: result.transformedCode,
          ast: query.ast,
          changes: [],
          rules: []
        },
        preserveInterpolations: true
      };
      
      const applyResult = await applicator.applyTransformations(filePath, [transformationMapping]);
      
      if (applyResult.success) {
        await fs.writeFile(filePath, applyResult.newContent);
        logger.info(`Updated ${filePath} with minimal AST changes`);
      } else {
        throw new Error(applyResult.error || 'Failed to apply AST transformation');
      }
    } else {
      // Re-extract with source AST preservation if not available
      logger.warn(`Query ${query.id} missing source AST, re-extracting with source preservation`);
      
      const reExtractedQueries = await this.extractor.extractFromFile(filePath);
      const reExtractedQuery = reExtractedQueries.find(q => q.content === query.content);
      
      if (reExtractedQuery) {
        // Note: Current GraphQLExtractor doesn't preserve sourceAST
        // This indicates the extraction strategy needs to be updated
        logger.error(`GraphQLExtractor needs to be updated to preserve sourceAST. Query transformation cannot proceed safely without source mapping.`);
        throw new Error(`Unable to preserve source AST for query in ${filePath}. The extractor needs to implement sourceAST preservation.`);
      } else {
        throw new Error(`Unable to find matching query in ${filePath}. AST-based transformation is required for safety.`);
      }
    }
  }

  private async generateReport(result: MigrationResult): Promise<void> {
    const report = `
# GraphQL Migration Report

## Summary
- Total Queries: ${result.totalQueries}
- Transformed: ${result.transformedQueries}
- Errors: ${result.errors.length}
- Warnings: ${result.warnings.length}
- Duration: ${result.duration}ms

## Errors
${result.errors.map(e => `- ${e.file}: ${e.query} - ${e.error}`).join('\n')}

## Warnings
${result.warnings.join('\n')}
`;

    await fs.writeFile('migration-report.md', report);
    logger.info('Report generated: migration-report.md');
  }
}