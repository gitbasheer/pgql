import { logger } from '../../utils/logger.js';

export interface SchemaClassification {
  queryId: string;
  queryName: string;
  detectedSchema: 'customer' | 'billing' | 'venture' | 'unknown';
  confidence: number;
  indicators: string[];
}

export class QuerySchemaClassifier {
  // Schema indicators based on root fields and types
  private static readonly SCHEMA_INDICATORS = {
    customer: {
      rootFields: ['user', 'projectNode', 'venture', 'ventureNode', 'website', 'aamcUserPreferences'],
      types: ['CustomerQuery', 'CustomerMutation', 'ProjectNode', 'VentureNode', 'WAMProduct'],
      patterns: ['venture', 'project', 'website']
    },
    billing: {
      rootFields: ['me', 'transitions', 'modifyBasketWithOptions'],
      types: ['ModifyBasketWithOptionsInput', 'BillingQuery', 'BillingMutation'],
      patterns: ['bill', 'basket', 'offer', 'transition', 'subscription']
    },
    venture: {
      rootFields: ['ventures', 'ventureByDomainName'],
      types: ['Venture', 'VentureProfile'],
      patterns: ['infinityStone', 'aap', 'domain']
    }
  };

  /**
   * Classify a query based on its content to determine which schema it belongs to
   */
  static classifyQuery(queryId: string, queryName: string, queryContent: string): SchemaClassification {
    const indicators: string[] = [];
    const scores = {
      customer: 0,
      billing: 0,
      venture: 0
    };

    // Normalize query content
    const normalizedContent = queryContent.toLowerCase();

    // Check for root fields
    for (const [schema, config] of Object.entries(this.SCHEMA_INDICATORS)) {
      for (const field of config.rootFields) {
        if (this.hasRootField(queryContent, field)) {
          scores[schema as keyof typeof scores] += 3;
          indicators.push(`Root field '${field}' indicates ${schema} schema`);
        }
      }

      // Check for type references
      for (const type of config.types) {
        if (normalizedContent.includes(type.toLowerCase())) {
          scores[schema as keyof typeof scores] += 2;
          indicators.push(`Type '${type}' indicates ${schema} schema`);
        }
      }

      // Check for patterns
      for (const pattern of config.patterns) {
        const occurrences = (normalizedContent.match(new RegExp(pattern, 'gi')) || []).length;
        if (occurrences > 0) {
          scores[schema as keyof typeof scores] += occurrences;
          indicators.push(`Pattern '${pattern}' (${occurrences}x) indicates ${schema} schema`);
        }
      }
    }

    // Determine the schema with highest score
    let detectedSchema: 'customer' | 'billing' | 'venture' | 'unknown' = 'unknown';
    let maxScore = 0;

    for (const [schema, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        detectedSchema = schema as 'customer' | 'billing' | 'venture';
      }
    }

    // Calculate confidence (0-1)
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidence = totalScore > 0 ? maxScore / totalScore : 0;

    return {
      queryId,
      queryName,
      detectedSchema,
      confidence,
      indicators
    };
  }

  /**
   * Check if query has a specific root field
   */
  private static hasRootField(queryContent: string, field: string): boolean {
    // Look for field at root level (not nested)
    const rootFieldPattern = new RegExp(`^\\s*${field}\\s*[\\({]`, 'm');
    const afterBracePattern = new RegExp(`{\\s*${field}\\s*[\\({]`, 'm');
    
    return rootFieldPattern.test(queryContent) || afterBracePattern.test(queryContent);
  }

  /**
   * Classify all queries and group by schema
   */
  static classifyQueries(queries: Array<{id: string, name: string, content: string}>): Map<string, SchemaClassification[]> {
    const schemaGroups = new Map<string, SchemaClassification[]>();
    
    for (const query of queries) {
      const classification = this.classifyQuery(query.id, query.name, query.content);
      
      const group = schemaGroups.get(classification.detectedSchema) || [];
      group.push(classification);
      schemaGroups.set(classification.detectedSchema, group);
    }

    // Log summary
    logger.info('Query classification summary:');
    for (const [schema, queries] of schemaGroups.entries()) {
      logger.info(`  ${schema}: ${queries.length} queries`);
    }

    return schemaGroups;
  }

  /**
   * Get schema endpoint URL based on classification
   */
  static getSchemaEndpoint(schema: string): string {
    const endpoints = {
      customer: 'https://pg.api.godaddy.com/v1/gql/customer',
      billing: 'https://pg.api.godaddy.com/v1/gql/billing', // Hypothetical
      venture: 'https://pg.api.godaddy.com/v1/gql/venture'   // Hypothetical
    };

    return endpoints[schema as keyof typeof endpoints] || endpoints.customer;
  }
}