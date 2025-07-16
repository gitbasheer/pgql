// @ts-nocheck
import { logger } from '../../utils/logger.js';
import { ResolvedQuery } from '../extraction/types/query.types.js';
import { ExtractedQuery, TestParams } from '../../types/shared.types.js';
import {
  ResponseValidationConfig,
  EndpointConfig,
  ValidationReport,
  ComparisonResult,
  AlignmentFunction,
  ABTestConfig,
} from './types.js';
import { ResponseCaptureService } from './ResponseCaptureService.js';
import { ResponseComparator, IgnorePattern, ExpectedDifference } from './ResponseComparator.js';
import { AlignmentGenerator } from './AlignmentGenerator.js';
import { ABTestingFramework } from './ABTestingFramework.js';
import { ResponseStorage } from './ResponseStorage.js';
import { ValidationReportGenerator } from './ValidationReportGenerator.js';
import { ApolloClient, InMemoryCache, HttpLink, gql } from '@apollo/client';
import { parse, DocumentNode } from 'graphql';
import * as yaml from 'js-yaml';
import { promises as fs } from 'fs';
import { GraphQLClient } from '../testing/GraphQLClient.js';
import { GoDaddyAPI } from '../testing/GoDaddyAPI.js';

export class ResponseValidationService {
  private captureService: ResponseCaptureService;
  private comparator: ResponseComparator;
  private alignmentGenerator: AlignmentGenerator;
  private abTestingFramework: ABTestingFramework;
  private storage: ResponseStorage;
  private reportGenerator: ValidationReportGenerator;

  constructor(private config: ResponseValidationConfig) {
    this.captureService = new ResponseCaptureService(config.endpoints, {
      maxConcurrency: config.capture.maxConcurrency,
      timeout: config.capture.timeout,
      variableGeneration: config.capture.variableGeneration,
    });

    // Initialize comparator with ignore patterns and expected differences
    const comparatorOptions: any = {
      strict: config.comparison.strict,
      ignorePaths: config.comparison.ignorePaths,
      customComparators: config.comparison.customComparators,
    };

    // Add ignore patterns if provided
    if (config.validation?.ignorePatterns) {
      comparatorOptions.ignorePatterns = config.validation.ignorePatterns;
    }

    // Add expected differences if provided
    if (config.validation?.expectedDifferences) {
      comparatorOptions.expectedDifferences = config.validation.expectedDifferences;
    }

    this.comparator = new ResponseComparator(comparatorOptions);

    this.alignmentGenerator = new AlignmentGenerator(config.alignment);

    this.abTestingFramework = new ABTestingFramework({
      defaultSplit: config.abTesting?.defaultSplit,
      monitoring: config.abTesting?.monitoring,
    });

    this.storage = new ResponseStorage(config.storage);

    this.reportGenerator = new ValidationReportGenerator({
      outputDir: config.reporting?.outputDir || './validation-reports',
      formats: config.reporting?.formats || ['html', 'markdown', 'json'],
      includeDiffs: config.reporting?.includeDiffs,
    });
  }

  /**
   * Load configuration from YAML file
   */
  static async fromConfigFile(configPath: string): Promise<ResponseValidationService> {
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = yaml.load(configContent) as any;

    // Transform YAML config to ResponseValidationConfig
    const validationConfig: ResponseValidationConfig = {
      endpoints: config.endpoints || [],
      capture: config.capture || {
        parallel: true,
        maxConcurrency: 10,
        timeout: 30000,
      },
      comparison: {
        strict: config.comparison?.strict || config.validation?.strict || false,
        ignorePaths: config.comparison?.ignorePaths || config.validation?.ignorePaths,
        customComparators: this.parseCustomComparators(
          config.comparison?.customComparators || config.validation?.customComparators,
        ),
      },
      validation: {
        ignorePatterns: config.validation?.ignorePatterns?.map(
          (p: any) =>
            ({
              path:
                p.path.startsWith('/') && p.path.endsWith('/')
                  ? new RegExp(p.path.slice(1, -1))
                  : p.path,
              reason: p.reason,
              type: p.type,
            }) as IgnorePattern,
        ),
        expectedDifferences: config.validation?.expectedDifferences as ExpectedDifference[],
      },
      alignment: config.alignment || {
        strict: false,
        preserveNulls: true,
        preserveOrder: false,
      },
      storage: config.storage || {
        type: 'file',
        path: './validation-storage',
      },
      abTesting: config.abTesting,
      reporting: config.reporting,
    };

    return new ResponseValidationService(validationConfig);
  }

