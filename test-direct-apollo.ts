#!/usr/bin/env tsx

import axios from 'axios';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testDirectApollo() {
  console.log('🚀 Testing Direct Apollo Call with all SSO cookies...\n');

  const endpoint = 'https://pg.api.godaddy.com/v1/gql/customer';
  
  // Get all 4 SSO cookies from .env
  const authIdp = process.env.SSO_AUTH_IDP;
  const custIdp = process.env.SSO_CUST_IDP;
  const infoCustIdp = process.env.SSO_INFO_CUST_IDP;
  const infoIdp = process.env.SSO_INFO_IDP;

  if (!authIdp || !custIdp || !infoCustIdp || !infoIdp) {
    console.error('❌ Missing one or more SSO cookies in .env');
    console.error('Required: SSO_AUTH_IDP, SSO_CUST_IDP, SSO_INFO_CUST_IDP, SSO_INFO_IDP');
    return;
  }

  console.log('✅ Found all SSO cookies in .env');
  console.log(`📍 Endpoint: ${endpoint}`);
  console.log('🍪 Cookies:');
  console.log(`  - auth_idp: ${authIdp.substring(0, 20)}...`);
  console.log(`  - cust_idp: ${custIdp.substring(0, 20)}...`);
  console.log(`  - info_cust_idp: ${infoCustIdp.substring(0, 20)}...`);
  console.log(`  - info_idp: ${infoIdp.substring(0, 20)}...\n`);

  // Format cookies for HTTP header
  const cookieHeader = `auth_idp=${authIdp}; cust_idp=${custIdp}; info_cust_idp=${infoCustIdp}; info_idp=${infoIdp}`;
  
  // Also try with URLEncoded values
  const decodedInfoCustIdp = decodeURIComponent(infoCustIdp);
  const decodedInfoIdp = decodeURIComponent(infoIdp);

  try {
    const response = await axios.post(
      endpoint,
      {
        query: `query TestQuery {
          __typename
        }`,
        operationName: 'TestQuery'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-app-key': 'vnext-dashboard',
          'Cookie': cookieHeader
        },
        timeout: 10000
      }
    );

    console.log('✅ SUCCESS! Response received:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('\nStatus:', response.status);
    console.log('Headers:', response.headers);

  } catch (error: any) {
    console.error('❌ Request failed:');
    console.error('Status:', error.response?.status);
    console.error('Message:', error.message);
    console.error('Response:', error.response?.data);
    console.error('\nHeaders sent:');
    console.error('- Content-Type: application/json');
    console.error('- x-app-key: vnext-dashboard');
    console.error('- Cookie: auth_idp=<token>; cust_idp=<token>; info_cust_idp=<token>; info_idp=<token>');
  }
}

// Run the test
testDirectApollo();