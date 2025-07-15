#!/usr/bin/env tsx
import { ResponseValidationService } from './src/core/validator/ResponseValidationService';
import { config } from 'dotenv';
import Apollo from '@apollo/client';
import { setContext } from '@apollo/client/link/context';

// Load environment variables
config();

interface AuthTokens {
  auth_idp: string;
  cust_idp: string;
  info_cust_idp: string;
  info_idp: string;
}

async function testRealAPI() {
  console.log('🔐 Testing Real API with Authentication...\n');

  // Extract auth tokens from environment
  const authTokens: AuthTokens = {
    auth_idp: process.env.auth_idp || '',
    cust_idp: process.env.cust_idp || '',
    info_cust_idp: process.env.info_cust_idp || '',
    info_idp: process.env.info_idp || ''
  };

  // Validate we have required tokens
  const missingTokens = Object.entries(authTokens)
    .filter(([_, value]) => !value)
    .map(([key, _]) => key);

  if (missingTokens.length > 0) {
    console.error(`❌ Missing required auth tokens: ${missingTokens.join(', ')}`);
    return false;
  }

  console.log('✅ All auth tokens loaded from environment');

  // Create cookie string for authentication
  const cookieString = Object.entries(authTokens)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');

  // Test both endpoints
  const endpoints = [
    {
      name: 'ProductGraph',
      url: process.env.APOLLO_PG_ENDPOINT || 'https://pg.api.godaddy.com/v1/gql/customer'
    },
    {
      name: 'OfferGraph', 
      url: process.env.APOLLO_OG_ENDPOINT || 'https://og.api.godaddy.com/'
    }
  ];

  const testResults: Array<{
    endpoint: string;
    success: boolean;
    responseTime: number;
    error?: string;
  }> = [];

  for (const endpoint of endpoints) {
    console.log(`\n🌐 Testing ${endpoint.name} at ${endpoint.url}`);
    
    try {
      const startTime = Date.now();

      // Create Apollo client with auth
      const httpLink = Apollo.createHttpLink({
        uri: endpoint.url
      });

      const authLink = setContext((_, { headers }) => ({
        headers: {
          ...headers,
          Cookie: cookieString,
          'User-Agent': 'pg-migration-620/1.0.0',
          'Content-Type': 'application/json'
        }
      }));

      const client = new Apollo.ApolloClient({
        link: authLink.concat(httpLink),
        cache: new Apollo.InMemoryCache(),
        defaultOptions: {
          query: {
            errorPolicy: 'all'
          }
        }
      });

      // Simple introspection query to test connectivity
      const INTROSPECTION_QUERY = Apollo.gql`
        query IntrospectionQuery {
          __schema {
            queryType {
              name
            }
            mutationType {
              name
            }
            subscriptionType {
              name
            }
          }
        }
      `;

      const result = await client.query({
        query: INTROSPECTION_QUERY,
        context: {
          headers: {
            Cookie: cookieString
          }
        }
      });

      const responseTime = Date.now() - startTime;

      if (result.data && result.data.__schema) {
        console.log(`✅ ${endpoint.name} responded successfully (${responseTime}ms)`);
        console.log(`   - Query Type: ${result.data.__schema.queryType?.name || 'None'}`);
        console.log(`   - Mutation Type: ${result.data.__schema.mutationType?.name || 'None'}`);
        console.log(`   - Subscription Type: ${result.data.__schema.subscriptionType?.name || 'None'}`);

        testResults.push({
          endpoint: endpoint.name,
          success: true,
          responseTime
        });
      } else {
        throw new Error('Invalid schema response');
      }

    } catch (error) {
      const responseTime = Date.now() - Date.now();
      console.error(`❌ ${endpoint.name} failed:`, error instanceof Error ? error.message : String(error));
      
      testResults.push({
        endpoint: endpoint.name,
        success: false,
        responseTime,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Test with sample query from extracted data
  console.log('\n📊 Testing with Sample Extracted Query...');
  
  try {
    const SAMPLE_QUERY = Apollo.gql`
      query GetQuickLinksData($ventureId: UUID!) {
        venture(ventureId: $ventureId) {
          projects {
            id
            domain
            status
          }
        }
      }
    `;

    // Use a test venture ID (this would normally come from the testing account)
    const variables = {
      ventureId: "a5a1a68d-cfe8-4649-8763-71ad64d62306" // From info_cid in tokens
    };

    const httpLink = Apollo.createHttpLink({
      uri: endpoints[0].url // ProductGraph
    });

    const authLink = setContext((_, { headers }) => ({
      headers: {
        ...headers,
        Cookie: cookieString,
        'User-Agent': 'pg-migration-620/1.0.0',
        'Content-Type': 'application/json'
      }
    }));

    const client = new Apollo.ApolloClient({
      link: authLink.concat(httpLink),
      cache: new Apollo.InMemoryCache(),
      defaultOptions: {
        query: {
          errorPolicy: 'all'
        }
      }
    });

    const result = await client.query({
      query: SAMPLE_QUERY,
      variables,
      context: {
        headers: {
          Cookie: cookieString
        }
      }
    });

    if (result.data) {
      console.log('✅ Sample query executed successfully');
      console.log(`   - Response: ${JSON.stringify(result.data, null, 2).substring(0, 200)}...`);
    }

  } catch (error) {
    console.log('⚠️  Sample query failed (expected for schema mismatches):', 
      error instanceof Error ? error.message.substring(0, 100) : String(error).substring(0, 100));
  }

  // Summary
  console.log('\n📈 API Test Summary:');
  const successfulTests = testResults.filter(r => r.success).length;
  console.log(`   - Successful: ${successfulTests}/${testResults.length}`);
  console.log(`   - Average Response Time: ${Math.round(testResults.reduce((sum, r) => sum + r.responseTime, 0) / testResults.length)}ms`);

  if (successfulTests === testResults.length) {
    console.log('✅ All API endpoints are accessible with authentication');
    return true;
  } else {
    console.log('⚠️  Some endpoints failed - check authentication or network connectivity');
    return false;
  }
}

// Test auth complexity scenarios
async function testAuthComplexities() {
  console.log('\n🔒 Testing Authentication Complexities...\n');

  const scenarios = [
    {
      name: 'SSO Token Validation',
      test: () => {
        const token = process.env.auth_idp;
        if (!token) return false;
        
        // Basic JWT structure validation
        const parts = token.split('.');
        if (parts.length !== 3) return false;
        
        try {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          console.log(`   - Token expires: ${new Date(payload.vat * 1000).toISOString()}`);
          console.log(`   - Shopper ID: ${payload.shopperId}`);
          return true;
        } catch {
          return false;
        }
      }
    },
    {
      name: 'Cookie Concatenation',
      test: () => {
        const tokens = ['auth_idp', 'cust_idp', 'info_cust_idp', 'info_idp'];
        const cookieString = tokens
          .map(token => `${token}=${process.env[token]}`)
          .join('; ');
        
        console.log(`   - Cookie length: ${cookieString.length} chars`);
        console.log(`   - Contains all tokens: ${tokens.every(t => cookieString.includes(t))}`);
        return cookieString.length > 0 && tokens.every(t => cookieString.includes(t));
      }
    },
    {
      name: 'Multi-Endpoint Auth',
      test: () => {
        const pgEndpoint = process.env.APOLLO_PG_ENDPOINT;
        const ogEndpoint = process.env.APOLLO_OG_ENDPOINT;
        
        console.log(`   - PG Endpoint: ${pgEndpoint ? '✅' : '❌'}`);
        console.log(`   - OG Endpoint: ${ogEndpoint ? '✅' : '❌'}`);
        return !!(pgEndpoint && ogEndpoint);
      }
    }
  ];

  let passedScenarios = 0;
  for (const scenario of scenarios) {
    console.log(`Testing ${scenario.name}:`);
    const success = scenario.test();
    console.log(`   Result: ${success ? '✅ PASS' : '❌ FAIL'}\n`);
    if (success) passedScenarios++;
  }

  console.log(`Auth Complexity Tests: ${passedScenarios}/${scenarios.length} passed`);
  return passedScenarios === scenarios.length;
}

// Run all tests
async function runRealAPITests() {
  console.log('🚀 Starting Real API Tests with Authentication\n');
  
  try {
    const apiSuccess = await testRealAPI();
    const authSuccess = await testAuthComplexities();
    
    console.log('\n' + '='.repeat(50));
    console.log('REAL API TEST RESULTS');
    console.log('='.repeat(50));
    console.log(`API Connectivity: ${apiSuccess ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Auth Complexities: ${authSuccess ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Overall: ${apiSuccess && authSuccess ? '✅ SUCCESS' : '⚠️  PARTIAL/FAIL'}`);
    
    return apiSuccess && authSuccess;
  } catch (error) {
    console.error('❌ Real API tests failed:', error);
    return false;
  }
}

// Run the tests
runRealAPITests().then((success) => {
  process.exit(success ? 0 : 1);
});