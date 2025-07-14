#!/usr/bin/env tsx

import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

async function testMinimal() {
  console.log('🚀 Testing with minimal required headers...\n');

  const endpoint = 'https://pg.api.godaddy.com/v1/gql/customer';
  
  // Get cookies from .env
  const authIdp = process.env.SSO_AUTH_IDP;
  const custIdp = process.env.SSO_CUST_IDP;
  const infoCustIdp = process.env.SSO_INFO_CUST_IDP;
  const infoIdp = process.env.SSO_INFO_IDP;

  if (!authIdp || !custIdp || !infoCustIdp || !infoIdp) {
    console.error('❌ Missing SSO cookies in .env');
    return;
  }

  const cookieString = `auth_idp=${authIdp}; cust_idp=${custIdp}; info_cust_idp=${infoCustIdp}; info_idp=${infoIdp}`;

  // Try with introspection query format
  const query = {
    query: `query IntrospectionQuery {
      __schema {
        queryType { name }
      }
    }`,
    operationName: "IntrospectionQuery"
  };

  try {
    console.log('Testing simple query with minimal headers...');
    const response = await axios.post(
      endpoint,
      query,
      {
        headers: {
          'content-type': 'application/json',
          'cookie': cookieString,
          'origin': 'https://pg.api.godaddy.com',
          'referer': 'https://pg.api.godaddy.com/v1/gql/customer'
        },
        timeout: 10000,
        maxRedirects: 0,
        validateStatus: (status) => true
      }
    );

    console.log(`Status: ${response.status}`);
    
    if (response.status === 200) {
      console.log('✅ SUCCESS!');
      console.log('Response:', JSON.stringify(response.data, null, 2));
    } else if (response.status === 302) {
      console.log('❌ Redirected to login - cookies might be expired');
      console.log('Location:', response.headers.location);
    } else {
      console.log('Response:', response.data);
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

// Run the test
testMinimal();