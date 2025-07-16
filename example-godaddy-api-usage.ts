import { GoDaddyAPI } from './src/core/testing/GoDaddyAPI';
import { GraphQLClient } from './src/core/testing/GraphQLClient';

// Simple usage example
async function simpleExample() {
  // Initialize the API client
  const api = new GoDaddyAPI();

  // Get all ventures
  const venturesData = await api.getVentures();
  console.log('Ventures:', venturesData);

  // Get specific venture
  const ventureId = '422130aa-0353-4652-af72-4c72e3ed8488';
  const venture = await api.getVentureById(ventureId);
  console.log('Venture details:', venture);

  // Update visit counts
  const now = new Date().toISOString();
  await api.updateVisitCounts(ventureId, now, 5);

  // Custom query
  const customQuery = `
    query MyCustomQuery($ventureId: UUID!) {
      venture(ventureId: $ventureId) {
        id
        profile {
          name
        }
      }
    }
  `;

  const customResult = await api.rawQuery(customQuery, { ventureId });
  console.log('Custom result:', customResult);
}

// Advanced usage with direct client
async function advancedExample() {
  const client = new GraphQLClient({
    cookieString: process.env.GODADDY_COOKIES,
    baselineDir: './my-baselines',
  });

  // Execute query and save baseline
  const query = `
    query GetProjects {
      projects {
        edges {
          node {
            id
            status
            domain
          }
        }
      }
    }
  `;

  const result = await client.query(query, {}, true); // true = save baseline

  // Later, compare with baseline
  const newResult = await client.query(query, {}, false); // false = don't save
  const comparison = await client.compareWithBaseline(query, {}, newResult);

  if (!comparison.matches) {
    console.log('Data has changed!', comparison.differences);
  }
}

// Using raw request for exact curl replication
async function curlExample() {
  const client = new GraphQLClient();

  // This mimics the exact curl request format
  const response = await client.rawRequest(
    'getVentureSkeletonAP',
    `query getVentureSkeletonAP {
      user {
        ventures {
          id
          profile {
            lastVisited
            numVisits
            aiOnboarded
            name
            __typename
          }
          projects {
            group
            status
            created
            updated
            domain
            billing {
              id
              plan
              __typename
            }
            parentAAPSubscriptionId
            product {
              ... on DomainProduct {
                dns {
                  hostingProvider
                  hosting_ip
                  __typename
                }
                __typename
              }
              __typename
            }
            __typename
          }
          __typename
        }
        subscriptions {
          offerPlan
          __typename
        }
        __typename
      }
    }`,
    {},
  );

  console.log('Response:', response);
}

// Export for use in other files
export { GoDaddyAPI, GraphQLClient };
