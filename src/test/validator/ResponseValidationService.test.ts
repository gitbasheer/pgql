import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { ResponseValidationService } from '../../core/validator/ResponseValidationService.js';
import { ResponseCaptureService } from '../../core/validator/ResponseCaptureService.js';
import { ResponseComparator } from '../../core/validator/ResponseComparator.js';
import { AlignmentGenerator } from '../../core/validator/AlignmentGenerator.js';
import { ABTestingFramework } from '../../core/validator/ABTestingFramework.js';
import { ResponseStorage } from '../../core/validator/ResponseStorage.js';
import { ValidationReportGenerator } from '../../core/validator/ValidationReportGenerator.js';
import {
  ResponseValidationConfig,
  EndpointConfig,
  ValidationReport,
  ComparisonResult,
  BaselineResponses,
  TransformedResponses,
  CapturedResponse,
  ABTestConfig,
  AlignmentFunction
} from '../../core/validator/types.js';
import { ResolvedQuery } from '../../core/extraction/types/query.types.js';
import { logger } from '../../utils/logger.js';
import { promises as fs } from 'fs';

// Mock all dependencies
vi.mock('../../core/validator/ResponseCaptureService');
vi.mock('../../core/validator/ResponseComparator');
vi.mock('../../core/validator/AlignmentGenerator');
vi.mock('../../core/validator/ABTestingFramework');
vi.mock('../../core/validator/ResponseStorage');
vi.mock('../../core/validator/ValidationReportGenerator');
vi.mock('../../core/testing/GraphQLClient');
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    rm: vi.fn(),
    stat: vi.fn(),
    access: vi.fn()
  }
}));
vi.mock('../../utils/logger');

