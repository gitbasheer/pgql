/** @fileoverview Real API testing with GraphQL client and sample data */

import { GraphQLClient } from './src/core/testing/GraphQLClient';
import { ResponseValidationService } from './src/core/validator/ResponseValidationService';
import {
  SAMPLE_GET_ALL_VENTURES_QUERY,
  SAMPLE_SINGLE_VENTURE_QUERY,
  SAMPLE_VENTURE_STATES_QUERY,
  SAMPLE_OFFERS_QUERY,
  SAMPLE_VARIABLES,
  API_ENDPOINTS,
} from './test/fixtures/sample_data';
import { join } from 'path';
import { writeFileSync } from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface RealAPITestResult {
  queryName: string;
  endpoint: 'productGraph' | 'offerGraph';
  success: boolean;
  responseReceived: boolean;
  dataFields: string[];
  errors: string[];
  timing: number;
  baselineSaved: boolean;
}

class RealAPITester {
  private client: GraphQLClient;
  private validator: ResponseValidationService;
  private results: RealAPITestResult[] = [];

  constructor() {
    // Initialize GraphQL client with environment cookies
    const cookieString = this.buildCookieString();

    this.client = new GraphQLClient({
      cookieString,
      baselineDir: './test/fixtures/baselines',
    });

    // Create a basic config for the validation service
    const validationConfig = {
      endpoints: {
        productGraph: {
          url: API_ENDPOINTS.productGraph,
          headers: { 'Content-Type': 'application/json' },
          authMethod: 'cookie',
        },
        offerGraph: {
          url: API_ENDPOINTS.offerGraph,
          headers: { 'Content-Type': 'application/json' },
          authMethod: 'cookie',
        },
      },
      capture: {
        maxConcurrency: 1,
        timeout: 30000,
        variableGeneration: {
          enabled: true,
          testingAccount: {
            ventureId: 'a5a1a68d-cfe8-4649-8763-71ad64d62306',
          },
        },
      },
      comparison: {
        strict: false,
        ignorePaths: ['__typename', 'metadata.timestamp'],
        customComparators: {},
      },
      reporting: {
        outputDir: './test/fixtures/baselines',
        formats: ['json'],
      },
    };

    this.validator = new ResponseValidationService(validationConfig);
  }

  private buildCookieString(): string {
    const cookies = [
      process.env.auth_idp,
      process.env.cust_idp,
      process.env.info_cust_idp,
      process.env.info_idp,
    ].filter(Boolean);

    if (cookies.length === 0) {
      console.warn('⚠️  No authentication cookies found in .env - real API tests may fail');
      return '';
    }

    return [
      `auth_idp=${process.env.auth_idp}`,
      `cust_idp=${process.env.cust_idp}`,
      `info_cust_idp=${process.env.info_cust_idp}`,
      `info_idp=${process.env.info_idp}`,
    ]
      .filter((cookie) => !cookie.includes('undefined'))
      .join('; ');
  }