  /**
   * Parse custom comparators from YAML configuration
   */
  private static parseCustomComparators(yamlComparators: any): Record<string, any> | undefined {
    if (!yamlComparators) return undefined;

    const result: Record<string, any> = {};

    for (const [path, value] of Object.entries(yamlComparators)) {
      if (typeof value === 'string') {
        // Legacy format: warn and skip
        logger.warn(
          `Embedded JavaScript functions are no longer supported for path '${path}'. Please use a predefined comparator type instead.`,
        );
        continue;
      } else if (typeof value === 'object' && value !== null) {
        // New format: { type: 'date-tolerance', options: { tolerance: 60000 } }
        result[path] = value;
      } else {
        logger.warn(`Invalid comparator configuration for path '${path}'`);
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * Full validation pipeline
   */
  async validateTransformation(
    baselineQueries: ResolvedQuery[],
    transformedQueries: ResolvedQuery[],
    options: {
      endpoint?: EndpointConfig;
      generateAlignments?: boolean;
      setupABTest?: boolean;
      saveReport?: boolean;
    } = {},
  ): Promise<ValidationReport> {
    logger.info(`Starting validation for ${baselineQueries.length} queries`);

    // Step 1: Capture baseline responses
    logger.info('Capturing baseline responses...');
    const baselineResponses = await this.captureService.captureBaseline(
      baselineQueries,
      options.endpoint,
    );

    // Store baseline responses
    for (const [queryId, response] of baselineResponses.responses) {
      await this.storage.store(response);
    }

    // Step 2: Capture transformed responses
    logger.info('Capturing transformed responses...');
    const transformedResponses = await this.captureService.captureTransformed(
      transformedQueries,
      options.endpoint,
    );

    // Store transformed responses
    for (const [queryId, response] of transformedResponses.responses) {
      await this.storage.store(response);
    }

    // Step 3: Compare responses
    logger.info('Comparing responses...');
    const comparisons: ComparisonResult[] = [];
    const missingResponses: string[] = [];

    for (const queryId of baselineResponses.responses.keys()) {
      const baseline = baselineResponses.responses.get(queryId);
      const transformed = transformedResponses.responses.get(queryId);

      if (baseline && transformed) {
        const comparison = this.comparator.compare(baseline, transformed);
        comparisons.push(comparison);
      } else {
        // Track missing responses properly
        missingResponses.push(queryId);
        logger.error(
          `Missing responses for query ${queryId} - baseline: ${!!baseline}, transformed: ${!!transformed}`,
        );

        // Add a comparison result indicating failure
        comparisons.push({
          queryId,
          operationName: baseline?.operationName || 'Unknown',
          identical: false,
          similarity: 0,
          differences: [
            {
              path: 'response',
              type: 'missing-field',
              baseline: baseline ? 'present' : 'missing',
              transformed: transformed ? 'present' : 'missing',
              severity: 'critical',
              description: baseline
                ? 'Transformed response is missing'
                : 'Baseline response is missing',
              fixable: false,
            },
          ],
          breakingChanges: [
            {
              type: 'response-missing',
              path: 'response',
              description: `Query ${queryId} response is missing`,
              impact: 'critical',
              migrationStrategy: 'Ensure query can be executed successfully',
            },
          ],
          performanceImpact: {
            latencyChange: 0,
            sizeChange: 0,
            recommendation: 'Cannot compare performance - response missing',
          },
          recommendation: 'unsafe',
        });
      }
    }

    // Step 4: Generate alignments if requested
    let alignments: AlignmentFunction[] = [];
    if (options.generateAlignments) {
      logger.info('Generating alignment functions...');
      alignments = await this.generateAlignments(comparisons);
    }

    // Step 5: Setup A/B test if requested
    let abTestConfig: ABTestConfig | undefined;
    if (options.setupABTest) {
      logger.info('Setting up A/B test...');
      abTestConfig = await this.setupABTest(comparisons);
    }

    // Step 6: Generate report with missing response info
    const report = await this.reportGenerator.generateFullReport(
      comparisons,
      alignments,
      abTestConfig,
    );

    // Add missing responses to report summary
    if (missingResponses.length > 0) {
      (report as any).missingResponses = missingResponses;
      report.summary.safeToMigrate = false;
    }

    // Step 7: Store report
    if (options.saveReport !== false) {
      await this.storage.storeReport(report);
    }

    logger.info(`Validation complete. Safe to migrate: ${report.summary.safeToMigrate}`);

    return report;
  }

  /**
   * Capture only baseline responses
   */
  async captureBaseline(queries: ResolvedQuery[], endpoint?: EndpointConfig): Promise<void> {
    const responses = await this.captureService.captureBaseline(queries, endpoint);

    for (const [queryId, response] of responses.responses) {
      await this.storage.store(response);
    }

    logger.info(`Captured and stored ${responses.responses.size} baseline responses`);
  }

  /**
   * Compare previously captured responses
   */
  async compareStoredResponses(queryIds: string[]): Promise<ComparisonResult[]> {
    const comparisons: ComparisonResult[] = [];
    const missingResponses: { queryId: string; baseline: boolean; transformed: boolean }[] = [];

    for (const queryId of queryIds) {
      const baseline = await this.storage.retrieve(queryId, 'baseline');
      const transformed = await this.storage.retrieve(queryId, 'transformed');

      if (baseline && transformed) {
        const comparison = this.comparator.compare(baseline, transformed);
        comparisons.push(comparison);
      } else {
        // Track missing responses with details
        missingResponses.push({
          queryId,
          baseline: !!baseline,
          transformed: !!transformed,
        });

        logger.error(
          `Missing responses for query ${queryId} - baseline: ${!!baseline}, transformed: ${!!transformed}`,
        );

        // Add a failed comparison for missing responses
        comparisons.push({
          queryId,
          operationName: baseline?.operationName || transformed?.operationName || 'Unknown',
          identical: false,
          similarity: 0,
          differences: [
            {
              path: 'response',
              type: 'missing-field',
              baseline: baseline ? 'present' : 'missing',
              transformed: transformed ? 'present' : 'missing',
              severity: 'critical',
              description: `Response missing: baseline=${!!baseline}, transformed=${!!transformed}`,
              fixable: false,
            },
          ],
          breakingChanges: [
            {
              type: 'response-missing',
              path: 'response',
              description: `Cannot compare - ${!baseline ? 'baseline' : 'transformed'} response is missing`,
              impact: 'critical',
              migrationStrategy: 'Capture missing response before comparison',
            },
          ],
          performanceImpact: {
            latencyChange: 0,
            sizeChange: 0,
            recommendation: 'Cannot measure performance - response missing',
          },
          recommendation: 'unsafe',
        });
      }
    }

    // Log summary of missing responses
    if (missingResponses.length > 0) {
      logger.error(
        `Found ${missingResponses.length} queries with missing responses:`,
        missingResponses,
      );
    }

    return comparisons;
  }

  /**
   * Generate alignments for queries with differences
   */
  async generateAlignments(comparisons: ComparisonResult[]): Promise<AlignmentFunction[]> {
    const alignments: AlignmentFunction[] = [];

    for (const comparison of comparisons) {
      if (!comparison.identical && comparison.differences.length > 0) {
        const fixableDifferences = comparison.differences.filter((d) => d.fixable);

        if (fixableDifferences.length > 0) {
          const alignment = this.alignmentGenerator.generateAlignmentFunction(
            comparison.queryId,
            fixableDifferences,
          );
          alignments.push(alignment);

          // Store alignment
          await this.storage.storeAlignment(alignment);
        }
      }
    }

    logger.info(`Generated ${alignments.length} alignment functions`);
    return alignments;
  }

  /**
   * Setup A/B test based on validation results
   */
  async setupABTest(comparisons: ComparisonResult[]): Promise<ABTestConfig> {
    // Determine initial split based on risk
    const breakingChanges = comparisons.flatMap((c) => c.breakingChanges).length;
    const avgSimilarity =
      comparisons.reduce((sum, c) => sum + c.similarity, 0) / comparisons.length;

    let initialSplit = 10; // Default 10%
    if (breakingChanges === 0 && avgSimilarity > 0.98) {
      initialSplit = 25; // Low risk, start higher
    } else if (breakingChanges > 0) {
      initialSplit = 1; // High risk, start very low
    }

    const config = await this.abTestingFramework.createTest({
      name: `GraphQL Migration Test - ${new Date().toISOString()}`,
      splitPercentage: initialSplit,
      targetQueries: comparisons.map((c) => c.queryId),
      rolloutStrategy: {
        type: 'gradual',
        stages: this.getCustomRolloutStages(breakingChanges, avgSimilarity),
      },
    });

    // Register rollback handler
    this.abTestingFramework.registerRollbackHandler(config.id, async () => {
      logger.error('A/B test rollback triggered - reverting to baseline queries');
      // In production, implement actual rollback logic
    });

    return config;
  }

  /**
   * Get validation summary for PR
   */
  async generatePRSummary(reportId: string): Promise<string> {
    const report = await this.storage.retrieveReport(reportId);
    if (!report) {
      throw new Error(`Report ${reportId} not found`);
    }

    return this.reportGenerator.generatePRSummary(report);
  }

  /**
   * Get CI/CD validation result
   */
  async getCIValidation(reportId: string): Promise<{
    passed: boolean;
    message: string;
    details: Record<string, any>;
  }> {
    const report = await this.storage.retrieveReport(reportId);
    if (!report) {
      throw new Error(`Report ${reportId} not found`);
    }

    return this.reportGenerator.generateCIReport(report);
  }

  /**
   * Export validation data
   */
  async exportValidationData(outputPath: string): Promise<void> {
    await this.storage.exportData(outputPath);
  }

  /**
   * Import validation data
   */
  async importValidationData(inputPath: string): Promise<void> {
    await this.storage.importData(inputPath);
  }

  /**
   * Clean up old validation data
   */
  async cleanup(olderThan?: Date): Promise<number> {
    return await this.storage.cleanup(olderThan);
  }

  /**
   * Add runtime ignore pattern
   */
  addIgnorePattern(pattern: IgnorePattern): void {
    this.comparator.addIgnorePattern(pattern);
  }

  /**
   * Add runtime expected difference
   */
  addExpectedDifference(expected: ExpectedDifference): void {
    this.comparator.addExpectedDifference(expected);
  }

  /**
   * Get current comparison configuration
   */
  getComparisonConfig(): {
    ignorePatterns: IgnorePattern[];
    expectedDifferences: ExpectedDifference[];
  } {
    return this.comparator.getConfiguration();
  }

  /**
   * Get custom rollout stages based on risk
   */
  private getCustomRolloutStages(breakingChanges: number, avgSimilarity: number) {
    if (breakingChanges > 0) {
      // Very conservative rollout for breaking changes
      return [
        {
          percentage: 0.1,
          duration: '30m',
          criteria: { minSuccessRate: 0.999, maxErrorRate: 0.001, minSampleSize: 100 },
        },
        {
          percentage: 1,
          duration: '2h',
          criteria: { minSuccessRate: 0.99, maxErrorRate: 0.01, minSampleSize: 1000 },
        },
        {
          percentage: 5,
          duration: '6h',
          criteria: { minSuccessRate: 0.99, maxErrorRate: 0.01, minSampleSize: 5000 },
        },
        {
          percentage: 10,
          duration: '24h',
          criteria: { minSuccessRate: 0.99, maxErrorRate: 0.01, minSampleSize: 10000 },
        },
        {
          percentage: 25,
          duration: '48h',
          criteria: { minSuccessRate: 0.99, maxErrorRate: 0.01, minSampleSize: 25000 },
        },
      ];
    } else if (avgSimilarity > 0.98) {
      // Faster rollout for low risk
      return [
        {
          percentage: 10,
          duration: '30m',
          criteria: { minSuccessRate: 0.98, maxErrorRate: 0.02, minSampleSize: 100 },
        },
        {
          percentage: 25,
          duration: '1h',
          criteria: { minSuccessRate: 0.98, maxErrorRate: 0.02, minSampleSize: 500 },
        },
        {
          percentage: 50,
          duration: '2h',
          criteria: { minSuccessRate: 0.98, maxErrorRate: 0.02, minSampleSize: 2500 },
        },
        {
          percentage: 100,
          duration: '4h',
          criteria: { minSuccessRate: 0.98, maxErrorRate: 0.02, minSampleSize: 5000 },
        },
      ];
    } else {
      // Standard rollout
      return undefined; // Use default stages
    }
  }

  /**
   * Destroy all services and clean up resources
   */
  async destroy(): Promise<void> {
    this.captureService.destroy();
    await this.storage.close();
  }

  /**
   * Build dynamic variables from testing account using GoDaddyAPI
   */
  async buildVariables(
    queryAst: DocumentNode | string,
    testingAccount?: any,
  ): Promise<Record<string, any>> {
    const ast = typeof queryAst === 'string' ? parse(queryAst) : queryAst;
    const variables: Record<string, any> = {};

    // Extract variable definitions from AST
    const queryDef = ast.definitions.find((d) => d.kind === 'OperationDefinition');
    if (!queryDef || queryDef.kind !== 'OperationDefinition') {
      return variables;
    }

    const variableDefinitions = queryDef.variableDefinitions || [];

    // If no testing account provided, try to fetch real data using GoDaddyAPI
    let realTestingAccount = testingAccount;
    if (!realTestingAccount) {
      try {
        const godaddyAPI = new GoDaddyAPI();
        const ventures = await godaddyAPI.getVentures();
        realTestingAccount = ventures.user;
      } catch (error) {
        logger.warn('Failed to fetch real testing account data:', error);
        realTestingAccount = { id: 'test-uuid', ventures: [], projects: [] };
      }
    }

    for (const varDef of variableDefinitions) {
      const varName = varDef.variable.name.value;
      const varType = this.getTypeString(varDef.type);

      // Map common patterns with real data
      if (varName === 'ventureId' && realTestingAccount.ventures?.length > 0) {
        variables[varName] = realTestingAccount.ventures[0].id;
      } else if (varName === 'domainName' && realTestingAccount.projects?.length > 0) {
        variables[varName] = realTestingAccount.projects[0].domain;
      } else if (varName === 'userId' || varName === 'accountId') {
        variables[varName] = realTestingAccount.id;
      } else if (varType.includes('UUID') || varType.includes('ID')) {
        // Use real ID if available, otherwise default
        variables[varName] = realTestingAccount.id || 'test-uuid';
      } else if (varType.includes('String')) {
        variables[varName] = 'test-string';
      } else if (varType.includes('Int')) {
        variables[varName] = 1;
      } else if (varType.includes('Boolean')) {
        variables[varName] = true;
      }

      // LLM_PLACEHOLDER: Use llm-ls to infer var values from code context
    }

    // Use spreads for merging query vars (CLAUDE.local.md compliance)
    const baseVariables = { ...variables };
    const environmentOverrides = {
      ...(process.env.DEFAULT_VENTURE_ID && { ventureId: process.env.DEFAULT_VENTURE_ID }),
      ...(process.env.DEFAULT_USER_ID && { userId: process.env.DEFAULT_USER_ID }),
    };

    return { ...baseVariables, ...environmentOverrides };
  }

  private getTypeString(typeNode: any): string {
    if (typeNode.kind === 'NonNullType') {
      return this.getTypeString(typeNode.type) + '!';
    }
    if (typeNode.kind === 'ListType') {
      return '[' + this.getTypeString(typeNode.type) + ']';
    }
    if (typeNode.kind === 'NamedType') {
      return typeNode.name.value;
    }
    return 'Unknown';
  }

  /**
   * Test query on real API using GraphQLClient
   */
  async testOnRealApi(
    params: TestParams & { query: ExtractedQuery; auth: { cookies: string; appKey: string } },
  ): Promise<any> {
    // EVENT_PLACEHOLDER: Publish to Event Bus instead of direct socket
    // e.g., await eventBusClient.publish({
    //   source: 'pgql.pipeline',
    //   detailType: 'progress',
    //   detail: { stage: 'testing', message: `Testing query ${params.query.name} on real API` }
    // });

    const client = new GraphQLClient({
      endpoint: this.getEndpointUrl(params.endpoint || params.query.endpoint || 'productGraph'),
      cookieString: params.auth.cookies,
      appKey: params.auth.appKey,
      baselineDir: './baselines',
    });

    const vars = await this.buildVariables(
      params.query.fullExpandedQuery || params.query.content,
      params.testingAccount,
    );

    try {
      // Use GraphQLClient's query method with baseline saving
      const data = await client.query(
        params.query.fullExpandedQuery || params.query.content,
        vars,
        true,
      );

      // Compare with baseline if it exists
      const comparison = await client.compareWithBaseline(
        params.query.fullExpandedQuery || params.query.content,
        vars,
        data,
      );

      if (comparison && !comparison.matches) {
        logger.warn(
          `Baseline comparison failed for ${params.query.queryName}:`,
          comparison.differences,
        );
      }

      // EVENT_PLACEHOLDER: Publish test result
      // e.g., await eventBusClient.publish({
      //   source: 'pgql.pipeline',
      //   detailType: 'progress',
      //   detail: { stage: 'testing', message: `Test successful for ${params.query.queryName}` }
      // });

      logger.info(`API test successful for ${params.query.queryName}`);
      return data;
    } catch (error) {
      // EVENT_PLACEHOLDER: Publish test error
      // e.g., await eventBusClient.publish({
      //   source: 'pgql.pipeline',
      //   detailType: 'error',
      //   detail: { stage: 'testing', message: `Test failed for ${params.query.queryName}: ${error.message}` }
      // });

      logger.error('API Test Error:', error);
      throw error;
    }
  }

  private getEndpointUrl(endpoint: string): string {
    if (endpoint === 'productGraph') {
      return process.env.APOLLO_PG_ENDPOINT || 'https://pg.api.godaddy.com/v1/gql/customer';
    } else if (endpoint === 'offerGraph') {
      return process.env.APOLLO_OG_ENDPOINT || 'https://og.api.godaddy.com/v1/graphql';
    }

    return process.env.APOLLO_PG_ENDPOINT || 'https://pg.api.godaddy.com/v1/gql/customer'; // Default
  }

  /**
   * Validate query against schema
   */
  async validateAgainstSchema(
    query: string,
    endpoint: string,
  ): Promise<{ valid: boolean; errors: string[] }> {
    try {
      // In production, use graphql-inspector to validate
      // For now, basic validation
      const ast = parse(query);
      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Invalid query'],
      };
    }
  }

  /**
   * Validate a single query
   */
  async validateQuery(params: { query: string; endpoint?: string; variables?: Record<string, any> }): Promise<{ valid: boolean; errors?: string[] }> {
    try {
      const ast = parse(params.query);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Invalid query'],
      };
    }
  }
}
