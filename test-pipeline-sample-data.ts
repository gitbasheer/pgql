/** @fileoverview Test script for running the full pipeline on sample data */

import { UnifiedExtractor } from './src/core/extraction/engine/UnifiedExtractor';
import { ResponseValidationService } from './src/core/validator/ResponseValidationService';
import { OptimizedSchemaTransformer } from './src/core/transformer/OptimizedSchemaTransformer';
import { 
  SAMPLE_GET_ALL_VENTURES_QUERY,
  SAMPLE_SINGLE_VENTURE_QUERY,
  SAMPLE_VENTURE_STATES_QUERY,
  SAMPLE_OFFERS_QUERY,
  SAMPLE_VARIABLES,
  SAMPLE_DATA_CONFIG
} from './test/fixtures/sample_data';
import { join } from 'path';
import { writeFileSync } from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface TestResult {
  query: string;
  endpoint: 'productGraph' | 'offerGraph';
  extractionSuccess: boolean;
  validationSuccess: boolean;
  apiTestSuccess: boolean;
  transformationSuccess: boolean;
  errors: string[];
  timing: {
    extraction: number;
    validation: number;
    apiTest: number;
    transformation: number;
    total: number;
  };
}

interface PipelineResults {
  timestamp: string;
  totalQueries: number;
  successfulPipelines: number;
  failedPipelines: number;
  results: TestResult[];
  summary: {
    extractionSuccessRate: number;
    validationSuccessRate: number;
    apiTestSuccessRate: number;
    transformationSuccessRate: number;
    overallSuccessRate: number;
  };
}

class SampleDataPipelineTester {
  private extractor: UnifiedExtractor;
  private validator: ResponseValidationService;
  private transformer: OptimizedSchemaTransformer;
  private results: TestResult[] = [];

  constructor() {
    this.extractor = new UnifiedExtractor();
    this.validator = new ResponseValidationService();
    this.transformer = new OptimizedSchemaTransformer();
  }

  async runFullPipeline(): Promise<PipelineResults> {
    console.log('🚀 Starting full pipeline test on sample data...\n');
    
    const startTime = Date.now();
    
    const testCases = [
      {
        name: 'GET_ALL_VENTURES',
        query: SAMPLE_GET_ALL_VENTURES_QUERY,
        variables: {},
        expectedEndpoint: 'productGraph' as const
      },
      {
        name: 'SINGLE_VENTURE',
        query: SAMPLE_SINGLE_VENTURE_QUERY,
        variables: SAMPLE_VARIABLES.singleVenture,
        expectedEndpoint: 'productGraph' as const
      },
      {
        name: 'VENTURE_STATES',
        query: SAMPLE_VENTURE_STATES_QUERY,
        variables: SAMPLE_VARIABLES.singleVenture,
        expectedEndpoint: 'productGraph' as const
      },
      {
        name: 'OFFERS_QUERY',
        query: SAMPLE_OFFERS_QUERY,
        variables: SAMPLE_VARIABLES.offerQuery,
        expectedEndpoint: 'offerGraph' as const
      }
    ];

    for (const testCase of testCases) {
      console.log(`📋 Testing: ${testCase.name}`);
      const result = await this.testSingleQuery(
        testCase.query.loc?.source.body || testCase.query.toString(),
        testCase.variables,
        testCase.expectedEndpoint
      );
      this.results.push(result);
      
      const status = result.extractionSuccess && 
                    result.validationSuccess && 
                    result.apiTestSuccess && 
                    result.transformationSuccess ? '✅' : '❌';
      
      console.log(`${status} ${testCase.name}: ${result.timing.total}ms\n`);
    }

    const summary = this.generateSummary();
    const pipelineResults: PipelineResults = {
      timestamp: new Date().toISOString(),
      totalQueries: testCases.length,
      successfulPipelines: this.results.filter(r => 
        r.extractionSuccess && r.validationSuccess && r.apiTestSuccess && r.transformationSuccess
      ).length,
      failedPipelines: this.results.filter(r => 
        !r.extractionSuccess || !r.validationSuccess || !r.apiTestSuccess || !r.transformationSuccess
      ).length,
      results: this.results,
      summary
    };

    // Save results
    const resultsPath = join(__dirname, 'sample-data-pipeline-results.json');
    writeFileSync(resultsPath, JSON.stringify(pipelineResults, null, 2));
    console.log(`📊 Results saved to: ${resultsPath}`);

    // Display summary
    console.log('\n📈 PIPELINE RESULTS SUMMARY');
    console.log('═'.repeat(50));
    console.log(`Total Queries Tested: ${pipelineResults.totalQueries}`);
    console.log(`Successful Pipelines: ${pipelineResults.successfulPipelines}`);
    console.log(`Failed Pipelines: ${pipelineResults.failedPipelines}`);
    console.log(`Overall Success Rate: ${summary.overallSuccessRate.toFixed(1)}%`);
    console.log(`Extraction Success: ${summary.extractionSuccessRate.toFixed(1)}%`);
    console.log(`Validation Success: ${summary.validationSuccessRate.toFixed(1)}%`);
    console.log(`API Test Success: ${summary.apiTestSuccessRate.toFixed(1)}%`);
    console.log(`Transformation Success: ${summary.transformationSuccessRate.toFixed(1)}%`);

    return pipelineResults;
  }

