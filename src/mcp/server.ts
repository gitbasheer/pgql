#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ErrorHandler {
  static handleError(error: any, tool: string, args: any): string {
    const errorMessage = error.message || String(error);

    // Common error patterns and solutions
    const errorPatterns = [
      {
        pattern: /ENOENT.*schema\.graphql/i,
        message: "❌ Schema file not found",
        solution: "Make sure your GraphQL schema file exists at the specified path. Common locations:\n" +
                 "- `data/schema.graphql`\n" +
                 "- `src/schema.graphql`\n" +
                 "- `graphql/schema.graphql`"
      },
      {
        pattern: /no queries found/i,
        message: "❌ No GraphQL queries found",
        solution: "Check that:\n" +
                 "1. The directory contains `.ts`, `.tsx`, `.js`, or `.jsx` files\n" +
                 "2. Files contain GraphQL queries (look for `gql` or `graphql` tags)\n" +
                 "3. Try a different directory (e.g., `src/components`)"
      },
      {
        pattern: /validation.*failed/i,
        message: "❌ Query validation failed",
        solution: "Some queries don't match your schema. Options:\n" +
                 "1. Update the schema to match your queries\n" +
                 "2. Fix the queries to match the schema\n" +
                 "3. Use `--skip-invalid` flag to skip problematic queries"
      },
      {
        pattern: /permission denied/i,
        message: "❌ Permission denied",
        solution: "File permission issue. Try:\n" +
                 "1. Check file ownership: `ls -la <file>`\n" +
                 "2. Run with appropriate permissions\n" +
                 "3. Ensure output directories are writable"
      },
      {
        pattern: /command failed.*pnpm/i,
        message: "❌ Build tool error",
        solution: "The pg-migration tool might not be built. Try:\n" +
                 "1. Run `pnpm build` to compile the project\n" +
                 "2. Check that all dependencies are installed: `pnpm install`\n" +
                 "3. Verify npm scripts exist in package.json"
      },
      {
        pattern: /cannot find module/i,
        message: "❌ Missing dependency",
        solution: "Required module not found. Try:\n" +
                 "1. Run `pnpm install` to install dependencies\n" +
                 "2. Check if the module is listed in package.json\n" +
                 "3. Clear node_modules and reinstall: `rm -rf node_modules && pnpm install`"
      },
      {
        pattern: /EACCES/i,
        message: "❌ Access denied",
        solution: "File system access issue. Check:\n" +
                 "1. File permissions for read/write access\n" +
                 "2. Directory ownership\n" +
                 "3. Try running from a directory you own"
      },
      {
        pattern: /syntax error.*graphql/i,
        message: "❌ GraphQL syntax error",
        solution: "Invalid GraphQL syntax detected. Check:\n" +
                 "1. GraphQL query syntax is valid\n" +
                 "2. All queries are properly closed with backticks\n" +
                 "3. No missing brackets or parentheses\n" +
                 "4. Use a GraphQL linter to find issues"
      }
    ];

    // Check known patterns
    for (const { pattern, message, solution } of errorPatterns) {
      if (pattern.test(errorMessage)) {
        return `${message}\n\n${solution}\n\n💡 **Debug info:** \`${errorMessage}\``;
      }
    }

    // Generic error with context-aware suggestions
    return this.getGenericErrorMessage(tool, args, errorMessage);
  }

  private static getGenericErrorMessage(tool: string, args: any, error: string): string {
    let message = `❌ **Error in ${tool}**\n\n`;

    // Tool-specific suggestions
    switch (tool) {
      case 'extract_queries':
        message += "Failed to extract queries. Check that:\n";
        message += `- Directory '${args.directory || 'src'}' exists and contains source files\n`;
        message += "- You have GraphQL queries in your code (using `gql` or `graphql` tags)\n";
        message += "- The extractor can access and read the files\n";
        break;

      case 'transform_queries':
        message += "Failed to transform queries. Check that:\n";
        message += `- Input file '${args.input || 'extracted-queries.json'}' exists and is valid JSON\n`;
        message += `- Schema file '${args.schema || 'data/schema.graphql'}' is a valid GraphQL schema\n`;
        message += "- Try with `dryRun: true` first to preview changes\n";
        break;

      case 'validate_queries':
        message += "Validation failed. This might mean:\n";
        message += "- Your queries reference fields not in the schema\n";
        message += "- There are syntax errors in the queries\n";
        message += "- The schema file is invalid or outdated\n";
        message += `- Check both '${args.queries || 'extracted-queries.json'}' and '${args.schema || 'data/schema.graphql'}'\n`;
        break;

      case 'apply_changes':
        message += "Failed to apply changes. Check that:\n";
        message += `- Transformed file '${args.transformedFile || 'transformed-queries.json'}' exists\n`;
        message += "- Source files are writable\n";
        message += "- File paths in the transformed file are correct\n";
        break;

      case 'analyze_operations':
        message += "Failed to analyze operations. Check that:\n";
        message += `- Directory '${args.directory || 'src'}' contains GraphQL operations\n`;
        message += "- The analyzer can parse your code files\n";
        message += "- Try extracting queries first with `extract_queries`\n";
        break;

      case 'assess_migration_impact':
        message += "Failed to assess migration impact. Check that:\n";
        message += `- Schema file '${args.schema || 'data/schema.graphql'}' exists\n`;
        message += `- Queries file '${args.queriesFile || 'extracted-queries.json'}' exists\n`;
        message += "- Both files contain valid GraphQL\n";
        break;

      case 'run_migration_pipeline':
        message += "Pipeline failed. This is a multi-step process, check:\n";
        message += `- Source directory '${args.directory || 'src'}' exists\n`;
        message += `- Schema file '${args.schema || 'data/schema.graphql'}' is valid\n`;
        message += "- You have the necessary permissions\n";
        message += "- Try running individual steps to isolate the issue\n";
        break;

      default:
        message += "An unexpected error occurred.\n";
        message += "- Check the error details below\n";
        message += "- Verify all required files exist\n";
        message += "- Ensure the pg-migration tool is properly built\n";
    }

    message += `\n💡 **Debug info:** \`${error}\`\n\n`;
    message += "**🔧 General troubleshooting:**\n";
    message += "1. Run `pnpm build` to ensure everything is compiled\n";
    message += "2. Check file paths are correct (relative to project root)\n";
    message += "3. Verify GraphQL syntax in queries and schema\n";
    message += "4. Try with simpler inputs to isolate the issue";

    return message;
  }

  static wrapRecoveryAdvice(result: string, tool: string): string {
    // Add recovery advice if the result indicates a partial success or warning
    if (result.includes('⚠️') || result.includes('skipped') || result.includes('failed')) {
      result += "\n\n**🔄 Recovery Options:**\n";

      switch (tool) {
        case 'transform_queries':
          result += "- Review skipped queries manually\n";
          result += "- Use `--force` flag to attempt transformation of complex queries\n";
          result += "- Consider breaking complex queries into simpler ones\n";
          break;

        case 'validate_queries':
          result += "- Fix validation errors in the source queries\n";
          result += "- Update schema to match query requirements\n";
          result += "- Use `transform_queries` with `--skip-invalid` to proceed\n";
          break;

        case 'apply_changes':
          result += "- Check backup files if changes caused issues\n";
          result += "- Use version control to revert if needed\n";
          result += "- Apply changes incrementally to isolate problems\n";
          break;
      }
    }

    return result;
  }
}

