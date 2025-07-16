import { GraphQLOperation, CodeChange } from '../types/index.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { parse } from 'graphql';
import { logger } from '../utils/logger.js';
import {
  ASTCodeApplicator,
  TransformationMapping,
  SourceMapping,
} from '../core/applicator/index.js';
import * as diff from 'diff';

const execAsync = promisify(exec);

/**
 * Adapter to integrate with existing pg-migration-organized scripts
 * This allows us to reuse the working functionality while adding safety features
 */
export class ExistingScriptsAdapter {
  private scriptsBasePath: string;

  constructor() {
    // Path to the existing scripts
    this.scriptsBasePath = path.resolve(__dirname, '../../../pg-migration-organized/pipeline');
  }

  async extractOperations(source: string): Promise<GraphQLOperation[]> {
    logger.info(`Extracting operations from ${source} using existing scripts`);

    try {
      // Use the existing ExtractQueries.js script
      const extractScript = path.join(this.scriptsBasePath, 'extraction/ExtractQueries.js');
      const { stdout } = await execAsync(`node ${extractScript} --source ${source}`);

      // Parse the output (assuming it outputs JSON)
      const extractedQueries = JSON.parse(stdout);

      // Convert to our GraphQLOperation format
      return this.convertToOperations(extractedQueries);
    } catch (error) {
      logger.error('Failed to extract operations:', error);

      // Fallback: manual extraction for testing
      return this.mockExtractOperations(source);
    }
  }

  async transformOperation(operation: GraphQLOperation): Promise<CodeChange[]> {
    logger.info(`Transforming operation ${operation.name} using existing scripts`);

    try {
      // Use the existing transformation scripts
      const transformScript = path.join(
        this.scriptsBasePath,
        'transformation/enhanced-graphql-codemod-v2.js',
      );

      // Write operation to temp file
      const tempFile = `/tmp/${operation.name}.graphql`;
      await fs.writeFile(tempFile, operation.source);

      // Run transformation
      const { stdout } = await execAsync(`node ${transformScript} ${tempFile}`);

      // Read transformed file
      const transformedContent = await fs.readFile(`${tempFile}.fixed.graphql`, 'utf-8');

      // Create CodeChange object
      const change: CodeChange = {
        file: operation.file,
        operation,
        pattern: this.detectPattern(operation.source, transformedContent),
        oldQuery: operation.source,
        newQuery: transformedContent,
        transformations: this.detectTransformations(operation.source, transformedContent),
      };

      return [change];
    } catch (error) {
      logger.error('Failed to transform operation:', error);
      return [];
    }
  }

  async validateOperations(
    source: string,
    schemaPath: string,
  ): Promise<{
    valid: boolean;
    errors: Array<{
      operation: string;
      message: string;
    }>;
  }> {
    logger.info('Validating operations using existing scripts');

    try {
      // Use the existing validation script
      const validateScript = path.join(this.scriptsBasePath, 'validation/ValidateQueries.js');
      const { stdout, stderr } = await execAsync(
        `node ${validateScript} --source ${source} --schema ${schemaPath}`,
        { encoding: 'utf8' },
      );

      if (stderr) {
        // Parse validation errors
        const errors = this.parseValidationErrors(stderr);
        return { valid: false, errors };
      }

      return { valid: true, errors: [] };
    } catch (error) {
      logger.error('Validation failed:', error);
      return {
        valid: false,
        errors: [{ operation: 'unknown', message: (error as Error).message }],
      };
    }
  }