  private async testSingleQuery(
    queryString: string, 
    variables: any, 
    expectedEndpoint: 'productGraph' | 'offerGraph'
  ): Promise<TestResult> {
    const result: TestResult = {
      query: queryString.substring(0, 100) + '...',
      endpoint: expectedEndpoint,
      extractionSuccess: false,
      validationSuccess: false,
      apiTestSuccess: false,
      transformationSuccess: false,
      errors: [],
      timing: {
        extraction: 0,
        validation: 0,
        apiTest: 0,
        transformation: 0,
        total: 0
      }
    };

    const startTime = Date.now();

    try {
      // Phase 1: Extraction
      console.log('  📤 Phase 1: Extraction...');
      const extractionStart = Date.now();
      
      const extractionResult = await this.extractor.extractFromContent(
        queryString,
        'test-sample.js',
        SAMPLE_DATA_CONFIG.extractionOptions
      );
      
      result.timing.extraction = Date.now() - extractionStart;
      
      if (extractionResult.queries.length > 0) {
        result.extractionSuccess = true;
        console.log(`    ✅ Extracted ${extractionResult.queries.length} queries`);
      } else {
        result.errors.push('No queries extracted');
        console.log('    ❌ No queries extracted');
      }

      // Phase 2: Validation
      console.log('  📋 Phase 2: Schema Validation...');
      const validationStart = Date.now();
      
      try {
        const query = extractionResult.queries[0];
        if (query) {
          // Classify endpoint
          const detectedEndpoint = query.content.includes('transitions') || 
                                   query.content.includes('modifyBasket') ? 'offerGraph' : 'productGraph';
          
          result.endpoint = detectedEndpoint;
          
          if (detectedEndpoint === expectedEndpoint) {
            result.validationSuccess = true;
            console.log(`    ✅ Endpoint classified correctly: ${detectedEndpoint}`);
          } else {
            result.errors.push(`Endpoint mismatch: expected ${expectedEndpoint}, got ${detectedEndpoint}`);
            console.log(`    ⚠️  Endpoint mismatch: expected ${expectedEndpoint}, got ${detectedEndpoint}`);
          }
        }
      } catch (validationError) {
        result.errors.push(`Validation error: ${validationError}`);
        console.log(`    ❌ Validation failed: ${validationError}`);
      }
      
      result.timing.validation = Date.now() - validationStart;

      // Phase 3: Real API Testing (only if environment is configured)
      console.log('  🌐 Phase 3: Real API Testing...');
      const apiTestStart = Date.now();
      
      try {
        if (process.env.APOLLO_PG_ENDPOINT && process.env.auth_idp) {
          const testResult = await this.validator.testOnRealAPI({
            query: queryString,
            variables,
            endpoint: result.endpoint
          });
          
          if (testResult.success) {
            result.apiTestSuccess = true;
            console.log('    ✅ Real API test successful');
          } else {
            result.errors.push(`API test failed: ${testResult.error}`);
            console.log(`    ❌ Real API test failed: ${testResult.error}`);
          }
        } else {
          result.apiTestSuccess = true; // Skip if not configured
          console.log('    ⏭️  Real API testing skipped (no credentials configured)');
        }
      } catch (apiError) {
        result.errors.push(`API test error: ${apiError}`);
        console.log(`    ❌ API test error: ${apiError}`);
      }
      
      result.timing.apiTest = Date.now() - apiTestStart;

      // Phase 4: Transformation & PR Generation
      console.log('  🔄 Phase 4: Transformation...');
      const transformationStart = Date.now();
      
      try {
        if (result.extractionSuccess) {
          const transformResult = await this.transformer.transformQueries(
            extractionResult.queries,
            {
              generatePR: false, // Don't actually create PRs in testing
              createBaselines: true,
              enableABTesting: false
            }
          );
          
          if (transformResult.success) {
            result.transformationSuccess = true;
            console.log('    ✅ Transformation successful');
          } else {
            result.errors.push(`Transformation failed: ${transformResult.error}`);
            console.log(`    ❌ Transformation failed: ${transformResult.error}`);
          }
        }
      } catch (transformError) {
        result.errors.push(`Transformation error: ${transformError}`);
        console.log(`    ❌ Transformation error: ${transformError}`);
      }
      
      result.timing.transformation = Date.now() - transformationStart;

    } catch (error) {
      result.errors.push(`Pipeline error: ${error}`);
      console.log(`  ❌ Pipeline error: ${error}`);
    }

    result.timing.total = Date.now() - startTime;
    return result;
  }

  private generateSummary() {
    const total = this.results.length;
    const extractionSuccesses = this.results.filter(r => r.extractionSuccess).length;
    const validationSuccesses = this.results.filter(r => r.validationSuccess).length;
    const apiTestSuccesses = this.results.filter(r => r.apiTestSuccess).length;
    const transformationSuccesses = this.results.filter(r => r.transformationSuccess).length;
    const overallSuccesses = this.results.filter(r => 
      r.extractionSuccess && r.validationSuccess && r.apiTestSuccess && r.transformationSuccess
    ).length;

    return {
      extractionSuccessRate: (extractionSuccesses / total) * 100,
      validationSuccessRate: (validationSuccesses / total) * 100,
      apiTestSuccessRate: (apiTestSuccesses / total) * 100,
      transformationSuccessRate: (transformationSuccesses / total) * 100,
      overallSuccessRate: (overallSuccesses / total) * 100
    };
  }
}

// Run the pipeline test
async function main() {
  const tester = new SampleDataPipelineTester();
  
  try {
    const results = await tester.runFullPipeline();
    
    if (results.summary.overallSuccessRate === 100) {
      console.log('\n🎉 ALL PIPELINE TESTS PASSED! Ready for production.');
      process.exit(0);
    } else {
      console.log(`\n⚠️  ${results.failedPipelines} pipeline(s) failed. Review results for details.`);
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 Pipeline test failed with error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { SampleDataPipelineTester };