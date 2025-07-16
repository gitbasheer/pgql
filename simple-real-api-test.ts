/** @fileoverview Simple real API testing with GraphQL client */

import { GraphQLClient } from './src/core/testing/GraphQLClient';
import {
  SAMPLE_GET_ALL_VENTURES_QUERY,
  SAMPLE_SINGLE_VENTURE_QUERY,
  SAMPLE_VENTURE_STATES_QUERY,
  SAMPLE_VARIABLES,
} from './test/fixtures/sample_data';
import { writeFileSync } from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface SimpleAPITestResult {
  queryName: string;
  endpoint: string;
  success: boolean;
  responseReceived: boolean;
  dataKeys: string[];
  errors: string[];
  timing: number;
  baselineSaved: boolean;
}

class SimpleRealAPITester {
  private results: SimpleAPITestResult[] = [];

  private buildCookieString(): string {
    const cookies = [
      `auth_idp=${process.env.auth_idp}`,
      `cust_idp=${process.env.cust_idp}`,
      `info_cust_idp=${process.env.info_cust_idp}`,
      `info_idp=${process.env.info_idp}`,
    ].filter((cookie) => !cookie.includes('undefined'));

    return cookies.join('; ');
  }

  async runSimpleAPITests(): Promise<void> {
    console.log('🌐 Starting simple real API tests...\n');

    if (!process.env.auth_idp) {
      console.log('⚠️  Skipping real API tests - no authentication cookies configured');
      console.log('💡 To enable real API tests, add authentication cookies to .env file:');
      console.log('   auth_idp=your_auth_cookie');
      console.log('   cust_idp=your_customer_cookie');
      console.log('   info_cust_idp=your_info_customer_cookie');
      console.log('   info_idp=your_info_cookie');
      return;
    }

    const cookieString = this.buildCookieString();
    console.log(`🍪 Using ${cookieString.split(';').length} authentication cookies`);

    const client = new GraphQLClient({
      endpoint: 'https://pg.api.godaddy.com/v1/gql/customer',
      cookieString,
      baselineDir: './test/fixtures/baselines',
    });

    const testCases = [
      {
        name: 'GET_ALL_VENTURES',
        query: SAMPLE_GET_ALL_VENTURES_QUERY,
        variables: {},
        endpoint: 'productGraph',
      },
      {
        name: 'SINGLE_VENTURE',
        query: SAMPLE_SINGLE_VENTURE_QUERY,
        variables: SAMPLE_VARIABLES.singleVenture,
        endpoint: 'productGraph',
      },
      {
        name: 'VENTURE_STATES',
        query: SAMPLE_VENTURE_STATES_QUERY,
        variables: SAMPLE_VARIABLES.singleVenture,
        endpoint: 'productGraph',
      },
    ];

    for (const testCase of testCases) {
      console.log(`🔄 Testing: ${testCase.name}`);

      const result = await this.testSingleQuery(
        client,
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

      if (result.dataKeys.length > 0) {
        console.log(
          `   Response keys: ${result.dataKeys.slice(0, 5).join(', ')}${result.dataKeys.length > 5 ? '...' : ''}`,
        );
      }

      // Rate limiting between requests
      console.log('   ⏱️  Waiting 2s before next request...');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    this.generateReport();
  }

  private async testSingleQuery(
    client: GraphQLClient,
    name: string,
    query: any,
    variables: any,
    endpoint: string,
  ): Promise<SimpleAPITestResult> {
    const result: SimpleAPITestResult = {
      queryName: name,
      endpoint,
      success: false,
      responseReceived: false,
      dataKeys: [],
      errors: [],
      timing: 0,
      baselineSaved: false,
    };

    const startTime = Date.now();

    try {
      // Convert gql query to string if needed
      const queryString = query.loc?.source.body || query.toString();

      console.log(`  📤 Sending GraphQL query...`);

      // Use GraphQL client to make the request
      const response = await client.query(queryString, variables);

      result.timing = Date.now() - startTime;

      if (response && response.data) {
        result.success = true;
        result.responseReceived = true;

        // Extract top-level data keys
        result.dataKeys = Object.keys(response.data);

        console.log(`  ✅ Received response with data`);

        // Save baseline
        try {
          await client.saveBaseline(queryString, response, `${name}_baseline`);
          result.baselineSaved = true;
          console.log(`  💾 Baseline saved`);
        } catch (baselineError) {
          result.errors.push(`Baseline save failed: ${baselineError}`);
          console.log(`  ⚠️  Baseline save failed: ${baselineError}`);
        }
      } else if (response && response.errors) {
        result.errors.push(
          `GraphQL errors: ${response.errors.map((e: any) => e.message).join(', ')}`,
        );
        console.log(`  ❌ GraphQL errors received`);
      } else {
        result.errors.push('No data or errors in response');
        console.log(`  ❌ Empty response received`);
      }
    } catch (error: any) {
      result.errors.push(`Request failed: ${error.message || error}`);
      result.timing = Date.now() - startTime;
      console.log(`  💥 Request failed: ${error.message || error}`);
    }

    return result;
  }

  private generateReport(): void {
    const successful = this.results.filter((r) => r.success).length;
    const total = this.results.length;
    const avgTiming = total > 0 ? this.results.reduce((sum, r) => sum + r.timing, 0) / total : 0;

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: total,
        successful,
        failed: total - successful,
        successRate: total > 0 ? (successful / total) * 100 : 0,
        averageResponseTime: Math.round(avgTiming),
        baselinesCreated: this.results.filter((r) => r.baselineSaved).length,
      },
      results: this.results,
      authentication: {
        cookiesConfigured: !!process.env.auth_idp,
        cookieCount: this.buildCookieString().split(';').length,
      },
    };

    // Save detailed report
    writeFileSync('./simple-real-api-results.json', JSON.stringify(report, null, 2));

    console.log('\n📊 SIMPLE REAL API TEST RESULTS');
    console.log('═'.repeat(50));
    console.log(`Total Tests: ${total}`);
    console.log(`Successful: ${successful}`);
    console.log(`Failed: ${total - successful}`);
    console.log(`Success Rate: ${report.summary.successRate.toFixed(1)}%`);
    console.log(`Average Response Time: ${report.summary.averageResponseTime}ms`);
    console.log(`Baselines Created: ${report.summary.baselinesCreated}`);
    console.log(`\nDetailed results saved to: simple-real-api-results.json`);

    if (successful === total && total > 0) {
      console.log(
        '\n🎉 ALL REAL API TESTS PASSED! Authentication and GraphQL endpoint working correctly.',
      );
      console.log('✅ Ready for production use with live data');
    } else if (successful > 0) {
      console.log(
        `\n⚠️  Partial success: ${successful}/${total} tests passed. Check failed requests.`,
      );
    } else {
      console.log(
        '\n❌ All real API tests failed. Check authentication cookies and network connectivity.',
      );
    }
  }
}

// Run the simple real API tests
async function main() {
  const tester = new SimpleRealAPITester();

  try {
    await tester.runSimpleAPITests();
  } catch (error) {
    console.error('\n💥 Real API testing failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { SimpleRealAPITester };
