import { logger } from '../../utils/logger';
import { ResolvedQuery } from '../extraction/types/query.types';
import {
  ResponseValidationConfig,
  EndpointConfig,
  ValidationReport,
  ComparisonResult,
  AlignmentFunction,
  ABTestConfig
} from './types';
import { ResponseCaptureService } from './ResponseCaptureService';
import { ResponseComparator } from './ResponseComparator';
import { AlignmentGenerator } from './AlignmentGenerator';
import { ABTestingFramework } from './ABTestingFramework';
import { ResponseStorage } from './ResponseStorage';
import { ValidationReportGenerator } from './ValidationReportGenerator';

export class ResponseValidationService {
  private captureService: ResponseCaptureService;
  private comparator: ResponseComparator;
  private alignmentGenerator: AlignmentGenerator;
  private abTestingFramework: ABTestingFramework;
  private storage: ResponseStorage;
  private reportGenerator: ValidationReportGenerator;

  constructor(private config: ResponseValidationConfig) {
    this.captureService = new ResponseCaptureService(
      config.endpoints,
      {
        maxConcurrency: config.capture.maxConcurrency,
        timeout: config.capture.timeout,
        variableGeneration: config.capture.variableGeneration
      }
    );

    this.comparator = new ResponseComparator({
      strict: config.comparison.strict,
      ignorePaths: config.comparison.ignorePaths,
      customComparators: config.comparison.customComparators
    });

    this.alignmentGenerator = new AlignmentGenerator(config.alignment);

    this.abTestingFramework = new ABTestingFramework({
      defaultSplit: config.abTesting?.defaultSplit,
      monitoring: config.abTesting?.monitoring
    });

    this.storage = new ResponseStorage(config.storage);

    this.reportGenerator = new ValidationReportGenerator({
      outputDir: './validation-reports',
      formats: ['html', 'markdown', 'json']
    });
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
    } = {}
  ): Promise<ValidationReport> {
    logger.info(`Starting validation for ${baselineQueries.length} queries`);

    // Step 1: Capture baseline responses
    logger.info('Capturing baseline responses...');
    const baselineResponses = await this.captureService.captureBaseline(
      baselineQueries,
      options.endpoint
    );

    // Store baseline responses
    for (const [queryId, response] of baselineResponses.responses) {
      await this.storage.store(response);
    }

    // Step 2: Capture transformed responses
    logger.info('Capturing transformed responses...');
    const transformedResponses = await this.captureService.captureTransformed(
      transformedQueries,
      options.endpoint
    );

    // Store transformed responses
    for (const [queryId, response] of transformedResponses.responses) {
      await this.storage.store(response);
    }

    // Step 3: Compare responses
    logger.info('Comparing responses...');
    const comparisons: ComparisonResult[] = [];
    
    for (const queryId of baselineResponses.responses.keys()) {
      const baseline = baselineResponses.responses.get(queryId);
      const transformed = transformedResponses.responses.get(queryId);

      if (baseline && transformed) {
        const comparison = this.comparator.compare(baseline, transformed);
        comparisons.push(comparison);
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

    // Step 6: Generate report
    const report = await this.reportGenerator.generateFullReport(
      comparisons,
      alignments,
      abTestConfig
    );

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
  async captureBaseline(
    queries: ResolvedQuery[],
    endpoint?: EndpointConfig
  ): Promise<void> {
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

    for (const queryId of queryIds) {
      const baseline = await this.storage.retrieve(queryId, 'baseline');
      const transformed = await this.storage.retrieve(queryId, 'transformed');

      if (baseline && transformed) {
        const comparison = this.comparator.compare(baseline, transformed);
        comparisons.push(comparison);
      } else {
        logger.warn(`Missing responses for query ${queryId}`);
      }
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
        const fixableDifferences = comparison.differences.filter(d => d.fixable);
        
        if (fixableDifferences.length > 0) {
          const alignment = this.alignmentGenerator.generateAlignmentFunction(
            comparison.queryId,
            fixableDifferences
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
    const breakingChanges = comparisons.flatMap(c => c.breakingChanges).length;
    const avgSimilarity = comparisons.reduce((sum, c) => sum + c.similarity, 0) / comparisons.length;
    
    let initialSplit = 10; // Default 10%
    if (breakingChanges === 0 && avgSimilarity > 0.98) {
      initialSplit = 25; // Low risk, start higher
    } else if (breakingChanges > 0) {
      initialSplit = 1; // High risk, start very low
    }

    const config = await this.abTestingFramework.createTest({
      name: `GraphQL Migration Test - ${new Date().toISOString()}`,
      splitPercentage: initialSplit,
      targetQueries: comparisons.map(c => c.queryId),
      rolloutStrategy: {
        type: 'gradual',
        stages: this.getCustomRolloutStages(breakingChanges, avgSimilarity)
      }
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
   * Get custom rollout stages based on risk
   */
  private getCustomRolloutStages(breakingChanges: number, avgSimilarity: number) {
    if (breakingChanges > 0) {
      // Very conservative rollout for breaking changes
      return [
        { percentage: 0.1, duration: '30m', criteria: { minSuccessRate: 0.999, maxErrorRate: 0.001, minSampleSize: 100 } },
        { percentage: 1, duration: '2h', criteria: { minSuccessRate: 0.99, maxErrorRate: 0.01, minSampleSize: 1000 } },
        { percentage: 5, duration: '6h', criteria: { minSuccessRate: 0.99, maxErrorRate: 0.01, minSampleSize: 5000 } },
        { percentage: 10, duration: '24h', criteria: { minSuccessRate: 0.99, maxErrorRate: 0.01, minSampleSize: 10000 } },
        { percentage: 25, duration: '48h', criteria: { minSuccessRate: 0.99, maxErrorRate: 0.01, minSampleSize: 25000 } }
      ];
    } else if (avgSimilarity > 0.98) {
      // Faster rollout for low risk
      return [
        { percentage: 10, duration: '30m', criteria: { minSuccessRate: 0.98, maxErrorRate: 0.02, minSampleSize: 100 } },
        { percentage: 25, duration: '1h', criteria: { minSuccessRate: 0.98, maxErrorRate: 0.02, minSampleSize: 500 } },
        { percentage: 50, duration: '2h', criteria: { minSuccessRate: 0.98, maxErrorRate: 0.02, minSampleSize: 2500 } },
        { percentage: 100, duration: '4h', criteria: { minSuccessRate: 0.98, maxErrorRate: 0.02, minSampleSize: 5000 } }
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
} 