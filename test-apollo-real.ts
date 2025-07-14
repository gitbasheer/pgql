#!/usr/bin/env tsx

import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

async function testRealQueries() {
  console.log('🚀 Testing with real GraphQL query formats...\n');

  const endpoint = 'https://pg.api.godaddy.com/v1/gql/customer';
  const authIdp = process.env.SSO_AUTH_IDP;
  const custIdp = process.env.SSO_CUST_IDP;
  const infoCustIdp = process.env.SSO_INFO_CUST_IDP;
  const infoIdp = process.env.SSO_INFO_IDP;

  if (!authIdp || !custIdp || !infoCustIdp || !infoIdp) {
    console.error('❌ Missing SSO cookies in .env');
    return;
  }

  const cookieHeader = `auth_idp=${authIdp}; cust_idp=${custIdp}; info_cust_idp=${infoCustIdp}; info_idp=${infoIdp}`;

  // Test queries based on patterns found in the codebase
  const queries = [
    {
      name: 'Simple introspection',
      body: {
        query: `query { __typename }`
      }
    },
    {
      name: 'Schema introspection',
      body: {
        query: `query IntrospectionQuery {
          __schema {
            queryType { name }
          }
        }`
      }
    },
    {
      name: 'Get user query',
      body: {
        query: `query GetUser {
          user {
            id
          }
        }`
      }
    },
    {
      name: 'Get ventures (based on codebase pattern)',
      body: {
        query: `query GetVentures {
          ventures {
            id
          }
        }`
      }
    }
  ];

  for (const testQuery of queries) {
    console.log(`\n📋 Testing: ${testQuery.name}`);
    console.log(`Query: ${testQuery.body.query.replace(/\s+/g, ' ').trim()}`);
    
    try {
      const response = await axios.post(
        endpoint,
        testQuery.body,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-app-key': 'vnext-dashboard',
            'Cookie': cookieHeader,
            'Accept': 'application/json',
            'User-Agent': 'pg-migration-620/1.0.0'
          },
          timeout: 10000,
          withCredentials: true, // Important for cookie-based auth
          validateStatus: (status) => true // Accept all status codes
        }
      );

      console.log(`Status: ${response.status}`);
      
      if (response.status === 200) {
        console.log('✅ Success!');
        console.log('Response:', JSON.stringify(response.data, null, 2));
      } else if (response.headers['content-type']?.includes('text/html')) {
        console.log('❌ Got HTML response (likely redirected to login)');
        console.log('Response preview:', response.data.substring(0, 200) + '...');
      } else {
        console.log('Response:', response.data);
      }
    } catch (error: any) {
      console.error('❌ Request failed:', error.message);
    }
  }
}

// Run the tests
testRealQueries();