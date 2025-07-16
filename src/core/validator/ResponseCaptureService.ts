import axios, { AxiosInstance, AxiosError } from 'axios';
import pRetry from 'p-retry';
import { DocumentNode, print } from 'graphql';
import { logger } from '../../utils/logger.js';
import {
  EndpointConfig,
  CapturedResponse,
  BaselineResponses,
  TransformedResponses,
  ResponseMetadata,
  VariableGenerator,
  AuthConfig,
} from './types.js';
import { ResolvedQuery } from '../extraction/types/query.types.js';
import { VariableGeneratorImpl } from './VariableGenerator.js';
import pLimit from 'p-limit';

export class ResponseCaptureService {
  private clients: Map<string, AxiosInstance> = new Map();
  private variableGenerator: VariableGenerator;
  private concurrencyLimit: ReturnType<typeof pLimit>;

  constructor(
    private endpoints: EndpointConfig[],
    private options: {
      maxConcurrency?: number;
      timeout?: number;
      variableGeneration?: 'auto' | 'manual' | 'examples';
    } = {},
  ) {
    this.variableGenerator = new VariableGeneratorImpl();
    this.concurrencyLimit = pLimit(options.maxConcurrency || 10);
    // Don't initialize clients in constructor since it's now async
  }

  private async ensureClientsInitialized(): Promise<void> {
    if (this.clients.size === 0) {
      await this.initializeClients();
    }
  }

  private async initializeClients(): Promise<void> {
    for (const endpoint of this.endpoints) {
      const axiosConfig: any = {
        baseURL: endpoint.url,
        timeout: endpoint.timeout || this.options.timeout || 30000,
        headers: {
          'Content-Type': 'application/json',
          'x-app-key': 'vnext-dashboard',
          ...endpoint.headers,
          ...this.getAuthHeaders(endpoint.authentication),
        },
      };

      // Handle cookie authentication
      if (endpoint.authentication?.type === 'cookie' && endpoint.authentication.cookies) {
        const cookieString = Object.entries(endpoint.authentication.cookies.cookies)
          .map(([name, value]) => `${name}=${value}`)
          .join('; ');

        axiosConfig.headers['Cookie'] = cookieString;
        axiosConfig.withCredentials = true;
      }

      // Handle SSO authentication - get real cookies from SSO service
      if (endpoint.authentication?.type === 'sso') {
        logger.info(`SSO authentication configured for ${endpoint.url}`);

        try {
          // Import AuthHelper dynamically to avoid circular dependency
          const { AuthHelper } = await import('./AuthHelper.js');

          // Get SSO tokens using credentials from env
          const ssoTokens = await AuthHelper.getSSOTokens();

          const cookieString = AuthHelper.formatCookies(ssoTokens);

          axiosConfig.headers['Cookie'] = cookieString;
          axiosConfig.withCredentials = true;

          logger.info('Successfully configured SSO authentication');
        } catch (error) {
          logger.error('Failed to get SSO tokens:', error);
          throw new Error('SSO authentication failed');
        }
      }

      const client = axios.create(axiosConfig);

      // Add response interceptor for error handling
      client.interceptors.response.use(
        (response) => response,
        async (error) => {
          logger.error(`Request failed for ${endpoint.url}:`, error.message);
          throw error;
        },
      );

      this.clients.set(endpoint.url, client);
    }
  }

  private getAuthHeaders(auth?: AuthConfig): Record<string, string> {
    if (!auth) return {};

    switch (auth.type) {
      case 'bearer':
        // MVP: Support Apollo auth token from env
        const token = auth.token || process.env.APOLLO_AUTH_TOKEN;
        if (!token) {
          logger.warn('No bearer token configured, using test token');
          return {
            Authorization: `Bearer ${process.env.APOLLO_AUTH_TOKEN || 'test_apollo_token'}`,
          };
        }
        return { Authorization: `Bearer ${token}` };
      case 'api-key':
        return { [auth.header || 'X-API-Key']: auth.token || process.env.APOLLO_API_KEY || '' };
      case 'cookie':
        // Cookies are handled in axios config, not headers
        return {};
      case 'sso':
        // SSO is now handled in initializeClients with MVP implementation
        return {};
      case 'custom':
        // Custom auth should be handled by the customAuth function
        return {};
      default:
        return {};
    }
  }

  async captureBaseline(
    queries: ResolvedQuery[],
    endpoint?: EndpointConfig,
  ): Promise<BaselineResponses> {
    // Ensure clients are initialized
    await this.ensureClientsInitialized();

    const targetEndpoint = endpoint || this.endpoints[0];
    logger.info(`Capturing baseline responses from ${targetEndpoint.url}`);

    const responses = new Map<string, CapturedResponse>();
    const errors: Array<{ query: ResolvedQuery; error: Error }> = [];

    // Process queries with concurrency control
    const capturePromises = queries.map((query) =>
      this.concurrencyLimit(async () => {
        try {
          const captured = await this.captureQueryResponse(query, targetEndpoint, 'baseline');
          responses.set(query.id, captured);
        } catch (error) {
          errors.push({ query, error: error as Error });
          logger.error(`Failed to capture baseline for ${query.id}:`, error);
          // Don't store failed captures in responses map
        }
      }),
    );

    await Promise.all(capturePromises);

    logger.info(`Captured ${responses.size} baseline responses, ${errors.length} errors`);

    return {
      responses,
      metadata: {
        capturedAt: new Date(),
        totalQueries: queries.length,
        successCount: responses.size,
        errorCount: errors.length,
        endpoint: targetEndpoint,
      },
    };
  }

