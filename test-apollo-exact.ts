#!/usr/bin/env tsx

import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

async function testExactCurl() {
  console.log('🚀 Testing with exact curl format...\n');

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

  // Format cookies exactly as in the curl command
  const cookieString = `auth_idp=${authIdp}; cust_idp=${custIdp}; info_cust_idp=${infoCustIdp}; info_idp=${infoIdp}`;

  // The introspection query from the curl command
  const introspectionQuery = `
    query IntrospectionQuery {
      __schema {
        
        queryType { name }
        mutationType { name }
        subscriptionType { name }
        types {
          ...FullType
        }
        directives {
          name
          description
          
          locations
          args(includeDeprecated: true) {
            ...InputValue
          }
        }
      }
    }

    fragment FullType on __Type {
      kind
      name
      description
      
      fields(includeDeprecated: true) {
        name
        description
        args(includeDeprecated: true) {
          ...InputValue
        }
        type {
          ...TypeRef
        }
        isDeprecated
        deprecationReason
      }
      inputFields(includeDeprecated: true) {
        ...InputValue
      }
      interfaces {
        ...TypeRef
      }
      enumValues(includeDeprecated: true) {
        name
        description
        isDeprecated
        deprecationReason
      }
      possibleTypes {
        ...TypeRef
      }
    }

    fragment InputValue on __InputValue {
      name
      description
      type { ...TypeRef }
      defaultValue
      isDeprecated
      deprecationReason
    }

    fragment TypeRef on __Type {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    console.log('Sending introspection query...');
    const response = await axios.post(
      endpoint,
      {
        query: introspectionQuery,
        operationName: "IntrospectionQuery"
      },
      {
        headers: {
          'accept': '*/*',
          'accept-language': 'en-US,en;q=0.9,en-GB;q=0.8',
          'cache-control': 'no-cache',
          'content-type': 'application/json',
          'cookie': cookieString,
          'origin': 'https://pg.api.godaddy.com',
          'pragma': 'no-cache',
          'priority': 'u=1, i',
          'referer': 'https://pg.api.godaddy.com/v1/gql/customer',
          'sec-ch-ua': '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"macOS"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-origin',
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
        },
        timeout: 30000,
        maxRedirects: 0,
        validateStatus: (status) => true
      }
    );

    console.log(`\n✅ Response Status: ${response.status}`);
    
    if (response.status === 200) {
      console.log('🎉 SUCCESS! Got GraphQL response');
      
      // Show schema info
      if (response.data?.data?.__schema) {
        const schema = response.data.data.__schema;
        console.log('\n📊 Schema Information:');
        console.log(`- Query Type: ${schema.queryType?.name}`);
        console.log(`- Mutation Type: ${schema.mutationType?.name}`);
        console.log(`- Subscription Type: ${schema.subscriptionType?.name}`);
        console.log(`- Total Types: ${schema.types?.length}`);
        
        // Show first few types
        if (schema.types?.length > 0) {
          console.log('\n📝 First 10 Types:');
          schema.types.slice(0, 10).forEach((type: any) => {
            console.log(`  - ${type.name} (${type.kind})`);
          });
        }
      }
    } else {
      console.log('Response:', JSON.stringify(response.data, null, 2));
    }

  } catch (error: any) {
    console.error('❌ Request failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

// Run the test
testExactCurl();