class ResponseFormatter {
  static formatAnalysisResult(rawOutput: string, extractedFile?: string): string {
    // Parse the raw CLI output and create structured response
    const lines = rawOutput.split('\n');
    let formatted = "📊 **GraphQL Operations Analysis**\n\n";

    // Extract key metrics
    const totalMatch = rawOutput.match(/Total operations: (\d+)/);
    const queriesMatch = rawOutput.match(/Queries: (\d+)/);
    const mutationsMatch = rawOutput.match(/Mutations: (\d+)/);

    if (totalMatch) {
      formatted += `Found **${totalMatch[1]} total operations**:\n`;
      if (queriesMatch) formatted += `- 🔍 ${queriesMatch[1]} Queries\n`;
      if (mutationsMatch) formatted += `- ✏️ ${mutationsMatch[1]} Mutations\n`;
      formatted += "\n";
    }

    // Check for deprecations
    if (rawOutput.includes('deprecated')) {
      formatted += "⚠️ **Deprecated Fields Detected**\n";
      formatted += "Some operations use deprecated fields that need migration.\n\n";
    }

    // Add actionable next steps
    formatted += "**🎯 Next Steps:**\n";
    formatted += "1. Run `transform_queries` to update deprecated fields\n";
    formatted += "2. Use `validate_queries` to ensure changes are safe\n";
    formatted += "3. Apply changes with `apply_changes` when ready\n";

    return formatted;
  }

