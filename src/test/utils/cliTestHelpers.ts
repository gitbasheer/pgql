import { vi, type MockedFunction } from 'vitest';
import type {
  UnifiedMigrationPipeline,
  PipelineOptions,
  ExtractionResult,
  ValidationResult,
  TransformationResult,
  ApplicationResult,
} from '../../core/pipeline/UnifiedMigrationPipeline.js';
import type { MigrationConfig } from '../../types/index.js';
import type { GitHubService } from '../../core/integration/GitHubService.js';

// Mock implementations
export interface MockPipeline {
  extract: MockedFunction<UnifiedMigrationPipeline['extract']>;
  validate: MockedFunction<UnifiedMigrationPipeline['validate']>;
  transform: MockedFunction<UnifiedMigrationPipeline['transform']>;
  apply: MockedFunction<UnifiedMigrationPipeline['apply']>;
  setupProgressiveRollout: MockedFunction<UnifiedMigrationPipeline['setupProgressiveRollout']>;
  generatePRDescription: MockedFunction<UnifiedMigrationPipeline['generatePRDescription']>;
  getSummary: MockedFunction<UnifiedMigrationPipeline['getSummary']>;
}

export interface MockGitHubService {
  createPR: MockedFunction<GitHubService['createPR']>;
}

// Default test data factories
export function getDefaultExtractionResult(): ExtractionResult {
  return {
    operations: [
      {
        id: '1',
        name: 'TestQuery',
        content: 'query TestQuery { field }',
        filePath: 'test.ts',
        type: 'query',
        location: { line: 1, column: 1, file: 'test.ts' },
        ast: null,
      },
    ],
    files: ['test.ts'],
    summary: { queries: 1, mutations: 0, subscriptions: 0 },
  };
}

export function getDefaultValidationResult(): ValidationResult {
  return {
    hasErrors: false,
    errors: [],
    warnings: [],
  };
}

export function getDefaultTransformationResult(): TransformationResult {
  return {
    transformed: [
      {
        operation: getDefaultExtractionResult().operations[0],
        transformation: { original: 'old', transformed: 'new' },
        confidence: 95,
      },
    ],
    automatic: 1,
    semiAutomatic: 0,
    manual: 0,
    skipped: 0,
  };
}

export function getDefaultApplicationResult(): ApplicationResult {
  return {
    modifiedFiles: ['test.ts'],
    operationsUpdated: 1,
    linesAdded: 5,
    linesRemoved: 3,
  };
}

export function getDefaultSummary() {
  return {
    totalOperations: 1,
    successfulTransformations: 1,
    filesModified: 1,
    averageConfidence: 95,
    risks: [],
  };
}

// Create properly typed mock instances
export function createMockPipeline(overrides: Partial<MockPipeline> = {}): MockPipeline {
  return {
    extract: overrides.extract || vi.fn().mockResolvedValue(getDefaultExtractionResult()),
    validate: overrides.validate || vi.fn().mockResolvedValue(getDefaultValidationResult()),
    transform: overrides.transform || vi.fn().mockResolvedValue(getDefaultTransformationResult()),
    apply: overrides.apply || vi.fn().mockResolvedValue(getDefaultApplicationResult()),
    setupProgressiveRollout:
      overrides.setupProgressiveRollout || vi.fn().mockResolvedValue({ operations: ['op1'] }),
    generatePRDescription:
      overrides.generatePRDescription || vi.fn().mockReturnValue('PR Description'),
    getSummary: overrides.getSummary || vi.fn().mockReturnValue(getDefaultSummary()),
  };
}

export function createMockGitHubService(
  overrides: Partial<MockGitHubService> = {},
): MockGitHubService {
  return {
    createPR:
      overrides.createPR ||
      vi.fn().mockResolvedValue({
        url: 'https://github.com/test/repo/pull/123',
        number: 123,
        state: 'open',
        title: 'Test PR',
        body: 'Test body',
        base: 'main',
        head: 'feature',
      }),
  };
}

// Create mock config
export function createMockConfig(overrides: Partial<MigrationConfig> = {}): MigrationConfig {
  return {
    source: { include: ['./src'], exclude: [] },
    confidence: { automatic: 90, semiAutomatic: 70, manual: 50 },
    rollout: { initial: 1, increment: 10, interval: '1h', maxErrors: 100 },
    safety: { requireApproval: false, autoRollback: true, healthCheckInterval: 60 },
    ...overrides,
  } as MigrationConfig;
}

// Mock external dependencies with consistent patterns
export function setupExternalMocks() {
  // Mock chalk to return plain strings
  vi.doMock('chalk', () => ({
    default: {
      bold: (str: string) => str,
      green: (str: string) => str,
      red: (str: string) => str,
      yellow: (str: string) => str,
      blue: (str: string) => str,
      cyan: (str: string) => str,
      gray: (str: string) => str,
    },
  }));

  // Mock ora spinner
  const mockSpinner = {
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    info: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: '',
  };

  vi.doMock('ora', () => ({
    default: vi.fn(() => mockSpinner),
  }));

  // Mock inquirer
  vi.doMock('inquirer', () => ({
    default: {
      prompt: vi.fn().mockResolvedValue({ proceed: true }),
    },
  }));

  // Mock logger
  vi.doMock('../../utils/logger.js', () => ({
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    },
  }));

  // Mock cache manager
  vi.doMock('../../core/cache/CacheManager.js', () => ({
    astCache: { clear: vi.fn().mockResolvedValue(undefined) },
    validationCache: { clear: vi.fn().mockResolvedValue(undefined) },
    transformCache: { clear: vi.fn().mockResolvedValue(undefined) },
  }));

  return { mockSpinner };
}

