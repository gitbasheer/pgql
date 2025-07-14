#!/usr/bin/env tsx

import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

async function testSimpleRequest() {
  console.log('🚀 Testing simple Apollo request...\n');

  try {
    // First, try without any authentication
    console.log('1️⃣  Testing without authentication:');
    try {
      const response = await axios.post(
        'https://pg.api.godaddy.com/v1/gql/customer',
        {
          query: 'query { __typename }',
          operationName: null,
          variables: {}
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-app-key': 'vnext-dashboard'
          },
          timeout: 10000
        }
      );
      console.log('Response:', response.data);
    } catch (error: any) {
      console.log('Status:', error.response?.status);
      console.log('Error:', error.response?.data);
    }

    console.log('\n2️⃣  Testing with auth_idp cookie only:');
    const authIdp = process.env.SSO_AUTH_IDP;
    if (authIdp) {
      try {
        const response = await axios.post(
          'https://pg.api.godaddy.com/v1/gql/customer',
          {
            query: 'query { __typename }',
          operationName: null,
          variables: {}
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'x-app-key': 'vnext-dashboard',
              'Cookie': `auth_idp=${authIdp}`
            },
            timeout: 10000
          }
        );
        console.log('Response:', response.data);
      } catch (error: any) {
        console.log('Status:', error.response?.status);
        console.log('Error:', error.response?.data);
        
        // Check if we're being redirected
        if (error.response?.headers?.location) {
          console.log('Redirect to:', error.response.headers.location);
        }
      }
    }

    console.log('\n3️⃣  Testing with Bearer token:');
    const bearerToken = process.env.APOLLO_AUTH_TOKEN;
    if (bearerToken && bearerToken !== 'your_apollo_bearer_token_here') {
      try {
        const response = await axios.post(
          'https://pg.api.godaddy.com/v1/gql/customer',
          {
            query: 'query { __typename }',
          operationName: null,
          variables: {}
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'x-app-key': 'vnext-dashboard',
              'Authorization': `Bearer ${bearerToken}`
            },
            timeout: 10000
          }
        );
        console.log('Response:', response.data);
      } catch (error: any) {
        console.log('Status:', error.response?.status);
        console.log('Error:', error.response?.data);
      }
    } else {
      console.log('No bearer token configured in .env');
    }

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Run the test
testSimpleRequest();