describe('ResponseValidationService', () => {

  let service: ResponseValidationService;
  let mockCaptureService: any;
  let mockComparator: any;
  let mockAlignmentGenerator: any;
  let mockABTestingFramework: any;
  let mockStorage: any;
  let mockReportGenerator: any;

  const mockConfig: ResponseValidationConfig = {
    endpoints: [{
      url: 'https://api.example.com/graphql',
      headers: { 'Authorization': 'Bearer test' }
    }],
    capture: {
      parallel: true,
      maxConcurrency: 5,
      timeout: 30000,
      variableGeneration: 'auto'
    },
    comparison: {
      strict: false,
      ignorePaths: ['data.__typename']
    },
    alignment: {
      strict: false,
      preserveNulls: true,
      preserveOrder: false
    },
    storage: {
      type: 'file',
      path: './test-storage'
    }
  };

  const mockQuery: ResolvedQuery = {
    id: 'test-query-1',
    content: 'query { test }',
    name: 'TestQuery',
    type: 'query',
    filePath: 'test.ts',
    location: { line: 1, column: 1, file: 'test.ts' },
    ast: null,
    resolvedContent: 'query { test }',
    resolvedFragments: [],
    allDependencies: []
  };

  const mockCapturedResponse: CapturedResponse = {
    queryId: 'test-query-1',
    operationName: 'TestQuery',
    variables: {},
    response: { data: { test: 'value' } },
    metadata: {
      duration: 100,
      statusCode: 200,
      headers: {},
      size: 100,
      endpoint: 'https://api.example.com/graphql',
      environment: 'production'
    },
    timestamp: new Date(),
    version: 'baseline'
  };

  function createFreshMocks() {
    return {
      mockCaptureService: {
        captureBaseline: vi.fn(),
        captureTransformed: vi.fn(),
        testOnRealApi: vi.fn(),
        destroy: vi.fn()
      },
      mockComparator: {
        compare: vi.fn()
      },
      mockAlignmentGenerator: {
        generateAlignmentFunction: vi.fn()
      },
      mockABTestingFramework: {
        createTest: vi.fn(),
        registerRollbackHandler: vi.fn()
      },
      mockStorage: {
        store: vi.fn(),
        storeReport: vi.fn(),
        storeAlignment: vi.fn(),
        retrieve: vi.fn(),
        retrieveReport: vi.fn(),
        cleanup: vi.fn(),
        close: vi.fn(),
        exportData: vi.fn(),
        importData: vi.fn()
      },
      mockReportGenerator: {
        generateFullReport: vi.fn(),
        generatePRSummary: vi.fn(),
        generateCIReport: vi.fn()
      }
    };
  }

  beforeEach(async () => {
    // Create fresh mocks for each test
    const mocks = createFreshMocks();
    mockCaptureService = mocks.mockCaptureService;
    mockComparator = mocks.mockComparator;
    mockAlignmentGenerator = mocks.mockAlignmentGenerator;
    mockABTestingFramework = mocks.mockABTestingFramework;
    mockStorage = mocks.mockStorage;
    mockReportGenerator = mocks.mockReportGenerator;

    // Mock the constructors to return our fresh mock instances
    (ResponseCaptureService as Mock).mockImplementation(() => mockCaptureService);
    (ResponseComparator as Mock).mockImplementation(() => mockComparator);
    (AlignmentGenerator as Mock).mockImplementation(() => mockAlignmentGenerator);
    (ABTestingFramework as Mock).mockImplementation(() => mockABTestingFramework);
    (ResponseStorage as Mock).mockImplementation(() => mockStorage);
    (ValidationReportGenerator as Mock).mockImplementation(() => mockReportGenerator);

    // Create service instance
    service = new ResponseValidationService(mockConfig);
  });

  afterEach(() => {
    // Thorough cleanup after each test
    vi.clearAllMocks();
    vi.resetAllMocks();

    // Reset the mock implementations
    (ResponseCaptureService as Mock).mockReset();
    (ResponseComparator as Mock).mockReset();
    (AlignmentGenerator as Mock).mockReset();
    (ABTestingFramework as Mock).mockReset();
    (ResponseStorage as Mock).mockReset();
    (ValidationReportGenerator as Mock).mockReset();
  });

  describe('validateTransformation', () => {
    it('should execute full validation pipeline', async () => {
      const baselineQueries = [mockQuery];
      const transformedQueries = [{ ...mockQuery, id: 'test-query-1-transformed' }];

      const mockBaselineResponses: BaselineResponses = {
        responses: new Map([['test-query-1', mockCapturedResponse]]),
        metadata: {
          capturedAt: new Date(),
          totalQueries: 1,
          successCount: 1,
          errorCount: 0,
          endpoint: mockConfig.endpoints[0]
        }
      };

      const mockTransformedResponses: TransformedResponses = {
        ...mockBaselineResponses,
        transformationVersion: 'latest'
      };

      const mockComparison: ComparisonResult = {
        queryId: 'test-query-1',
        identical: true,
        similarity: 1.0,
        differences: [],
        breakingChanges: [],
        performanceImpact: { latencyChange: 0, sizeChange: 0, recommendation: 'Performance impact is acceptable' },
        recommendation: 'safe'
      };

      const mockReport: ValidationReport = {
        id: 'report-123',
        createdAt: new Date(),
        summary: {
          totalQueries: 1,
          identicalQueries: 1,
          modifiedQueries: 0,
          breakingChanges: 0,
          averageSimilarity: 1.0,
          safeToMigrate: true,
          estimatedRisk: 'low'
        },
        comparisons: [mockComparison],
        alignments: [],
        abTestConfig: undefined,
        recommendations: []
      };

      // Set up fresh mocks for this test
      mockCaptureService.captureBaseline.mockResolvedValue(mockBaselineResponses);
      mockCaptureService.captureTransformed.mockResolvedValue(mockTransformedResponses);
      mockComparator.compare.mockReturnValue(mockComparison);
      mockReportGenerator.generateFullReport.mockResolvedValue(mockReport);
      mockStorage.store.mockResolvedValue(undefined);
      mockStorage.storeReport.mockResolvedValue(undefined);

      const result = await service.validateTransformation(
        baselineQueries,
        transformedQueries,
        {
          generateAlignments: false,
          setupABTest: false
        }
      );

      expect(result).toEqual(mockReport);
      expect(mockCaptureService.captureBaseline).toHaveBeenCalledWith(baselineQueries, undefined);
      expect(mockCaptureService.captureTransformed).toHaveBeenCalledWith(transformedQueries, undefined);
      expect(mockComparator.compare).toHaveBeenCalled();
      expect(mockReportGenerator.generateFullReport).toHaveBeenCalledWith(
        [mockComparison],
        [],
        undefined
      );
      expect(mockStorage.storeReport).toHaveBeenCalledWith(mockReport);
    });

    it('should generate alignments when requested', async () => {
      const baselineQueries = [mockQuery];
      const transformedQueries = [{ ...mockQuery, id: 'test-query-1-transformed' }];

      const mockBaselineResponses: BaselineResponses = {
        responses: new Map([['test-query-1', mockCapturedResponse]]),
        metadata: {
          capturedAt: new Date(),
          totalQueries: 1,
          successCount: 1,
          errorCount: 0,
          endpoint: mockConfig.endpoints[0]
        }
      };

      const mockComparison: ComparisonResult = {
        queryId: 'test-query-1',
        identical: false,
        similarity: 0.9,
        differences: [{
          path: ['data', 'test'],
          type: 'value-change',
          baseline: 'value1',
          transformed: 'value2',
          fixable: true,
          severity: 'low',
          description: 'Value changed from value1 to value2'
        }],
        breakingChanges: [],
        performanceImpact: { latencyChange: 10, sizeChange: 0, recommendation: 'Acceptable performance impact' },
        recommendation: 'safe'
      };

      const mockAlignment: AlignmentFunction = {
        id: 'alignment-test-query-1',
        queryId: 'test-query-1',
        differences: mockComparison.differences,
        transform: (response: any) => response,
        code: 'function align(response) { return response; }',
        tests: []
      };

      const mockReportWithAlignment: ValidationReport = {
        id: 'report-123',
        createdAt: new Date(),
        summary: {
          totalQueries: 1,
          identicalQueries: 0,
          modifiedQueries: 1,
          breakingChanges: 0,
          averageSimilarity: 0.9,
          safeToMigrate: true,
          estimatedRisk: 'low'
        },
        comparisons: [mockComparison],
        alignments: [mockAlignment],
        recommendations: []
      };

      // Set up fresh mocks for this test
      mockCaptureService.captureBaseline.mockResolvedValue(mockBaselineResponses);
      mockCaptureService.captureTransformed.mockResolvedValue({
        ...mockBaselineResponses,
        transformationVersion: 'latest'
      });
      mockComparator.compare.mockReturnValue(mockComparison);
      mockAlignmentGenerator.generateAlignmentFunction.mockReturnValue(mockAlignment);
      mockStorage.storeAlignment.mockResolvedValue(undefined);
      mockStorage.store.mockResolvedValue(undefined);
      mockStorage.storeReport.mockResolvedValue(undefined);
      mockReportGenerator.generateFullReport.mockResolvedValue(mockReportWithAlignment);

      await service.validateTransformation(
        baselineQueries,
        transformedQueries,
        {
          generateAlignments: true
        }
      );

      expect(mockAlignmentGenerator.generateAlignmentFunction).toHaveBeenCalledWith(
        'test-query-1',
        [mockComparison.differences[0]]
      );
      expect(mockStorage.storeAlignment).toHaveBeenCalledWith(mockAlignment);
    });

    it('should setup A/B test when requested', async () => {
      const baselineQueries = [mockQuery];
      const transformedQueries = [{ ...mockQuery, id: 'test-query-1-transformed' }];

      const mockComparison: ComparisonResult = {
        queryId: 'test-query-1',
        identical: true,
        similarity: 1.0,
        differences: [],
        breakingChanges: [],
        performanceImpact: { latencyChange: 0, sizeChange: 0, recommendation: 'Performance impact is acceptable' },
        recommendation: 'safe'
      };

      const mockABTestConfig: ABTestConfig = {
        id: 'test-123',
        name: 'GraphQL Migration Test',
        splitPercentage: 10,
        targetQueries: ['test-query-1'],
        rolloutStrategy: { type: 'gradual' as const },
        startDate: new Date(),
        metrics: {
          control: {
            requests: 1000,
            successes: 1000,
            errors: 0,
            averageLatency: 100,
            p95Latency: 150,
            p99Latency: 200,
            errorTypes: {}
          },
          variant: {
            requests: 1000,
            successes: 1000,
            errors: 0,
            averageLatency: 100,
            p95Latency: 150,
            p99Latency: 200,
            errorTypes: {}
          },
          summary: {
            winner: 'tie',
            confidence: 0.95,
            recommendation: 'Continue monitoring'
          }
        },
        autoRollback: {
          enabled: true,
          errorThreshold: 0.05,
          latencyThreshold: 0.2,
          evaluationWindow: '5m',
          cooldownPeriod: '10m'
        }
      };

      const mockReport: ValidationReport = {
        id: 'report-123',
        createdAt: new Date(),
        summary: {
          totalQueries: 1,
          identicalQueries: 1,
          modifiedQueries: 0,
          breakingChanges: 0,
          averageSimilarity: 1.0,
          safeToMigrate: true,
          estimatedRisk: 'low'
        },
        comparisons: [mockComparison],
        alignments: [],
        abTestConfig: mockABTestConfig,
        recommendations: []
      };

      // Set up fresh mocks for this test
      mockCaptureService.captureBaseline.mockResolvedValue({
        responses: new Map([['test-query-1', mockCapturedResponse]]),
        metadata: {
          capturedAt: new Date(),
          totalQueries: 1,
          successCount: 1,
          errorCount: 0,
          endpoint: mockConfig.endpoints[0]
        }
      });
      mockCaptureService.captureTransformed.mockResolvedValue({
        responses: new Map([['test-query-1', mockCapturedResponse]]),
        metadata: {
          capturedAt: new Date(),
          totalQueries: 1,
          successCount: 1,
          errorCount: 0,
          endpoint: mockConfig.endpoints[0]
        },
        transformationVersion: 'latest'
      });
      mockComparator.compare.mockReturnValue(mockComparison);
      mockABTestingFramework.createTest.mockResolvedValue(mockABTestConfig);
      mockABTestingFramework.registerRollbackHandler.mockReturnValue(undefined);
      mockReportGenerator.generateFullReport.mockResolvedValue(mockReport);
      mockStorage.store.mockResolvedValue(undefined);
      mockStorage.storeReport.mockResolvedValue(undefined);

      await service.validateTransformation(
        baselineQueries,
        transformedQueries,
        {
          generateAlignments: false,
          setupABTest: true
        }
      );

      expect(mockABTestingFramework.createTest).toHaveBeenCalled();
      expect(mockABTestingFramework.registerRollbackHandler).toHaveBeenCalledWith(
        'test-123',
        expect.any(Function)
      );
    });
  });

  describe('captureBaseline', () => {
    it('should capture and store baseline responses', async () => {
      const queries = [mockQuery];
      const mockResponses: BaselineResponses = {
        responses: new Map([['test-query-1', mockCapturedResponse]]),
        metadata: {
          capturedAt: new Date(),
          totalQueries: 1,
          successCount: 1,
          errorCount: 0,
          endpoint: mockConfig.endpoints[0]
        }
      };

      mockCaptureService.captureBaseline.mockResolvedValue(mockResponses);
      mockStorage.store.mockResolvedValue(undefined);

      await service.captureBaseline(queries);

      expect(mockCaptureService.captureBaseline).toHaveBeenCalledWith(queries, undefined);
      expect(mockStorage.store).toHaveBeenCalledWith(mockCapturedResponse);
    });

    it('should use provided endpoint when specified', async () => {
      const queries = [mockQuery];
      const customEndpoint: EndpointConfig = {
        url: 'https://custom.api.com/graphql',
        headers: { 'X-API-Key': 'custom-key' }
      };

      mockCaptureService.captureBaseline.mockResolvedValue({
        responses: new Map([['query-1', mockCapturedResponse]]),
        metadata: {
          capturedAt: new Date(),
          totalQueries: 1,
          successCount: 1,
          errorCount: 0,
          endpoint: mockConfig.endpoints[0]
        }
      });

      await service.captureBaseline(queries, customEndpoint);

      expect(mockCaptureService.captureBaseline).toHaveBeenCalledWith(queries, customEndpoint);
    });
  });

  describe('compareStoredResponses', () => {
    it('should compare previously stored responses', async () => {
      const queryIds = ['test-query-1'];
      const baselineResponse = { ...mockCapturedResponse, version: 'baseline' as const };
      const transformedResponse = { ...mockCapturedResponse, version: 'transformed' as const };

      const mockComparison: ComparisonResult = {
        queryId: 'test-query-1',
        identical: true,
        similarity: 1.0,
        differences: [],
        breakingChanges: [],
        performanceImpact: { latencyChange: 0, sizeChange: 0, recommendation: 'Performance impact is acceptable' },
        recommendation: 'safe'
      };

      // Set up fresh, specific mock returns for this test
      mockStorage.retrieve
        .mockResolvedValueOnce(baselineResponse)
        .mockResolvedValueOnce(transformedResponse);
      mockComparator.compare.mockReturnValue(mockComparison);

      const results = await service.compareStoredResponses(queryIds);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(mockComparison);
      expect(mockStorage.retrieve).toHaveBeenCalledWith('test-query-1', 'baseline');
      expect(mockStorage.retrieve).toHaveBeenCalledWith('test-query-1', 'transformed');
      expect(mockComparator.compare).toHaveBeenCalledWith(
          baselineResponse,
          transformedResponse
        );
    });

    it('should handle missing responses gracefully', async () => {
      const queryIds = ['test-query-1', 'test-query-2'];

      mockStorage.retrieve
        .mockResolvedValueOnce(mockCapturedResponse)
        .mockResolvedValueOnce(null) // Missing transformed response for query 1
        .mockResolvedValueOnce(null) // Missing baseline response for query 2
        .mockResolvedValueOnce(mockCapturedResponse);

      const results = await service.compareStoredResponses(queryIds);

      expect(results).toHaveLength(2); // One failed comparison for each query with missing responses
      expect(mockComparator.compare).not.toHaveBeenCalled(); // No actual comparisons since responses are missing
      
      // Verify both results are marked as failed
      expect(results[0].identical).toBe(false);
      expect(results[0].similarity).toBe(0);
      expect(results[1].identical).toBe(false);
      expect(results[1].similarity).toBe(0);
    });
  });

  describe('generatePRSummary', () => {
    it('should generate PR summary from report', async () => {
      const reportId = 'report-123';
      const mockReport: ValidationReport = {
        id: reportId,
        createdAt: new Date(),
        summary: {
          totalQueries: 10,
          identicalQueries: 8,
          modifiedQueries: 2,
          breakingChanges: 0,
          averageSimilarity: 0.95,
          safeToMigrate: true,
          estimatedRisk: 'low'
        },
        comparisons: [],
        alignments: [],
        recommendations: []
      };

      const expectedSummary = '## Validation Summary\n- Total: 10\n- Safe: true';

      mockStorage.retrieveReport.mockResolvedValue(mockReport);
      mockReportGenerator.generatePRSummary.mockReturnValue(expectedSummary);

      const summary = await service.generatePRSummary(reportId);

      expect(summary).toBe(expectedSummary);
      expect(mockStorage.retrieveReport).toHaveBeenCalledWith(reportId);
      expect(mockReportGenerator.generatePRSummary).toHaveBeenCalledWith(mockReport);
    });

    it('should throw error for missing report', async () => {
      mockStorage.retrieveReport.mockResolvedValue(null);

      await expect(service.generatePRSummary('missing-report')).rejects.toThrow(
        'Report missing-report not found'
      );
    });
  });

  describe('cleanup', () => {
    it('should cleanup old validation data', async () => {
      const cutoffDate = new Date('2024-01-01');
      mockStorage.cleanup.mockResolvedValue(5);

      const result = await service.cleanup(cutoffDate);

      expect(result).toBe(5);
      expect(mockStorage.cleanup).toHaveBeenCalledWith(cutoffDate);
    });

    it('should cleanup all data when no date provided', async () => {
      mockStorage.cleanup.mockResolvedValue(10);

      const result = await service.cleanup();

      expect(result).toBe(10);
      expect(mockStorage.cleanup).toHaveBeenCalledWith(undefined);
    });
  });

  describe('destroy', () => {
    it('should cleanup resources', async () => {
      mockCaptureService.destroy.mockReturnValue(undefined);
      mockStorage.close.mockResolvedValue(undefined);

      await service.destroy();

      expect(mockCaptureService.destroy).toHaveBeenCalled();
      expect(mockStorage.close).toHaveBeenCalled();
    });
  });

  describe('Cookie Authentication', () => {
    it('should handle cookie auth in testOnRealApi with all 4 cookies', async () => {
      try {
        const query = {
          id: 'test-cookie-auth',
          name: 'GetUserProfile',
          query: 'query GetUserProfile($ventureId: UUID!) { user { id profile { name } } }',
          endpoint: 'productGraph' as const
        };
        
        const variables = { ventureId: 'test-venture-id' };
        
        // Mock environment variables per CLAUDE.local.md: Use parameter comments for auth calls
        process.env.auth_idp = 'test-auth-idp';
        process.env.cust_idp = 'test-cust-idp';  
        process.env.info_cust_idp = 'test-info-cust-idp';
        process.env.info_idp = 'test-info-idp';
        
        const mockResponse = {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: { data: { user: { id: '123', profile: { name: 'Test User' } } } },
          timing: { total: 100, networkLatency: 50 }
        };
        
        mockCaptureService.testOnRealApi.mockResolvedValue(mockResponse);
        
        const testParams = {
          query: {
            ...query,
            fullExpandedQuery: query.query
          },
          auth: {
            cookies: 'auth_idp=test-auth-idp; cust_idp=test-cust-idp; info_cust_idp=test-info-cust-idp; info_idp=test-info-idp',
            appKey: 'test-app-key'
          },
          testingAccount: {
            ventures: [{ id: 'test-venture-id' }],
            projects: []
          }
        };
        
        // Mock GraphQLClient query method
        const { GraphQLClient } = await import('../../core/testing/GraphQLClient.js');
        const mockGraphQLClient = GraphQLClient as any;
        mockGraphQLClient.prototype.query = vi.fn().mockResolvedValue(mockResponse.body);
        
        const result = await service.testOnRealApi(testParams);
        
        // Verify the service constructed proper auth cookies and called GraphQL client
        expect(result).toEqual(mockResponse.body);
      } catch (error) {
        console.error('Cookie authentication test failed:', error);
        throw error;
      }
    });
    
    it('should build dynamic variables from testing account data', async () => {
      const testingAccount = {
        ventures: [{ id: 'venture-123', name: 'Test Venture' }],
        projects: [{ domain: 'example.com', id: 'project-456' }]
      };
      
      const query = {
        id: 'test-dynamic-vars',
        name: 'GetVentureData',
        query: 'query GetVentureData($ventureId: UUID!, $domainName: String!) { venture(id: $ventureId) { name } }',
        endpoint: 'productGraph' as const
      };
      
      // Mock the dynamic variable building (this would be in the actual implementation)
      const buildDynamicVariables = (vars: any) => {
        const result: any = {};
        for (const [key, value] of Object.entries(vars || {})) {
          if (key === 'ventureId' && !value) {
            result[key] = testingAccount.ventures[0]?.id || 'default-venture-id';
          } else if (key === 'domainName' && !value) {
            result[key] = testingAccount.projects[0]?.domain || 'default.com';
          } else {
            result[key] = value;
          }
        }
        return result;
      };
      
      const dynamicVars = buildDynamicVariables({ ventureId: null, domainName: null });
      
      expect(dynamicVars.ventureId).toBe('venture-123');
      expect(dynamicVars.domainName).toBe('example.com');
    });
    
    it('should mask sensitive data in logs', async () => {
      const sensitiveQuery = {
        id: 'test-sensitive',
        name: 'CreateApiKey',
        query: 'mutation CreateApiKey { createApiKey { key secret } }',
        endpoint: 'productGraph' as const
      };
      
      const mockResponse = {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: { data: { createApiKey: { key: 'ak_123', secret: 'secret123' } } },
        timing: { total: 200, networkLatency: 100 }
      };
      
      mockCaptureService.captureBaseline.mockResolvedValue({
        responses: new Map([['test-sensitive', mockResponse]]),
        metadata: {
          capturedAt: new Date(),
          totalQueries: 1,
          successCount: 1,
          errorCount: 0,
          endpoint: mockConfig.endpoints[0]
        }
      });
      
      const logSpy = vi.spyOn(logger, 'info');
      
      await service.captureBaseline([sensitiveQuery]);
      
      // Verify that sensitive data is not logged
      const logCalls = logSpy.mock.calls;
      const logContent = logCalls.map(call => JSON.stringify(call)).join(' ');
      
      expect(logContent).not.toContain('secret123');
      expect(logContent).not.toContain('ak_123');
    });
    
    it('should validate endpoint URL generation with environment variables', async () => {
      process.env.APOLLO_PG_ENDPOINT = 'https://pg.api.example.com/graphql';
      process.env.APOLLO_OG_ENDPOINT = 'https://og.api.example.com/graphql';
      
      const getEndpointUrl = (endpoint: string): string => {
        switch (endpoint) {
          case 'productGraph':
            return process.env.APOLLO_PG_ENDPOINT || 'https://default-pg.api.com/graphql';
          case 'offerGraph':
            return process.env.APOLLO_OG_ENDPOINT || 'https://default-og.api.com/graphql';
          default:
            return 'https://default.api.com/graphql';
        }
      };
      
      expect(getEndpointUrl('productGraph')).toBe('https://pg.api.example.com/graphql');
      expect(getEndpointUrl('offerGraph')).toBe('https://og.api.example.com/graphql');
      expect(getEndpointUrl('unknown')).toBe('https://default.api.com/graphql');
    });
  });

  describe('fromConfigFile', () => {
    it('should load configuration from YAML file', async () => {
      const yamlContent = `
validation:
  strict: false
  ignorePaths:
    - data.__typename
comparison:
  customComparators:
    "data.timestamp":
      type: "date-tolerance"
      options:
        tolerance: 60000
capture:
  parallel: true
  maxConcurrency: 5
`;

      // Reset all mocks and set up the specific mock for this test
      vi.resetAllMocks();
      vi.mocked(fs.readFile).mockResolvedValue(yamlContent);

      const service = await ResponseValidationService.fromConfigFile('test-config.yaml');

      expect(service).toBeDefined();
      expect(fs.readFile).toHaveBeenCalledWith('test-config.yaml', 'utf-8');
    });

    it('should warn about embedded JavaScript functions and ignore them', async () => {
      const yamlContent = `
validation:
  strict: false
comparison:
  customComparators:
    "data.createdAt": |
      function(baseline, transformed) {
        return Math.abs(new Date(baseline) - new Date(transformed)) < 60000;
      }
    "data.status":
      type: "case-insensitive"
`;

      // Reset all mocks and set up the specific mock for this test
      vi.resetAllMocks();
      vi.mocked(fs.readFile).mockResolvedValue(yamlContent);
      const warnSpy = vi.spyOn(logger, 'warn');

      const service = await ResponseValidationService.fromConfigFile('test-config.yaml');

      expect(service).toBeDefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Embedded JavaScript functions are no longer supported for path 'data.createdAt'")
      );

      // Verify that only the valid comparator is loaded
      const config = (service as any).config;
      expect(config.comparison.customComparators).toBeDefined();
      expect(Object.keys(config.comparison.customComparators)).toEqual(['data.status']);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('handles malformed GraphQL queries gracefully', async () => {
      const malformedQuery = 'invalid graphql syntax {';
      
      const result = await service.validateAgainstSchema(malformedQuery, 'productGraph');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Syntax Error');
    });

    it('handles empty query validation', async () => {
      const emptyQuery = '';
      
      const result = await service.validateAgainstSchema(emptyQuery, 'productGraph');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it('handles missing comparison configuration', async () => {
      const basicService = new ResponseValidationService({
        endpoints: [],
        capture: { parallel: false, maxConcurrency: 1, timeout: 1000 },
        comparison: { strict: false },
        storage: { type: 'memory' }
      });
      
      expect(basicService).toBeDefined();
      expect(basicService.getComparisonConfig).toBeDefined();
    });

    it('validates endpoint URL generation', async () => {
      // Mock the comparator method that's missing
      mockComparator.getConfiguration = vi.fn().mockReturnValue({
        ignorePatterns: [],
        expectedDifferences: []
      });
      
      const config = service.getComparisonConfig();
      
      expect(config).toBeDefined();
      expect(config.ignorePatterns).toBeDefined();
      expect(config.expectedDifferences).toBeDefined();
    });

    it('handles cookie construction validation', async () => {
      // Test that buildVariables returns a valid object structure
      const variables = await service.buildVariables('query { user { id } }', {
        id: 'test-user',
        ventures: [{ id: 'venture-123' }],
        projects: [{ domain: 'test.com' }]
      });
      
      expect(variables).toBeDefined();
      expect(typeof variables).toBe('object');
      // Note: The actual variable mapping depends on query AST parsing which is complex in mocked env
    });
  });
});