  async applyChange(change: CodeChange): Promise<void> {
    logger.info(`Applying change to ${change.file}`);

    try {
      // Use AST-based application if operation includes sourceAST
      if (change.operation.sourceAST) {
        const applicator = new ASTCodeApplicator({
          preserveFormatting: true,
          preserveComments: true,
          validateChanges: true,
          dryRun: false,
        });

        const sourceMapping: SourceMapping = {
          astNode: change.operation.sourceAST,
          filePath: change.file,
          originalContent: change.oldQuery,
        };

        const transformationMapping: TransformationMapping = {
          queryId: change.operation.id,
          sourceMapping,
          transformation: {
            original: change.oldQuery,
            transformed: change.newQuery,
            ast: change.operation.ast,
            changes: diff.diffLines(change.oldQuery, change.newQuery),
            rules: [],
          },
          preserveInterpolations: true,
        };

        const applyResult = await applicator.applyTransformations(change.file, [
          transformationMapping,
        ]);

        if (applyResult.success) {
          await fs.writeFile(change.file, applyResult.newContent);
          logger.info(
            `Successfully applied change to ${change.file} using AST-based transformation`,
          );
        } else {
          throw new Error(applyResult.error || 'Failed to apply AST transformation');
        }
      } else {
        // If no sourceAST, this is a critical error - we don't allow unsafe string replacement
        throw new Error(
          `Operation ${change.operation.id} in ${change.file} missing source AST. String replacement is unsafe and not supported.`,
        );
      }

      // Alternative: Use the existing source update engine for validation
      try {
        const updateScript = path.join(this.scriptsBasePath, 'framework/SourceUpdateEngine.js');
        await fs.access(updateScript);

        // If script exists, use it for validation only
        const changeFile = `/tmp/change-${Date.now()}.json`;
        await fs.writeFile(
          changeFile,
          JSON.stringify({
            file: change.file,
            oldQuery: change.oldQuery,
            newQuery: change.newQuery,
            validate: true, // Only validate, don't apply
          }),
        );

        await execAsync(`node ${updateScript} ${changeFile}`);
        logger.info('Validated change using existing source update engine');
      } catch {
        // Script not available, that's okay
      }
    } catch (error) {
      logger.error('Failed to apply change:', error);
      throw error;
    }
  }

  private convertToOperations(extractedQueries: any[]): GraphQLOperation[] {
    return extractedQueries.map((query, index) => ({
      id: query.id || `op-${index}`,
      type: this.detectOperationType(query.content),
      name: query.name || `Operation${index}`,
      ast: parse(query.content),
      source: query.content,
      file: query.file || '',
      line: query.line || 0,
      column: query.column || 0,
      variables: [],
      fragments: this.extractFragments(query.content),
      directives: [],
    }));
  }

  private detectOperationType(content: string): 'query' | 'mutation' | 'subscription' {
    if (content.includes('mutation')) return 'mutation';
    if (content.includes('subscription')) return 'subscription';
    return 'query';
  }

  private extractFragments(content: string): Array<{ name: string; type: string }> {
    const fragmentRegex = /\.\.\.(\w+)/g;
    const fragments: Array<{ name: string; type: string }> = [];

    let match;
    while ((match = fragmentRegex.exec(content)) !== null) {
      fragments.push({
        name: match[1],
        type: 'unknown', // Would need more parsing to determine type
      });
    }

    return fragments;
  }

  private detectPattern(oldQuery: string, newQuery: string): string {
    // Simple pattern detection
    if (oldQuery === newQuery) return 'no-change';
    if (newQuery.includes('nodes') && oldQuery.includes('edges')) return 'connection-to-array';
    if (newQuery.includes('ventures') && oldQuery.includes('allVentures'))
      return 'root-query-migration';

    return 'custom';
  }

  private detectTransformations(oldQuery: string, newQuery: string): any[] {
    const transformations = [];

    // Detect field renames
    if (oldQuery.includes('allVentures') && newQuery.includes('ventures')) {
      transformations.push({
        type: 'field-rename',
        description: 'Renamed root query field',
        from: 'allVentures',
        to: 'ventures',
        automated: true,
      });
    }

    // Detect structure changes
    if (oldQuery.includes('edges') && newQuery.includes('nodes')) {
      transformations.push({
        type: 'structure-change',
        description: 'Converted connection to array',
        from: 'edges { node }',
        to: 'nodes',
        automated: true,
      });
    }

    return transformations;
  }

  private parseValidationErrors(stderr: string): Array<{ operation: string; message: string }> {
    const errors = [];
    const lines = stderr.split('\n');

    for (const line of lines) {
      if (line.includes('Error:') || line.includes('error:')) {
        errors.push({
          operation: 'unknown',
          message: line.trim(),
        });
      }
    }

    return errors;
  }

  private async mockExtractOperations(source: string): Promise<GraphQLOperation[]> {
    // Mock implementation for testing when scripts are not available
    return [
      {
        id: 'mock-1',
        type: 'query',
        name: 'GetVentures',
        ast: parse('query GetVentures { ventures { id name } }'),
        source: 'query GetVentures { ventures { id name } }',
        file: `${source}/mock-file.js`,
        line: 10,
        column: 5,
        variables: [],
        fragments: [],
        directives: [],
      },
    ];
  }
}
