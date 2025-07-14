import { GoDaddyAPI } from './src/core/testing/GoDaddyAPI';
import { GraphQLClient } from './src/core/testing/GraphQLClient';
import * as dotenv from 'dotenv';

dotenv.config();

async function testGoDaddyAPI() {
  console.log('🚀 Testing GoDaddy GraphQL API Client\n');

  // Method 1: Using the simplified GoDaddyAPI wrapper
  const api = new GoDaddyAPI({
    baselineDir: './test-baselines'
  });

  try {
    // Test 1: Get all ventures
    console.log('📋 Test 1: Getting all ventures...');
    const ventures = await api.getVentures();
    console.log(`✅ Found ${ventures.user?.ventures?.length || 0} ventures\n`);

    // Test 2: Get specific venture (if ventures exist)
    if (ventures.user?.ventures?.length > 0) {
      const ventureId = ventures.user.ventures[0].id;
      console.log(`📋 Test 2: Getting venture details for ID: ${ventureId}`);
      const venture = await api.getVentureById(ventureId);
      console.log(`✅ Venture name: ${venture.venture?.profile?.name || 'Unknown'}\n`);

      // Test 3: Get quick links data
      console.log('📋 Test 3: Getting quick links data...');
      const quickLinks = await api.getQuickLinksData(ventureId);
      console.log(`✅ Found ${quickLinks.venture?.projects?.length || 0} projects\n`);
    }

    // Test 4: Custom query
    console.log('📋 Test 4: Running custom query...');
    const customQuery = `
      query GetAiroPlusEntitlement {
        projects {
          edges {
            node {
              group
              status
              __typename
            }
            __typename
          }
          __typename
        }
      }
    `;
    const customResult = await api.rawQuery(customQuery);
    console.log('✅ Custom query executed successfully\n');

    // Test 5: Compare with baseline
    console.log('📋 Test 5: Comparing with baseline...');
    const comparison = await api.compareWithBaseline(customQuery);
    console.log(`✅ Baseline comparison: ${comparison.matches ? 'MATCHES' : 'DIFFERS'}\n`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

async function testRawClient() {
  console.log('🔧 Testing Raw GraphQL Client\n');

  // Method 2: Using the raw GraphQLClient for more control
  const client = new GraphQLClient({
    cookieString: process.env.GODADDY_COOKIES,
    appKey: 'venture-tiles', // Different app key
    clientName: 'venture-tiles',
    baselineDir: './raw-baselines'
  });

  try {
    const query = `
      query getVentureSkeletonAP {
        user {
          ventures {
            id
            profile {
              name
              __typename
            }
            __typename
          }
          __typename
        }
      }
    `;

    const result = await client.query(query, {}, true);
    console.log('✅ Raw client query successful');
    console.log(`   Found ${result.user?.ventures?.length || 0} ventures\n`);

    // Test raw request method (mimics exact curl behavior)
    console.log('📋 Testing raw request method...');
    const rawResult = await client.rawRequest(
      'getVentureSkeletonAP',
      query.replace(/\s+/g, ' ').trim(),
      {}
    );
    console.log('✅ Raw request successful');
    console.log(`   Response has ${rawResult.data ? 'data' : 'no data'}\n`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

async function main() {
  // Check if cookies are configured
  if (!process.env.GODADDY_COOKIES) {
    console.error('❌ Error: GODADDY_COOKIES not found in environment variables');
    console.log('\n📝 To use this client:');
    console.log('1. Copy .env.example to .env');
    console.log('2. Log into dashboard.godaddy.com');
    console.log('3. Open DevTools > Network tab');
    console.log('4. Find a GraphQL request to pg.api.godaddy.com');
    console.log('5. Right-click > Copy > Copy as cURL');
    console.log('6. Extract the cookie string after the -b flag');
    console.log('7. Paste it as GODADDY_COOKIES in your .env file\n');
    return;
  }

  await testGoDaddyAPI();
  await testRawClient();

  console.log('✨ All tests completed!');
}

// Run the tests
main().catch(console.error);