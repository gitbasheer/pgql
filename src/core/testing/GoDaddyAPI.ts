import { GraphQLClient } from './GraphQLClient';

interface GoDaddyAPIConfig {
  cookies?: string;
  baselineDir?: string;
}

export class GoDaddyAPI {
  private client: GraphQLClient;

  constructor(config: GoDaddyAPIConfig = {}) {
    this.client = new GraphQLClient({
      endpoint: 'https://pg.api.godaddy.com/v1/gql/customer',
      cookieString: config.cookies || process.env.GODADDY_COOKIES,
      baselineDir: config.baselineDir,
    });
  }

  async getVentures(variables: any = {}) {
    const query = `
      query getVentureSkeletonAP {
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
      }
    `;

    return this.client.query(query, variables);
  }

  async getVentureById(ventureId: string) {
    const query = `
      query singleVentureByVentureId($ventureId: UUID!) {
        venture(ventureId: $ventureId) {
          id
          profile {
            name
            lastVisited
            numVisits
            __typename
          }
          projects {
            id
            domain
            status
            __typename
          }
          __typename
        }
      }
    `;

    return this.client.query(query, { ventureId });
  }

  async updateVisitCounts(ventureId: string, lastVisited: string, numVisits: number) {
    const mutation = `
      mutation UpdateVisitCounts($ventureId: UUID!, $lastVisited: DateTime!, $numVisits: Int!) {
        ventureProfile(
          ventureId: $ventureId
          lastVisited: $lastVisited
          numVisits: $numVisits
        )
      }
    `;

    return this.client.mutate(mutation, { ventureId, lastVisited, numVisits });
  }

  async getQuickLinksData(ventureId: string) {
    const query = `
      query getQuickLinksData($ventureId: UUID!) {
        venture(ventureId: $ventureId) {
          projects {
            id
            billing {
              id
              plan
              __typename
            }
            domain
            group
            product {
              type
              ... on WebsiteProduct {
                isPublished
                planType
                properties
                __typename
              }
              __typename
            }
            status
            subscription {
              commonName
              id
              productName
              status
              __typename
            }
            __typename
          }
          __typename
        }
      }
    `;

    return this.client.query(query, { ventureId });
  }

  async rawQuery(query: string, variables: any = {}) {
    return this.client.query(query, variables);
  }

  async rawMutation(mutation: string, variables: any = {}) {
    return this.client.mutate(mutation, variables);
  }

  async compareWithBaseline(query: string, variables: any = {}) {
    const currentData = await this.client.query(query, variables, false);
    return this.client.compareWithBaseline(query, variables, currentData);
  }
}

export default GoDaddyAPI;