  async captureTransformed(
    queries: ResolvedQuery[],
    endpoint?: EndpointConfig,
    transformationVersion?: string,
  ): Promise<TransformedResponses> {
    const baselineResponses = await this.captureBaseline(queries, endpoint);

    return {
      ...baselineResponses,
      transformationVersion: transformationVersion || 'latest',
    };
  }

  private async captureQueryResponse(
    query: ResolvedQuery,
    endpoint: EndpointConfig,
    version: 'baseline' | 'transformed',
  ): Promise<CapturedResponse> {
    const client = this.clients.get(endpoint.url);
    if (!client) {
      throw new Error(`No client configured for endpoint: ${endpoint.url}`);
    }

    // Generate variables if needed
    const variables = await this.generateVariables(query);

    const startTime = Date.now();
    let response;
    let statusCode = 200;
    let responseHeaders: Record<string, string> = {};

    try {
      // Use retry logic
      response = await pRetry(
        async () => {
          // Use resolvedContent which is the GraphQL query string, or generate from AST
          const queryString =
            query.resolvedContent || (query.ast ? print(query.ast) : query.content);
          const result = await client.post('', {
            query: queryString,
            operationName: query.name,
            variables: variables[0] || {}, // Use first set of variables
          });

          statusCode = result.status;
          responseHeaders = result.headers as Record<string, string>;
          return result.data;
        },
        {
          retries: endpoint.retryPolicy?.maxRetries || 3,
          minTimeout: endpoint.retryPolicy?.initialDelay || 1000,
          maxTimeout: endpoint.retryPolicy?.maxDelay || 30000,
          factor: endpoint.retryPolicy?.backoffMultiplier || 2,
          onFailedAttempt: (error) => {
            logger.warn(`Attempt ${error.attemptNumber} failed for ${query.id}: ${error.message}`);
          },
        },
      );
    } catch (error) {
      // Even on error, we want to capture the response
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        response = {
          errors: [
            {
              message: error.message,
              extensions: {
                code: error.code,
                response: axiosError.response?.data,
              },
            },
          ],
        };
        statusCode = axiosError.response?.status || 0;
        responseHeaders = (axiosError.response?.headers as Record<string, string>) || {};
      } else {
        throw error;
      }
    }

    const duration = Date.now() - startTime;
    const responseSize = JSON.stringify(response).length;

    return {
      queryId: query.id,
      operationName: query.name,
      variables: variables[0],
      response,
      metadata: {
        duration,
        statusCode,
        headers: responseHeaders,
        size: responseSize,
        endpoint: endpoint.url,
        environment: endpoint.environment || 'production',
      },
      timestamp: new Date(),
      version,
    };
  }

  private async generateVariables(query: ResolvedQuery): Promise<Record<string, any>[]> {
    if (this.options.variableGeneration === 'manual') {
      // Use existing variables if any - convert from QueryVariable[] to object
      if (query.variables && query.variables.length > 0) {
        const varsObject = query.variables.reduce(
          (acc, v) => {
            acc[v.name] = v.defaultValue;
            return acc;
          },
          {} as Record<string, any>,
        );
        return [varsObject];
      }
      return [{}];
    }

    // Auto-generate variables based on query
    try {
      const ast = query.ast || null;
      if (!ast) {
        logger.warn(`No AST available for ${query.id}, using empty variables`);
        return [{}];
      }
      const generated = await this.variableGenerator.generateForQuery(ast);
      return generated.length > 0 ? generated : [{}];
    } catch (error) {
      logger.warn(`Failed to generate variables for ${query.id}, using empty object`);
      return [{}];
    }
  }

  async captureWithVariableSets(
    query: ResolvedQuery,
    variableSets: Record<string, any>[],
    endpoint?: EndpointConfig,
  ): Promise<CapturedResponse[]> {
    const targetEndpoint = endpoint || this.endpoints[0];
    const responses: CapturedResponse[] = [];

    for (const variables of variableSets) {
      // We need to pass variables differently since ResolvedQuery expects QueryVariable[]
      // Create a modified query object with the variables for this iteration
      const response = await this.captureQueryResponse(query, targetEndpoint, 'baseline');
      responses.push(response);
    }

    return responses;
  }

  // Support for subscriptions
  async captureSubscription(
    query: ResolvedQuery,
    endpoint: EndpointConfig,
    duration: number = 5000,
  ): Promise<CapturedResponse[]> {
    // For now, we'll implement a basic subscription capture
    // In production, this would use WebSocket or SSE
    logger.warn('Subscription capture is simplified - using single query capture');

    const response = await this.captureQueryResponse(query, endpoint, 'baseline');
    return [response];
  }

  // Support for batched queries
  async captureBatch(
    queries: ResolvedQuery[],
    endpoint?: EndpointConfig,
  ): Promise<CapturedResponse> {
    const targetEndpoint = endpoint || this.endpoints[0];
    const client = this.clients.get(targetEndpoint.url);

    if (!client) {
      throw new Error(`No client configured for endpoint: ${targetEndpoint.url}`);
    }

    const batchedQuery = queries.map((q) => ({
      query: q.resolvedContent || (q.ast ? print(q.ast) : q.content),
      operationName: q.name,
      variables: {}, // Convert QueryVariable[] to object if needed
    }));

    const startTime = Date.now();
    const response = await client.post('', batchedQuery);
    const duration = Date.now() - startTime;

    return {
      queryId: 'batch-' + Date.now(),
      operationName: 'BatchQuery',
      variables: {},
      response: response.data,
      metadata: {
        duration,
        statusCode: response.status,
        headers: response.headers as Record<string, string>,
        size: JSON.stringify(response.data).length,
        endpoint: targetEndpoint.url,
        environment: targetEndpoint.environment || 'production',
      },
      timestamp: new Date(),
      version: 'baseline',
    };
  }

  // Clean up resources
  destroy(): void {
    this.clients.clear();
  }
}