  static formatTransformResult(rawOutput: string, dryRun: boolean): string {
    let formatted = "🔄 **Transformation Results**\n\n";

    // Extract statistics
    const transformedMatch = rawOutput.match(/Transformed: (\d+)/);
    const skippedMatch = rawOutput.match(/Skipped: (\d+)/);
    const errorMatch = rawOutput.match(/Errors: (\d+)/);

    if (transformedMatch) {
      formatted += `✅ Successfully transformed: ${transformedMatch[1]} operations\n`;
    }
    if (skippedMatch && parseInt(skippedMatch[1]) > 0) {
      formatted += `⏭️ Skipped: ${skippedMatch[1]} operations (invalid or complex)\n`;
    }
    if (errorMatch && parseInt(errorMatch[1]) > 0) {
      formatted += `❌ Errors: ${errorMatch[1]} operations\n`;
    }

    formatted += "\n";

    if (dryRun) {
      formatted += "**🔍 Preview Mode** (dry-run)\n";
      formatted += "No changes were applied. To apply changes:\n";
      formatted += "1. Review the transformations above\n";
      formatted += "2. Run again with `dryRun: false`\n";
    } else {
      formatted += "**✅ Changes Applied**\n";
      formatted += "Transformations have been saved. Next: validate and apply to source files.\n";
    }

    return formatted;
  }

  static formatValidationResult(rawOutput: string): string {
    const isValid = !rawOutput.toLowerCase().includes('error') &&
                    !rawOutput.toLowerCase().includes('invalid');

    let formatted = isValid ?
      "✅ **Validation Successful**\n\nAll queries are valid and ready to use!\n" :
      "❌ **Validation Failed**\n\n";

    if (!isValid) {
      // Extract error details
      const errors = rawOutput.match(/Error: (.+)/g) || [];
      formatted += "Found the following issues:\n";
      errors.forEach((error, i) => {
        formatted += `${i + 1}. ${error.replace('Error: ', '')}\n`;
      });
      formatted += "\n**Fix these issues before proceeding with migration.**";
    }

    return formatted;
  }

  static formatExtractResult(rawOutput: string, outputFile: string, queryCount: number): string {
    let formatted = "📤 **Query Extraction Complete**\n\n";

    formatted += `Successfully extracted **${queryCount} GraphQL operations**\n`;
    formatted += `📁 Saved to: \`${outputFile}\`\n\n`;

    // Parse operation types if available
    const queryMatch = rawOutput.match(/queries: (\d+)/i);
    const mutationMatch = rawOutput.match(/mutations: (\d+)/i);
    const fragmentMatch = rawOutput.match(/fragments: (\d+)/i);

    if (queryMatch || mutationMatch || fragmentMatch) {
      formatted += "**Operation Breakdown:**\n";
      if (queryMatch) formatted += `- 🔍 Queries: ${queryMatch[1]}\n`;
      if (mutationMatch) formatted += `- ✏️ Mutations: ${mutationMatch[1]}\n`;
      if (fragmentMatch) formatted += `- 🧩 Fragments: ${fragmentMatch[1]}\n`;
      formatted += "\n";
    }

    formatted += "**🎯 Next Steps:**\n";
    formatted += "1. Run `analyze_operations` to check for deprecations\n";
    formatted += "2. Use `transform_queries` to migrate deprecated fields\n";

    return formatted;
  }

  static formatApplyResult(rawOutput: string, hasBackup: boolean): string {
    const success = !rawOutput.toLowerCase().includes('error') &&
                   !rawOutput.toLowerCase().includes('failed');

    let formatted = success ?
      "✅ **Changes Applied Successfully**\n\n" :
      "❌ **Apply Failed**\n\n";

    if (success) {
      const filesMatch = rawOutput.match(/Updated (\d+) files?/);
      if (filesMatch) {
        formatted += `Updated **${filesMatch[1]} source files**\n`;
      }

      if (hasBackup) {
        formatted += "📦 Backups created for all modified files\n";
        formatted += "↩️ To rollback: restore from `.backup` files\n";
      }

      formatted += "\n**✨ Migration Complete!**\n";
      formatted += "Your GraphQL operations have been successfully updated.\n";
    } else {
      formatted += "Failed to apply changes. Check the error details above.\n";
    }

    return formatted;
  }
}

