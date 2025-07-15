import { SchemaValidator, ValidationResult } from './SchemaValidator';
import { QuerySchemaClassifier } from './QuerySchemaClassifier';
import { logger } from '../../utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface MultiSchemaConfig {
  schemas: {
    [key: string]: {
      path: string;
      endpoint?: string;
      description?: string;
    };
  };
  defaultSchema: string;
}

export interface MultiSchemaValidationResult {
  queryId: string;
  queryName: string;
  schema: string;
  validationResult: ValidationResult;
  classification: {
    detectedSchema: string;
    confidence: number;
  };
}

export class MultiSchemaValidator {
  private validators: Map<string, SchemaValidator> = new Map();
  private config: MultiSchemaConfig;

  constructor(config: MultiSchemaConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    logger.info('Initializing multi-schema validator...');
    
    for (const [schemaName, schemaConfig] of Object.entries(this.config.schemas)) {
      try {
        const validator = new SchemaValidator();
        await validator.loadSchemaFromFile(schemaConfig.path);
        this.validators.set(schemaName, validator);
        logger.info(`  ✓ Loaded ${schemaName} schema from ${schemaConfig.path}`);
      } catch (error) {
        logger.warn(`  ✗ Failed to load ${schemaName} schema: ${error}`);
      }
    }
  }

  async validateQuery(
    query: { id: string; name: string; content: string },
    forceSchema?: string
  ): Promise<MultiSchemaValidationResult> {
    // Classify the query to determine which schema to use
    const classification = QuerySchemaClassifier.classifyQuery(query.id, query.name, query.content);
    
    // Determine which schema to use
    let schemaToUse = forceSchema || classification.detectedSchema;
    
    // Fallback to default if unknown
    if (schemaToUse === 'unknown' || !this.validators.has(schemaToUse)) {
      schemaToUse = this.config.defaultSchema;
    }

    // Get the appropriate validator
    const validator = this.validators.get(schemaToUse);
    
    if (!validator) {
      return {
        queryId: query.id,
        queryName: query.name,
        schema: schemaToUse,
        validationResult: {
          valid: false,
          errors: [{
            message: `No validator available for schema: ${schemaToUse}`,
            type: 'schema'
          }],
          warnings: []
        },
        classification: {
          detectedSchema: classification.detectedSchema,
          confidence: classification.confidence
        }
      };
    }

    // Validate the query
    const validationResult = await validator.validateQuery(query.content);

    return {
      queryId: query.id,
      queryName: query.name,
      schema: schemaToUse,
      validationResult,
      classification: {
        detectedSchema: classification.detectedSchema,
        confidence: classification.confidence
      }
    };
  }

  async validateQueries(
    queries: Array<{ id: string; name: string; content: string }>
  ): Promise<Map<string, MultiSchemaValidationResult>> {
    const results = new Map<string, MultiSchemaValidationResult>();

    for (const query of queries) {
      const result = await this.validateQuery(query);
      results.set(query.id, result);
    }

    return results;
  }

  generateValidationReport(results: Map<string, MultiSchemaValidationResult>): any {
    const report = {
      totalQueries: results.size,
      bySchema: {} as any,
      summary: {
        valid: 0,
        invalid: 0,
        warnings: 0
      }
    };

    // Group results by schema
    for (const [queryId, result] of results.entries()) {
      const schema = result.schema;
      
      if (!report.bySchema[schema]) {
        report.bySchema[schema] = {
          total: 0,
          valid: 0,
          invalid: 0,
          warnings: 0,
          queries: []
        };
      }

      report.bySchema[schema].total++;
      
      if (result.validationResult.valid) {
        report.bySchema[schema].valid++;
        report.summary.valid++;
      } else {
        report.bySchema[schema].invalid++;
        report.summary.invalid++;
      }

      if (result.validationResult.warnings.length > 0) {
        report.bySchema[schema].warnings += result.validationResult.warnings.length;
        report.summary.warnings += result.validationResult.warnings.length;
      }

      report.bySchema[schema].queries.push({
        id: queryId,
        name: result.queryName,
        valid: result.validationResult.valid,
        errors: result.validationResult.errors.length,
        warnings: result.validationResult.warnings.length,
        classification: result.classification
      });
    }

    return report;
  }

  static async loadConfig(configPath?: string): Promise<MultiSchemaConfig> {
    const defaultConfigPath = path.join(process.cwd(), 'multi-schema-config.json');
    const actualPath = configPath || defaultConfigPath;

    try {
      const configContent = await fs.readFile(actualPath, 'utf-8');
      return JSON.parse(configContent);
    } catch (error) {
      // Return default config if file doesn't exist
      return {
        schemas: {
          customer: {
            path: './data/schema.graphql',
            endpoint: 'https://pg.api.godaddy.com/v1/gql/customer',
            description: 'Customer API schema'
          }
        },
        defaultSchema: 'customer'
      };
    }
  }
}