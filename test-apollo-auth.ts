#!/usr/bin/env tsx

import { ResponseCaptureService } from './src/core/validator/ResponseCaptureService';
import { GoDaddyEndpointConfig } from './src/core/validator/GoDaddyEndpointConfig';
import { EndpointConfig } from './src/core/validator/types';
import { ResolvedQuery } from './src/core/extraction/types/query.types';
import { logger } from './src/utils/logger';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Simple test query
const testQuery = `
  query TestQuery {
    __typename
  }
`;

// Another simple query that might work
const schemaQuery = `
  query IntrospectionQuery {
    __schema {
      queryType {
        name
      }
    }
  }
`;

async function testApolloAuth() {
  console.log('🚀 Testing Apollo Authentication...\n');

  // Check environment variables
  console.log('Environment Check:');
  console.log(`- APOLLO_PG_ENDPOINT: ${process.env.APOLLO_PG_ENDPOINT ? '✅ Set' : '❌ Missing'}`);
  console.log(`- APOLLO_AUTH_TOKEN: ${process.env.APOLLO_AUTH_TOKEN ? '✅ Set' : '❌ Missing'}`);
  console.log(`- SSO_AUTH_IDP: ${process.env.SSO_AUTH_IDP ? '✅ Set' : '❌ Missing'}`);
  console.log(`- SSO_CUST_IDP: ${process.env.SSO_CUST_IDP ? '✅ Set' : '❌ Missing'}`);
  console.log('\n');

  try {
    // Option 1: Test with Bearer Token
    console.log('Testing with Bearer Token...');
    const bearerEndpoint: EndpointConfig = {
      url: process.env.APOLLO_PG_ENDPOINT || 'https://pg.api.godaddy.com/v1/gql/customer',
      name: 'apollo-test-bearer',
      authentication: {
        type: 'bearer',
        token: process.env.APOLLO_AUTH_TOKEN
      }
    };

    // Option 2: Test with SSO Cookies
    console.log('Testing with SSO Cookies...');
    const ssoEndpoint = GoDaddyEndpointConfig.createEndpoint({
      environment: 'production',
      sso: {
        authIdp: process.env.SSO_AUTH_IDP || 'test_auth_idp',
        custIdp: process.env.SSO_CUST_IDP || 'test_cust_idp',
        infoCustIdp: process.env.SSO_INFO_CUST_IDP || 'test_info_cust_idp',
        infoIdp: process.env.SSO_INFO_IDP || 'test_info_idp'
      }
    });

    // Create service with bearer endpoint first
    const service = new ResponseCaptureService([bearerEndpoint], {
      maxConcurrency: 1,
      timeout: 10000
    });

    // Create a test query object
    const query: ResolvedQuery = {
      id: 'test-query-1',
      content: testQuery,
      name: 'TestQuery',
      type: 'query',
      filePath: 'test.ts',
      resolvedContent: testQuery,
      variables: [],
      fragments: [],
      ast: null
    };

    console.log('Sending test query...\n');
    
    // Try bearer token first
    try {
      console.log('1️⃣ Attempting with Bearer Token...');
      const bearerResult = await service.captureBaseline([query], bearerEndpoint);
      
      if (bearerResult.metadata.successCount > 0) {
        console.log('✅ Bearer Token Authentication Successful!');
        console.log('Response:', JSON.stringify(bearerResult.responses.get('test-query-1')?.response, null, 2));
      } else {
        console.log('❌ Bearer Token Authentication Failed');
      }
    } catch (error) {
      console.log('❌ Bearer Token Error:', error.message);
    }

    // Try SSO cookies
    console.log('\n2️⃣ Attempting with SSO Cookies...');
    const ssoService = new ResponseCaptureService([ssoEndpoint], {
      maxConcurrency: 1,
      timeout: 10000
    });

    try {
      const ssoResult = await ssoService.captureBaseline([query], ssoEndpoint);
      
      if (ssoResult.metadata.successCount > 0) {
        console.log('✅ SSO Cookie Authentication Successful!');
        console.log('Response:', JSON.stringify(ssoResult.responses.get('test-query-1')?.response, null, 2));
      } else {
        console.log('❌ SSO Cookie Authentication Failed');
      }
    } catch (error) {
      console.log('❌ SSO Cookie Error:', error.message);
    }

    // Try schema introspection query
    console.log('\n3️⃣ Attempting Schema Introspection...');
    const schemaQueryObj: ResolvedQuery = {
      id: 'schema-query',
      content: schemaQuery,
      name: 'IntrospectionQuery',
      type: 'query',
      filePath: 'test.ts',
      resolvedContent: schemaQuery,
      variables: [],
      fragments: [],
      ast: null
    };

    try {
      const schemaResult = await service.captureBaseline([schemaQueryObj], bearerEndpoint);
      
      if (schemaResult.metadata.successCount > 0) {
        console.log('✅ Schema Introspection Successful!');
        console.log('Response:', JSON.stringify(schemaResult.responses.get('schema-query')?.response, null, 2));
      }
    } catch (error) {
      console.log('❌ Schema Query Error:', error.message);
    }

    // Cleanup
    service.destroy();
    ssoService.destroy();

  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testApolloAuth()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });