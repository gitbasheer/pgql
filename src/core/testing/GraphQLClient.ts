import { ApolloClient, InMemoryCache, HttpLink, gql, DocumentNode, NormalizedCacheObject } from '@apollo/client/core';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

export interface GraphQLClientConfig {
  endpoint?: string;
  cookieString?: string;
  appKey?: string;
  clientName?: string;
  baselineDir?: string;
}

export class GraphQLClient {
  private client: ApolloClient<NormalizedCacheObject>;
  private baselineDir: string;
  private endpoint: string;

  constructor(config: GraphQLClientConfig = {}) {
    this.endpoint = config.endpoint || process.env.APOLLO_PG_ENDPOINT || 'https://pg.api.godaddy.com/v1/gql/customer';
    this.baselineDir = config.baselineDir || './baselines';
    
    // Build cookie string from individual env vars
    const authIdp = process.env.auth_idp || '';
    const custIdp = process.env.cust_idp || '';
    const infoCustIdp = process.env.info_cust_idp || '';
    const infoIdp = process.env.info_idp || '';
    
    const cookieString = config.cookieString || 
      `auth_idp=${authIdp}; cust_idp=${custIdp}; info_cust_idp=${infoCustIdp}; info_idp=${infoIdp}` || '';
    
    const appKey = config.appKey || 'vnext-dashboard';
    const clientName = config.clientName || 'vnext-dashboard';

    this.client = new ApolloClient({
      link: new HttpLink({
        uri: this.endpoint,
        fetch: fetch as any,
        headers: {
          'Cookie': cookieString,
          'Content-Type': 'application/json',
          'x-app-key': appKey,
          'apollographql-client-name': clientName,
          'Origin': 'https://dashboard.godaddy.com',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        },
      }),
      cache: new InMemoryCache(),
      defaultOptions: {
        query: {
          errorPolicy: 'all',
        },
      },
    });

    if (!fs.existsSync(this.baselineDir)) {
      fs.mkdirSync(this.baselineDir, { recursive: true });
    }
  }

  async query<T = any>(
    query: string | DocumentNode,
    variables: Record<string, any> = {},
    saveBaseline: boolean = true
  ): Promise<T> {
    try {
      const queryDoc = typeof query === 'string' ? gql(query) : query;
      
      const result = await this.client.query<T>({
        query: queryDoc,
        variables,
        fetchPolicy: 'network-only',
      });

      if (result.errors) {
        console.error('GraphQL Errors:', result.errors);
      }

      if (saveBaseline && result.data) {
        await this.saveBaseline(query.toString(), variables, result.data);
      }

      return result.data;
    } catch (error: any) {
      console.error('GraphQL Request Failed:', error.message);
      if (error.networkError) {
        console.error('Network Error:', error.networkError);
      }
      throw error;
    }
  }

  async mutate<T = any>(
    mutation: string | DocumentNode,
    variables: Record<string, any> = {},
    saveBaseline: boolean = true
  ): Promise<T> {
    try {
      const mutationDoc = typeof mutation === 'string' ? gql(mutation) : mutation;
      
      const result = await this.client.mutate<T>({
        mutation: mutationDoc,
        variables,
      });

      if (result.errors) {
        console.error('GraphQL Errors:', result.errors);
      }

      if (saveBaseline && result.data) {
        await this.saveBaseline(mutation.toString(), variables, result.data);
      }

      return result.data!;
    } catch (error: any) {
      console.error('GraphQL Request Failed:', error.message);
      if (error.networkError) {
        console.error('Network Error:', error.networkError);
      }
      throw error;
    }
  }

  async rawRequest(
    operationName: string,
    query: string,
    variables: Record<string, any> = {}
  ): Promise<any> {
    // Build cookie string from individual env vars
    const authIdp = process.env.auth_idp || '';
    const custIdp = process.env.cust_idp || '';
    const infoCustIdp = process.env.info_cust_idp || '';
    const infoIdp = process.env.info_idp || '';
    
    const cookieString = `auth_idp=${authIdp}; cust_idp=${custIdp}; info_cust_idp=${infoCustIdp}; info_idp=${infoIdp}`;
    
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Accept': '*/*',
        'Content-Type': 'application/json',
        'Cookie': cookieString,
        'x-app-key': 'vnext-dashboard',
        'apollographql-client-name': 'vnext-dashboard',
        'Origin': 'https://dashboard.godaddy.com',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({
        operationName,
        variables,
        query,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} - ${JSON.stringify(data)}`);
    }

    if ((data as any).errors) {
      console.error('GraphQL Errors:', (data as any).errors);
    }

    return data;
  }

  private async saveBaseline(
    query: string,
    variables: Record<string, any>,
    data: any
  ): Promise<void> {
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ query, variables }))
      .digest('hex')
      .substring(0, 16);

    const filename = path.join(this.baselineDir, `${hash}.json`);
    
    const baseline = {
      timestamp: new Date().toISOString(),
      query: query.replace(/\s+/g, ' ').trim(),
      variables,
      response: data,
    };

    await fs.promises.writeFile(filename, JSON.stringify(baseline, null, 2));
  }

  async loadBaseline(query: string, variables: Record<string, any> = {}): Promise<any> {
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ query, variables }))
      .digest('hex')
      .substring(0, 16);

    const filename = path.join(this.baselineDir, `${hash}.json`);
    
    try {
      const content = await fs.promises.readFile(filename, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  async compareWithBaseline(
    query: string,
    variables: Record<string, any> = {},
    currentData: any
  ): Promise<{ matches: boolean; differences?: any }> {
    const baseline = await this.loadBaseline(query, variables);
    
    if (!baseline) {
      return { matches: false, differences: 'No baseline found' };
    }

    const matches = JSON.stringify(baseline.response) === JSON.stringify(currentData);
    
    return {
      matches,
      differences: matches ? undefined : {
        baseline: baseline.response,
        current: currentData,
      },
    };
  }
}

export default GraphQLClient;