interface ToolArguments {
  directory?: string;
  output?: string;
  input?: string;
  schema?: string;
  dryRun?: boolean;
  queries?: string;
  transformedFile?: string;
  backup?: boolean;
  queriesFile?: string;
  strategy?: 'immediate' | 'gradual';
  autoApply?: boolean;
  confidenceThreshold?: number;
}

class GraphQLMigrationServer {
  private server: Server;
  private projectRoot: string;

  constructor() {
    this.projectRoot = process.cwd();
    this.server = new Server(
      {
        name: 'pg-migration-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'analyze_operations',
          description: 'Analyze GraphQL operations in your codebase',
          inputSchema: {
            type: 'object',
            properties: {
              directory: { type: 'string', description: 'Directory to analyze (default: src)' }
            }
          }
        },
        {
          name: 'extract_queries',
          description: 'Extract GraphQL queries from source files',
          inputSchema: {
            type: 'object',
            properties: {
              directory: { type: 'string', description: 'Directory to scan' },
              output: { type: 'string', description: 'Output file name' }
            },
            required: ['directory']
          }
        },
        {
          name: 'transform_queries',
          description: 'Transform queries based on schema deprecations',
          inputSchema: {
            type: 'object',
            properties: {
              input: { type: 'string', description: 'Input queries file' },
              schema: { type: 'string', description: 'Schema file path' },
              dryRun: { type: 'boolean', description: 'Preview changes only', default: true }
            },
            required: ['input', 'schema']
          }
        },
        {
          name: 'validate_queries',
          description: 'Validate queries against GraphQL schema',
          inputSchema: {
            type: 'object',
            properties: {
              queries: { type: 'string', description: 'Queries file to validate' },
              schema: { type: 'string', description: 'Schema file path' }
            },
            required: ['queries', 'schema']
          }
        },
        {
          name: 'apply_changes',
          description: 'Apply transformations to source files',
          inputSchema: {
            type: 'object',
            properties: {
              transformedFile: { type: 'string', description: 'Transformed queries file' },
              backup: { type: 'boolean', description: 'Create backups', default: true }
            },
            required: ['transformedFile']
          }
        },
        {
          name: 'assess_migration_impact',
          description: 'Assess the impact and risk of potential migrations before starting',
          inputSchema: {
            type: 'object',
            properties: {
              schema: { type: 'string', description: 'GraphQL schema path' },
              queriesFile: { type: 'string', description: 'Extracted queries file' }
            },
            required: ['schema']
          }
        },
        {
          name: 'create_rollback_plan',
          description: 'Create a rollback plan for safe migration',
          inputSchema: {
            type: 'object',
            properties: {
              transformedFile: { type: 'string', description: 'Transformed queries file' },
              strategy: {
                type: 'string',
                enum: ['immediate', 'gradual'],
                description: 'Rollback strategy',
                default: 'immediate'
              }
            },
            required: ['transformedFile']
          }
        },
        {
          name: 'run_migration_pipeline',
          description: 'Execute complete migration pipeline with all safety checks',
          inputSchema: {
            type: 'object',
            properties: {
              directory: { type: 'string', description: 'Source directory' },
              schema: { type: 'string', description: 'Schema file path' },
              autoApply: { type: 'boolean', description: 'Apply changes automatically if safe', default: false },
              confidenceThreshold: { type: 'number', description: 'Min confidence for auto-apply (0-100)', default: 90 }
            },
            required: ['directory', 'schema']
          }
        }
      ]
    }));

            // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;
      const toolArgs = args as ToolArguments;
      let result = '';

      try {
        switch (name) {
          case 'analyze_operations': {
            const dir = toolArgs.directory || 'src';
            // First extract to temp file
            const tempFile = 'temp-analysis.json';
            execSync(`pnpm extract ${dir} -o ${tempFile}`, { cwd: this.projectRoot });

            // Then analyze
            const rawResult = execSync(`pnpm analyze ${tempFile}`, {
              cwd: this.projectRoot,
              encoding: 'utf8'
            });

            // Cleanup
            execSync(`rm -f ${tempFile}`, { cwd: this.projectRoot });

            // Use formatter instead of raw output
            result = ResponseFormatter.formatAnalysisResult(rawResult, tempFile);
            break;
          }

          case 'extract_queries': {
            const output = toolArgs.output || 'extracted-queries.json';
            const directory = toolArgs.directory || 'src';
            const rawResult = execSync(`pnpm extract ${directory} -o ${output}`, {
              cwd: this.projectRoot,
              encoding: 'utf8'
            });

            // Read and summarize the extracted queries
            const outputPath = join(this.projectRoot, output);
            let queryCount = 0;
            if (existsSync(outputPath)) {
              const queries = JSON.parse(readFileSync(outputPath, 'utf8'));
              queryCount = queries.length;
            }

            // Use formatter
            result = ResponseFormatter.formatExtractResult(rawResult, output, queryCount);
            break;
          }

          case 'transform_queries': {
            const dryRun = toolArgs.dryRun !== false;
            const dryRunFlag = dryRun ? '--dry-run' : '';
            const input = toolArgs.input || 'extracted-queries.json';
            const schema = toolArgs.schema || 'data/schema.graphql';
            const rawResult = execSync(
              `pnpm transform -i ${input} -s ${schema} ${dryRunFlag} --skip-invalid`,
              { cwd: this.projectRoot, encoding: 'utf8' }
            );

            // Use formatter
            result = ResponseFormatter.formatTransformResult(rawResult, dryRun);
            break;
          }

          case 'validate_queries': {
            const queries = toolArgs.queries || 'extracted-queries.json';
            const schema = toolArgs.schema || 'data/schema.graphql';
            const rawResult = execSync(`pnpm validate ${schema} -i ${queries}`, {
              cwd: this.projectRoot,
              encoding: 'utf8'
            });

            // Use formatter
            result = ResponseFormatter.formatValidationResult(rawResult);
            break;
          }

          case 'apply_changes': {
            const transformedFile = toolArgs.transformedFile || 'transformed-queries.json';
            const hasBackup = toolArgs.backup !== false;
            const backupFlag = hasBackup ? '--backup' : '';
            const rawResult = execSync(`pnpm apply -i ${transformedFile} ${backupFlag}`, {
              cwd: this.projectRoot,
              encoding: 'utf8'
            });

            // Use formatter
            result = ResponseFormatter.formatApplyResult(rawResult, hasBackup);
            break;
          }

          case 'assess_migration_impact': {
            const schema = toolArgs.schema || 'data/schema.graphql';
            const queriesFile = toolArgs.queriesFile || 'extracted-queries.json';

            result = "📊 Migration Impact Assessment\n\n";

            try {
              // Analyze deprecations
              result += "1. Analyzing schema deprecations...\n";
              const deprecations = execSync(`pnpm analyze:dev ${queriesFile}`, {
                cwd: this.projectRoot,
                encoding: 'utf8'
              });
              result += deprecations + "\n";

              // Test validation
              result += "\n2. Checking query compatibility...\n";
              try {
                execSync(`pnpm validate ${schema} -i ${queriesFile}`, {
                  cwd: this.projectRoot,
                  encoding: 'utf8',
                  stdio: 'pipe'
                });
                result += "✅ All queries are currently valid\n";
              } catch (e) {
                result += "⚠️ Some queries may need updates\n";
              }

              // Risk assessment
              result += "\n3. Risk Assessment:\n";
              const queryCount = JSON.parse(readFileSync(join(this.projectRoot, queriesFile), 'utf8')).length;
              if (queryCount > 50) {
                result += "- HIGH: Large number of queries to migrate\n";
              } else if (queryCount > 20) {
                result += "- MEDIUM: Moderate number of queries\n";
              } else {
                result += "- LOW: Small number of queries\n";
              }

                            result += "\nRecommendation: Run 'run_migration_pipeline' with dry-run first.\n";

            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              result += `\nError during assessment: ${errorMessage}\n`;
            }
            break;
          }

          case 'create_rollback_plan': {
            const transformedFile = toolArgs.transformedFile || 'transformed-queries.json';
            const strategy = toolArgs.strategy || 'immediate';

            result = `🔄 Rollback Plan Created\n\n`;
            result += `Strategy: ${strategy.toUpperCase()}\n\n`;

            if (strategy === 'immediate') {
              result += "Immediate Rollback Steps:\n";
              result += "1. Keep original query backups (automatic)\n";
              result += "2. Monitor error rates after deployment\n";
              result += "3. If issues detected:\n";
              result += "   - Run: pnpm apply -i <original-queries>.backup\n";
              result += "   - Restart services\n\n";
            } else {
              result += "Gradual Rollback Steps:\n";
              result += "1. Deploy with feature flags\n";
              result += "2. Route percentage of traffic to new queries\n";
              result += "3. Monitor performance metrics\n";
              result += "4. Gradually increase or rollback based on metrics\n\n";
            }

            result += "Rollback files preserved:\n";
            result += `- Original: ${transformedFile}.backup\n`;
            result += `- Transformation log: ${transformedFile}.log\n`;
            break;
          }

          case 'run_migration_pipeline': {
            const directory = toolArgs.directory || 'src';
            const schema = toolArgs.schema || 'data/schema.graphql';
            const autoApply = toolArgs.autoApply || false;
            const confidenceThreshold = toolArgs.confidenceThreshold || 90;
            const output = `mcp-pipeline-${Date.now()}`;
            let pipelineResult = "🚀 Starting migration pipeline...\n\n";

            try {
              // Step 1: Extract
              pipelineResult += "1️⃣ Extracting queries...\n";
              execSync(`pnpm extract ${directory} -o ${output}-extracted.json`, { cwd: this.projectRoot });
              pipelineResult += `✅ Queries extracted to ${output}-extracted.json\n\n`;

              // Step 2: Analyze impact
              pipelineResult += "2️⃣ Analyzing migration impact...\n";
              const analysis = execSync(`pnpm analyze ${output}-extracted.json`, {
                cwd: this.projectRoot,
                encoding: 'utf8'
              });
              pipelineResult += analysis + "\n";

              // Step 3: Validate
              pipelineResult += "3️⃣ Validating queries...\n";
              try {
                execSync(`pnpm validate ${schema} -i ${output}-extracted.json`, {
                  cwd: this.projectRoot,
                  stdio: 'pipe'
                });
                pipelineResult += "✅ All queries valid\n\n";
              } catch (e) {
                pipelineResult += "⚠️ Some queries have validation issues\n\n";
              }

              // Step 4: Transform
              pipelineResult += "4️⃣ Transforming queries...\n";
              const transformCmd = `pnpm transform -i ${output}-extracted.json -s ${schema} -o ${output}-transformed --skip-invalid ${autoApply ? '' : '--dry-run'}`;
              const transformResult = execSync(transformCmd, {
                cwd: this.projectRoot,
                encoding: 'utf8'
              });
              pipelineResult += transformResult + "\n";

              // Step 5: Decision point
              if (autoApply) {
                pipelineResult += "5️⃣ Auto-applying changes...\n";
                execSync(`pnpm apply -i ${output}-transformed.json --backup`, { cwd: this.projectRoot });
                pipelineResult += "✅ Changes applied successfully!\n";
                pipelineResult += `Backup saved as: ${output}-transformed.json.backup\n`;
              } else {
                pipelineResult += "\n📋 Pipeline complete! Review the results above.\n";
                pipelineResult += `To apply changes, run: apply_changes with transformedFile="${output}-transformed.json"\n`;
                            }

            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              pipelineResult += `\n❌ Pipeline failed: ${errorMessage}\n`;
            }

            result = pipelineResult;
            break;
          }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }

        // Add recovery advice if applicable
        result = ErrorHandler.wrapRecoveryAdvice(result, name);

        return {
          content: [{ type: 'text', text: result }]
        };

      } catch (error) {
        // Use the error handler instead of throwing
        result = ErrorHandler.handleError(error, name, toolArgs);

        // Still return a valid response, not an error
        return {
          content: [{ type: 'text', text: result }]
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('GraphQL Migration MCP server started');
  }
}

// Start server
const server = new GraphQLMigrationServer();
server.run().catch(console.error);