  async runRealAPITests(): Promise<void> {
    console.log('🌐 Starting real API tests with authentication...\n');

    if (!process.env.auth_idp) {
      console.log('⚠️  Skipping real API tests - no authentication cookies configured');
      return;
    }

    const testCases = [
      {
        name: 'GET_ALL_VENTURES',
        query: SAMPLE_GET_ALL_VENTURES_QUERY,
        variables: {},
        endpoint: 'productGraph' as const,
      },
      {
        name: 'SINGLE_VENTURE',
        query: SAMPLE_SINGLE_VENTURE_QUERY,
        variables: SAMPLE_VARIABLES.singleVenture,
        endpoint: 'productGraph' as const,
      },
      {
        name: 'VENTURE_STATES',
        query: SAMPLE_VENTURE_STATES_QUERY,
        variables: SAMPLE_VARIABLES.singleVenture,
        endpoint: 'productGraph' as const,
      },
      {
        name: 'OFFERS_QUERY',
        query: SAMPLE_OFFERS_QUERY,
        variables: SAMPLE_VARIABLES.offerQuery,
        endpoint: 'offerGraph' as const,
      },
    ];

    for (const testCase of testCases) {
      console.log(`🔄 Testing: ${testCase.name} (${testCase.endpoint})`);

      const result = await this.testSingleQuery(
        testCase.name,
        testCase.query,
        testCase.variables,
        testCase.endpoint,
      );

      this.results.push(result);

      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${testCase.name}: ${result.timing}ms`);

      if (result.errors.length > 0) {
        console.log(`   Errors: ${result.errors.join(', ')}`);
      }

      if (result.dataFields.length > 0) {
        console.log(
          `   Data fields: ${result.dataFields.slice(0, 3).join(', ')}${result.dataFields.length > 3 ? '...' : ''}`,
        );
      }

      // Rate limiting between requests
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    this.generateReport();
  }

  private async testSingleQuery(
    name: string,
    query: any,
    variables: any,
    endpoint: 'productGraph' | 'offerGraph',
  ): Promise<RealAPITestResult> {
    const result: RealAPITestResult = {
      queryName: name,
      endpoint,
      success: false,
      responseReceived: false,
      dataFields: [],
      errors: [],
      timing: 0,
      baselineSaved: false,
    };

    const startTime = Date.now();

    try {
      // Convert gql query to string if needed
      const queryString = query.loc?.source.body || query.toString();

      console.log(`  📤 Sending query to ${endpoint}...`);

      // Test with validation service
      const testResult = await this.validator.testOnRealAPI({
        query: queryString,
        variables,
        endpoint,
      });

      result.timing = Date.now() - startTime;

      if (testResult.success && testResult.response) {
        result.success = true;
        result.responseReceived = true;

        // Extract data field names for reporting
        result.dataFields = this.extractDataFields(testResult.response.data);

        // Save baseline
        try {
          await this.client.saveBaseline(queryString, testResult.response, `${name}_baseline`);
          result.baselineSaved = true;
          console.log(`  💾 Baseline saved for ${name}`);
        } catch (baselineError) {
          result.errors.push(`Baseline save failed: ${baselineError}`);
        }

        console.log(`  ✅ Successfully received data from ${endpoint}`);
      } else {
        result.errors.push(testResult.error || 'Unknown API error');
        console.log(`  ❌ API call failed: ${testResult.error}`);
      }
    } catch (error) {
      result.errors.push(`Test error: ${error}`);
      result.timing = Date.now() - startTime;
      console.log(`  💥 Test failed: ${error}`);
    }

    return result;
  }

  private extractDataFields(data: any, prefix = ''): string[] {
    const fields: string[] = [];

    if (data && typeof data === 'object') {
      Object.keys(data).forEach((key) => {
        const fieldName = prefix ? `${prefix}.${key}` : key;
        fields.push(fieldName);

        // Recursively extract nested fields (limit depth to avoid huge lists)
        if (typeof data[key] === 'object' && data[key] !== null && prefix.split('.').length < 3) {
          fields.push(...this.extractDataFields(data[key], fieldName));
        }
      });
    }

    return fields;
  }

  private generateReport(): void {
    const successful = this.results.filter((r) => r.success).length;
    const total = this.results.length;
    const avgTiming = this.results.reduce((sum, r) => sum + r.timing, 0) / total;

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: total,
        successful,
        failed: total - successful,
        successRate: (successful / total) * 100,
        averageResponseTime: Math.round(avgTiming),
      },
      results: this.results,
      endpoints: {
        productGraph: this.results.filter((r) => r.endpoint === 'productGraph'),
        offerGraph: this.results.filter((r) => r.endpoint === 'offerGraph'),
      },
    };

    // Save detailed report
    const reportPath = join(__dirname, 'real-api-test-results.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('\n📊 REAL API TEST RESULTS');
    console.log('═'.repeat(50));
    console.log(`Total Tests: ${total}`);
    console.log(`Successful: ${successful}`);
    console.log(`Failed: ${total - successful}`);
    console.log(`Success Rate: ${report.summary.successRate.toFixed(1)}%`);
    console.log(`Average Response Time: ${report.summary.averageResponseTime}ms`);
    console.log(`\nDetailed results saved to: ${reportPath}`);

    if (successful === total) {
      console.log(
        '\n🎉 ALL REAL API TESTS PASSED! Authentication and endpoints working correctly.',
      );
    } else {
      console.log(
        '\n⚠️  Some real API tests failed. Check authentication and network connectivity.',
      );
    }
  }
}

// Run the real API tests
async function main() {
  const tester = new RealAPITester();

  try {
    await tester.runRealAPITests();
  } catch (error) {
    console.error('\n💥 Real API testing failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { RealAPITester };
