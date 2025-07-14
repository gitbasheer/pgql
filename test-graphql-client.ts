#!/usr/bin/env tsx
import { GraphQLClient } from './src/core/testing/GraphQLClient';
import { config } from 'dotenv';

// Load environment variables
config();

async function testGraphQLClient() {
  console.log('Testing GraphQL Client with real API...\n');

  try {
    // Initialize client
    const client = new GraphQLClient({
      endpoint: 'https://pg.api.godaddy.com/graphql',
      cookieString: process.env.GODADDY_SSO_COOKIE || '',
      appKey: process.env.GODADDY_APP_KEY || '',
      baselineDir: './test-baselines'
    });

    // Test query
    const testQuery = `
      query TestQuery {
        __typename
      }
    `;

    console.log('1. Testing basic query...');
    const result = await client.query(testQuery, {});
    console.log('✅ Query successful:', result);

    console.log('\n2. Testing baseline save...');
    const resultWithBaseline = await client.query(testQuery, {}, true);
    console.log('✅ Baseline saved');

    console.log('\n3. Testing baseline comparison...');
    const comparison = await client.compareWithBaseline(testQuery, {}, resultWithBaseline);
    console.log('✅ Comparison result:', comparison);

    console.log('\n✅ All tests passed! GraphQL client is working correctly.');
    return true;

  } catch (error) {
    console.error('❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
    return false;
  }
}

// Run the test
testGraphQLClient().then((success) => {
  process.exit(success ? 0 : 1);
});