// Setup pipeline and GitHub mocks with proper typing
export function setupPipelineMocks() {
  const mockPipeline = createMockPipeline();
  const mockGitHubService = createMockGitHubService();
  const mockConfig = createMockConfig();

  // Mock ConfigLoader - Use doMock instead of mock to avoid hoisting issues
  vi.doMock('../../utils/ConfigLoader.js', () => ({
    ConfigLoader: {
      load: vi.fn().mockResolvedValue(mockConfig),
    },
  }));

  // Mock UnifiedMigrationPipeline constructor to return our mock
  vi.doMock('../../core/pipeline/UnifiedMigrationPipeline.js', () => ({
    UnifiedMigrationPipeline: vi.fn().mockImplementation(() => mockPipeline),
  }));

  // Mock GitHubService constructor to return our mock
  vi.doMock('../../core/integration/GitHubService.js', () => ({
    GitHubService: vi.fn().mockImplementation(() => mockGitHubService),
  }));

  return {
    mockPipeline,
    mockGitHubService,
    mockConfig,
  };
}

// Helper to capture CLI action handler
export async function getCliAction(modulePath: string): Promise<Function> {
  // Clear module cache to ensure fresh import
  vi.resetModules();

  // Capture the command configuration
  let capturedAction: Function | undefined;

  interface MockCommand {
    name: MockedFunction<any>;
    description: MockedFunction<any>;
    option: MockedFunction<any>;
    action: MockedFunction<any>;
    parse: MockedFunction<any>;
  }

  const mockCommand: MockCommand = {} as MockCommand;
  mockCommand.name = vi.fn().mockReturnValue(mockCommand);
  mockCommand.description = vi.fn().mockReturnValue(mockCommand);
  mockCommand.option = vi.fn().mockReturnValue(mockCommand);
  mockCommand.action = vi.fn((fn: Function) => {
    capturedAction = fn;
    return mockCommand;
  }) as any;
  mockCommand.parse = vi.fn();

  vi.doMock('commander', () => ({
    Command: vi.fn(() => mockCommand),
  }));

  // Import the CLI module
  await import(modulePath);

  if (!capturedAction) {
    throw new Error('CLI action handler not captured');
  }

  return capturedAction;
}

// Test assertion helpers
export function expectPipelineFullExecution(mockPipeline: MockPipeline) {
  expect(mockPipeline.extract).toHaveBeenCalled();
  expect(mockPipeline.validate).toHaveBeenCalled();
  expect(mockPipeline.transform).toHaveBeenCalled();
  expect(mockPipeline.apply).toHaveBeenCalled();
}

export function expectDryRunExecution(mockPipeline: MockPipeline) {
  expect(mockPipeline.extract).toHaveBeenCalled();
  expect(mockPipeline.validate).toHaveBeenCalled();
  expect(mockPipeline.transform).toHaveBeenCalled();
  expect(mockPipeline.apply).not.toHaveBeenCalled();
  expect(mockPipeline.setupProgressiveRollout).not.toHaveBeenCalled();
}

// Create test scenarios
export const testScenarios = {
  validationError: {
    validation: {
      hasErrors: true,
      errors: [{ operation: 'TestQuery', message: 'Invalid field', severity: 'error' as const }],
      warnings: [],
    },
  },

  multipleTransformations: {
    extraction: {
      operations: [
        {
          id: '1',
          name: 'Query1',
          content: 'query { a }',
          filePath: 'a.ts',
          type: 'query' as const,
          loc: { start: 0, end: 10 },
        },
        {
          id: '2',
          name: 'Query2',
          content: 'query { b }',
          filePath: 'b.ts',
          type: 'query' as const,
          loc: { start: 0, end: 10 },
        },
        {
          id: '3',
          name: 'Mutation1',
          content: 'mutation { c }',
          filePath: 'c.ts',
          type: 'mutation' as const,
          loc: { start: 0, end: 10 },
        },
      ],
      files: ['a.ts', 'b.ts', 'c.ts'],
      summary: { queries: 2, mutations: 1, subscriptions: 0 },
    },
    transformation: {
      transformed: [
        { operation: { id: '1' }, transformation: {}, confidence: 95 },
        { operation: { id: '2' }, transformation: {}, confidence: 85 },
        { operation: { id: '3' }, transformation: {}, confidence: 92 },
      ],
      automatic: 2,
      semiAutomatic: 1,
      manual: 0,
      skipped: 0,
    },
  },

  withRisks: {
    summary: {
      totalOperations: 5,
      successfulTransformations: 4,
      filesModified: 3,
      averageConfidence: 85.5,
      risks: ['High query complexity', 'Low test coverage'],
    },
  },
};
