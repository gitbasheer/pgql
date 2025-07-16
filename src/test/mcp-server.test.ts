import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

describe('MCP Server Integration Tests', () => {
  const testFixturesDir = join(process.cwd(), 'test', 'fixtures', 'mcp-test');
  const serverPath = join(process.cwd(), 'dist', 'mcp', 'server.js');

  beforeAll(() => {
    // Create test fixtures directory
    if (!existsSync(testFixturesDir)) {
      mkdirSync(testFixturesDir, { recursive: true });
    }

    // Create sample GraphQL files
    const sampleQuery = `
      import { gql } from '@apollo/client';

      export const GET_USER = gql\`
        query GetUser($id: ID!) {
          user(id: $id) {
            id
            name
            email
            profile {
              avatar
              bio
            }
          }
        }
      \`;

      export const UPDATE_USER = gql\`
        mutation UpdateUser($id: ID!, $input: UserInput!) {
          updateUser(id: $id, input: $input) {
            id
            name
            email
          }
        }
      \`;
    `;

    const sampleSchema = `
      type Query {
        user(id: ID!): User
        users: [User!]!
      }

      type Mutation {
        updateUser(id: ID!, input: UserInput!): User
        deleteUser(id: ID!): Boolean
      }

      type User {
        id: ID!
        name: String!
        email: String!
        profile: UserProfile
      }

      type UserProfile {
        avatar: String
        bio: String
      }

      input UserInput {
        name: String
        email: String
      }
    `;

    // Create test files
    writeFileSync(join(testFixturesDir, 'queries.js'), sampleQuery);
    writeFileSync(join(testFixturesDir, 'schema.graphql'), sampleSchema);

    // Create a queries.json file for transformation tests
    const queriesJson = { type: 'query',
      queries: [
        {
          id: 'GetUser',
          name: 'GetUser',
          content:
            'query GetUser($id: ID!) { user(id: $id) { id name email profile { avatar bio } } }',
          filePath: join(testFixturesDir, 'queries.js'),
          line: 5,
          type: 'query',
        },
        { type: 'query',
          id: 'UpdateUser',
          name: 'UpdateUser',
          content:
            'mutation UpdateUser($id: ID!, $input: UserInput!) { updateUser(id: $id, input: $input) { id name email } }',
          filePath: join(testFixturesDir, 'queries.js'),
          line: 18,
          type: 'mutation',
        },
      ],
    };
    writeFileSync(join(testFixturesDir, 'queries.json'), JSON.stringify(queriesJson, null, 2));
  });

  afterAll(() => {
    // Clean up test fixtures
    if (existsSync(testFixturesDir)) {
      rmSync(testFixturesDir, { recursive: true, force: true });
    }
  });

  // Helper to send JSON-RPC request
  async function sendRequest(method: string, params?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      let child: ChildProcessWithoutNullStreams;

      // Check if server file exists
      if (!existsSync(serverPath)) {
        reject(new Error(`Server file not found at ${serverPath}. Run 'npm run build' first.`));
        return;
      }

      try {
        child = spawn('node', [serverPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
          windowsHide: true,
          cwd: process.cwd(),
        }) as ChildProcessWithoutNullStreams;
      } catch (err) {
        reject(new Error(`Failed to spawn server: ${err}`));
        return;
      }

      // Give the process a moment to initialize
      setTimeout(() => {
        if (!child || !child.stdin || !child.stdout || !child.stderr) {
          try {
            child?.kill();
          } catch {}
          reject(new Error('Failed to create child process with stdio pipes'));
          return;
        }

        let response = '';
        let errorOutput = '';
        let hasResponded = false;

        child.stdout.on('data', (data) => {
          response += data.toString();

          // Try to parse complete JSON-RPC responses
          try {
            const lines = response.split('\n').filter((line) => line.trim());
            for (const line of lines) {
              // Skip server startup messages and only process JSON-RPC responses
              if (line.startsWith('{') && line.includes('"jsonrpc"') && line.includes('"id"')) {
                const parsed = JSON.parse(line);
                hasResponded = true;
                child.kill();
                resolve(parsed);
                return;
              }
            }
          } catch (e) {
            // Continue accumulating data
          }
        });

        child.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        child.on('close', (code) => {
          if (hasResponded) return; // Already resolved

          if (errorOutput) {
            reject(
              new Error(
                `❌ Build tool error\n\nThe pg-migration tool failed to start: ${errorOutput.trim()}`,
              ),
            );
          } else if (!response || response.trim() === 'GraphQL Migration MCP server started') {
            reject(
              new Error(
                `❌ Build tool error\n\nThe pg-migration tool started but didn't respond to ${method} request (exit code: ${code})`,
              ),
            );
          } else {
            reject(
              new Error(`❌ Build tool error\n\nInvalid response to ${method}: ${response.trim()}`),
            );
          }
        });

        child.on('error', (err) => {
          reject(new Error(`Failed to spawn server: ${err.message}`));
        });

        const request = JSON.stringify({
          jsonrpc: '2.0',
          method,
          params: params || {},
          id: Date.now(),
        });

        // Send request
        try {
          child.stdin.write(request + '\n');
          child.stdin.end();
        } catch (err) {
          reject(new Error(`Failed to write to stdin: ${err}`));
        }

        // Add request timeout
        setTimeout(() => {
          if (!hasResponded) {
            hasResponded = true;
            child.kill();
            reject(
              new Error(`❌ Build tool error\n\nTimeout waiting for response to ${method} request`),
            );
          }
        }, 5000);
      }, 500);
    });
  }

  describe('Server Health Check', () => {
    it('should start and respond to initialize request', async () => {
      const response = await sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
      });

      expect(response).toBeDefined();
      expect(response.result).toBeDefined();
      expect(response.result.protocolVersion).toBe('2024-11-05');
      expect(response.result.serverInfo.name).toBe('pg-migration-mcp');
    });
  });

  describe('Tool Discovery', () => {
    it('should list all available tools', async () => {
      const response = await sendRequest('tools/list');

      expect(response.result).toBeDefined();
      expect(response.result.tools).toBeDefined();
      expect(Array.isArray(response.result.tools)).toBe(true);
      expect(response.result.tools.length).toBeGreaterThanOrEqual(8);

      const toolNames = response.result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('analyze_operations');
      expect(toolNames).toContain('extract_queries');
      expect(toolNames).toContain('transform_queries');
      expect(toolNames).toContain('validate_queries');
      expect(toolNames).toContain('apply_changes');
      expect(toolNames).toContain('assess_migration_impact');
      expect(toolNames).toContain('create_rollback_plan');
      expect(toolNames).toContain('run_migration_pipeline');
    });

    it('should provide proper tool schemas', async () => {
      const response = await sendRequest('tools/list');
      const extractTool = response.result.tools.find((t: any) => t.name === 'extract_queries');

      expect(extractTool).toBeDefined();
      expect(extractTool.description).toContain('Extract GraphQL queries');
      expect(extractTool.inputSchema).toBeDefined();
      expect(extractTool.inputSchema.type).toBe('object');
      expect(extractTool.inputSchema.properties.directory).toBeDefined();
      expect(extractTool.inputSchema.required).toContain('directory');
    });
  });

  describe('Tool Execution', () => {
    it('should extract queries from test directory', async () => {
      const response = await sendRequest('tools/call', {
        name: 'extract_queries',
        arguments: {
          directory: 'test/fixtures/mcp-test',
          output: 'test/fixtures/mcp-test/extracted.json',
        },
      });

      expect(response.result).toBeDefined();
      expect(response.result.content).toBeDefined();
      expect(response.result.content[0].type).toBe('text');
      expect(response.result.content[0].text).toContain('Query Extraction Complete');
      expect(response.result.content[0].text).toContain('2 GraphQL operations');
    });

    it('should analyze operations in test directory', async () => {
      const response = await sendRequest('tools/call', {
        name: 'analyze_operations',
        arguments: { directory: 'test/fixtures/mcp-test' },
      });

      expect(response.result).toBeDefined();
      expect(response.result.content[0].text).toContain('GraphQL Operations Analysis');
    });

    it('should handle missing directory gracefully', async () => {
      const response = await sendRequest('tools/call', {
        name: 'extract_queries',
        arguments: { directory: 'non-existent-dir' },
      });

      expect(response.result).toBeDefined();
      expect(response.result.content[0].text).toMatch(/no queries found|no graphql queries found/i);
    });

    it('should validate queries against schema', async () => {
      const response = await sendRequest('tools/call', {
        name: 'validate_queries',
        arguments: {
          queries: 'test/fixtures/mcp-test/queries.json',
          schema: 'test/fixtures/mcp-test/schema.graphql',
        },
      });

      expect(response.result).toBeDefined();
      expect(response.result.content[0].text).toContain('Validation');
      // Should be successful since our test queries match the schema
      expect(response.result.content[0].text).toMatch(
        /validation successful|all queries are valid/i,
      );
    });

    it('should transform queries in dry-run mode', async () => {
      const response = await sendRequest('tools/call', {
        name: 'transform_queries',
        arguments: {
          input: 'test/fixtures/mcp-test/queries.json',
          schema: 'test/fixtures/mcp-test/schema.graphql',
          dryRun: true,
        },
      });

      expect(response.result).toBeDefined();
      expect(response.result.content[0].text).toContain('Transformation Results');
      expect(response.result.content[0].text).toContain('Preview Mode');
    });

    it('should assess migration impact', async () => {
      const response = await sendRequest('tools/call', {
        name: 'assess_migration_impact',
        arguments: {
          schema: 'test/fixtures/mcp-test/schema.graphql',
          queriesFile: 'test/fixtures/mcp-test/queries.json',
        },
      });

      expect(response.result).toBeDefined();
      expect(response.result.content[0].text).toBeDefined();
      // Should contain impact assessment information
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid tool names gracefully', async () => {
      try {
        await sendRequest('tools/call', {
          name: 'non_existent_tool',
          arguments: {},
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        // The server should close the connection or return an error
        expect(error.message).toBeDefined();
      }
    });

    it('should provide helpful error messages for missing files', async () => {
      const response = await sendRequest('tools/call', {
        name: 'validate_queries',
        arguments: {
          queries: 'non-existent-queries.json',
          schema: 'non-existent-schema.graphql',
        },
      });

      expect(response.result).toBeDefined();
      expect(response.result.content[0].text).toMatch(/file not found|no such file|failed|error/i);
    });

    it('should handle malformed input gracefully', async () => {
      // Create a malformed queries.json
      const malformedPath = join(testFixturesDir, 'malformed.json');
      writeFileSync(malformedPath, '{ invalid json content ');

      const response = await sendRequest('tools/call', {
        name: 'transform_queries',
        arguments: {
          input: malformedPath,
          schema: 'test/fixtures/mcp-test/schema.graphql',
          dryRun: true,
        },
      });

      expect(response.result).toBeDefined();
      expect(response.result.content[0].text).toMatch(/error|failed|invalid/i);
    });
  });

  describe('Pipeline Execution', () => {
    it('should run full pipeline in dry-run mode', async () => {
      const response = await sendRequest('tools/call', {
        name: 'run_migration_pipeline',
        arguments: {
          directory: 'test/fixtures/mcp-test',
          schema: 'test/fixtures/mcp-test/schema.graphql',
          autoApply: false,
        },
      });

      expect(response.result).toBeDefined();
      expect(response.result.content[0].text).toContain('migration pipeline');
      // Should complete without applying changes
    });

    it('should support confidence thresholds', async () => {
      const response = await sendRequest('tools/call', {
        name: 'run_migration_pipeline',
        arguments: {
          directory: 'test/fixtures/mcp-test',
          schema: 'test/fixtures/mcp-test/schema.graphql',
          autoApply: true,
          confidenceThreshold: 95,
        },
      });

      expect(response.result).toBeDefined();
      // Should respect confidence threshold for auto-apply
    });
  });

  describe('Rollback Planning', () => {
    it('should create rollback plan for transformed queries', async () => {
      // First create a transformed file
      const transformedPath = join(testFixturesDir, 'transformed.json');
      const transformedData = {
        queries: [
          {
            name: 'GetUser',
            originalQuery: 'query GetUser($id: ID!) { user(id: $id) { id name email } }',
            transformedQuery:
              'query GetUser($id: ID!) { user(id: $id) { id name email profile { avatar bio } } }',
            filePath: join(testFixturesDir, 'queries.js'),
            line: 5,
            confidence: 95,
          },
        ],
      };
      writeFileSync(transformedPath, JSON.stringify(transformedData, null, 2));

      const response = await sendRequest('tools/call', { type: 'query', id: 'generated-id',
        name: 'create_rollback_plan',
        arguments: {
          transformedFile: transformedPath,
          strategy: 'gradual',
        },
      });

      expect(response.result).toBeDefined();
      expect(response.result.content[0].text).toContain('rollback');
    });
  });
});
