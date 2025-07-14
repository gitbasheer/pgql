import * as babel from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import { promises as fs } from 'fs';
import { 
  TransformationMapping, 
  AppliedChange, 
  MinimalChange,
  ASTApplicatorOptions 
} from './types';
import { MinimalChangeCalculator } from './MinimalChangeCalculator';
import { logger } from '../../utils/logger';


export class ASTCodeApplicator {
  private changeCalculator: MinimalChangeCalculator;
  private options: ASTApplicatorOptions;

  constructor(options: Partial<ASTApplicatorOptions> = {}) {
    this.options = {
      preserveFormatting: true,
      preserveComments: true,
      validateChanges: true,
      dryRun: false,
      ...options
    };
    this.changeCalculator = new MinimalChangeCalculator();
  }

  /**
   * Apply a single transformation (wrapper for compatibility)
   */
  async applyTransformation(
    filePath: string,
    sourceMapping: any,
    transformation: any
  ): Promise<MinimalChange | null> {
    const content = await fs.readFile(filePath, 'utf-8');
    const mapping: TransformationMapping = {
      queryId: transformation.id || 'unknown',
      sourceMapping: { 
        astNode: sourceMapping,
        filePath,
        originalContent: content
      },
      transformation,
      preserveInterpolations: true
    };
    
    const result = await this.applyTransformations(filePath, [mapping]);
    return result.success && result.changes.length > 0 ? result.changes[0] : null;
  }

  /**
   * Apply transformations to a file using AST manipulation
   */
  async applyTransformations(
    filePath: string,
    transformations: TransformationMapping[]
  ): Promise<AppliedChange> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Parse the file into AST
      const ast = babel.parse(content, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties'],
        ranges: true,
        tokens: true,
        attachComment: this.options.preserveComments
      });

      // Sort transformations by position (reverse order to avoid position shifts)
      const sortedTransformations = transformations.sort(
        (a, b) => b.sourceMapping.astNode.start - a.sourceMapping.astNode.start
      );

      const appliedChanges: MinimalChange[] = [];
      let hasErrors = false;
      let errorMessage: string | undefined;

      // Apply transformations using AST traversal
      traverse(ast, {
        TaggedTemplateExpression: (path: any) => {
          const transformation = this.findMatchingTransformation(
            path.node,
            sortedTransformations,
            content
          );

          if (transformation) {
            try {
              const change = this.applyMinimalChange(path, transformation, content);
              if (change) {
                appliedChanges.push(change);
              }
            } catch (error) {
              hasErrors = true;
              errorMessage = error instanceof Error ? error.message : String(error);
              logger.error(`Failed to apply transformation: ${errorMessage}`);
            }
          }
        },

        CallExpression: (path: any) => {
          // Handle graphql(`...`) style calls
          if (this.isGraphQLCall(path.node)) {
            const transformation = this.findMatchingTransformation(
              path.node,
              sortedTransformations,
              content
            );

            if (transformation) {
              try {
                const change = this.applyMinimalChange(path, transformation, content);
                if (change) {
                  appliedChanges.push(change);
                }
              } catch (error) {
                hasErrors = true;
                errorMessage = error instanceof Error ? error.message : String(error);
                logger.error(`Failed to apply transformation: ${errorMessage}`);
              }
            }
          }
        }
      });

      // Generate the updated code
      const { code } = generate(ast, {
        retainLines: this.options.preserveFormatting,
        retainFunctionParens: true,
        comments: this.options.preserveComments,
        compact: false,
        concise: false,
        jsescOption: {
          quotes: 'single',
          wrap: true
        },
        jsonCompatibleStrings: false
      }, content);
      
      // Babel sometimes adds or removes trailing newlines, so normalize them
      const originalNewlineCount = (content.match(/\n*$/)?.[0] || '').length;
      const generatedNewlineCount = (code.match(/\n*$/)?.[0] || '').length;
      
      let newContent = code;
      if (originalNewlineCount !== generatedNewlineCount) {
        // Restore original trailing newlines
        newContent = code.replace(/\n*$/, '\n'.repeat(originalNewlineCount));
      }

      // Validate changes if required
      if (this.options.validateChanges && !this.options.dryRun) {
        await this.validateChanges(filePath, content, newContent);
      }

      // Write the file if not in dry-run mode
      if (!this.options.dryRun && newContent !== content) {
        await fs.writeFile(filePath, newContent, 'utf-8');
      }

      return {
        filePath,
        originalContent: content,
        newContent: this.options.dryRun ? content : newContent,
        changes: appliedChanges,
        success: !hasErrors,
        error: errorMessage
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to apply transformations to ${filePath}: ${errorMessage}`);
      
      return {
        filePath,
        originalContent: '',
        newContent: '',
        changes: [],
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Apply a minimal change to a specific AST node
   */
  private applyMinimalChange(
    path: any,
    transformation: TransformationMapping,
    originalContent: string
  ): MinimalChange | null {
    const node = path.node;
    
    if (node.type === 'TaggedTemplateExpression') {
      return this.applyToTaggedTemplate(path, transformation, originalContent);
    } else if (node.type === 'CallExpression' && this.isGraphQLCall(node)) {
      return this.applyToCallExpression(path, transformation, originalContent);
    }

    return null;
  }

  /**
   * Apply transformation to a tagged template expression (gql`...`)
   */
  private applyToTaggedTemplate(
    path: any,
    transformation: TransformationMapping,
    originalContent: string
  ): MinimalChange {
    const node = path.node;
    const quasi = node.quasi;
    
    // Extract the original GraphQL content
    const originalGraphQL = this.extractGraphQLContent(quasi);
    const start = node.start!;
    const end = node.end!;
    
    // Apply transformation while preserving interpolations
    if (transformation.preserveInterpolations && quasi.expressions.length > 0) {
      // Update quasis with transformed content while keeping expressions
      const transformedQuasis = this.updateQuasisWithTransformation(
        quasi.quasis,
        quasi.expressions,
        transformation.transformation.transformed,
        originalGraphQL
      );
      
      // Replace the quasis in the AST
      quasi.quasis = transformedQuasis;
    } else {
      // Simple case: no interpolations or not preserving them
      // Create a new template element with the transformed content
      const newTemplateElement = t.templateElement({
        raw: `\n${transformation.transformation.transformed}\n`,
        cooked: `\n${transformation.transformation.transformed}\n`
      }, true);  // tail = true since it's the only element
      
      // Replace the quasi with a new template literal
      const newQuasi = t.templateLiteral([newTemplateElement], []);
      node.quasi = newQuasi;
    }

    return {
      start,
      end,
      originalText: originalContent.substring(start, end),
      newText: generate(node).code,
      reason: `Applied transformation: GraphQL query update`
    };
  }

  /**
   * Apply transformation to a call expression (graphql(`...`))
   */
  private applyToCallExpression(
    path: any,
    transformation: TransformationMapping,
    originalContent: string
  ): MinimalChange {
    const node = path.node;
    const templateLiteral = node.arguments[0];
    
    if (!t.isTemplateLiteral(templateLiteral)) {
      throw new Error('Expected template literal in GraphQL call expression');
    }

    const start = node.start!;
    const end = node.end!;
    
    // Similar logic to tagged template, but applied to the argument
    if (transformation.preserveInterpolations && templateLiteral.expressions.length > 0) {
      const originalGraphQL = this.extractGraphQLContent(templateLiteral);
      const transformedQuasis = this.updateQuasisWithTransformation(
        templateLiteral.quasis,
        templateLiteral.expressions,
        transformation.transformation.transformed,
        originalGraphQL
      );
      templateLiteral.quasis = transformedQuasis;
    } else {
      // Create a new template element with the transformed content
      const newTemplateElement = t.templateElement({
        raw: `\n${transformation.transformation.transformed}\n`,
        cooked: `\n${transformation.transformation.transformed}\n`
      }, true);  // tail = true since it's the only element
      
      const newTemplateLiteral = t.templateLiteral([newTemplateElement], []);
      node.arguments[0] = newTemplateLiteral;
    }

    return {
      start,
      end,
      originalText: originalContent.substring(start, end),
      newText: generate(node).code,
      reason: `Applied transformation: GraphQL query update`
    };
  }

  /**
   * Update template literal quasis with transformed content while preserving interpolations
   */
  private updateQuasisWithTransformation(
    quasis: any[],
    expressions: any[],
    transformedQuery: string,
    originalQuery: string
  ): any[] {
    // Use the MinimalChangeCalculator to map changes
    const changeMap = this.changeCalculator.calculateGraphQLChanges(
      originalQuery,
      transformedQuery
    );

    // Apply changes to quasis while preserving interpolation positions
    return this.changeCalculator.applyChangesToQuasis(quasis, changeMap);
  }

  /**
   * Extract GraphQL content from a template literal
   */
  private extractGraphQLContent(templateLiteral: any): string {
    let content = '';
    
    templateLiteral.quasis.forEach((element: any, index: number) => {
      content += element.value.raw;
      
      if (index < templateLiteral.expressions.length) {
        // Add placeholder for interpolation
        content += '${...}';
      }
    });
    
    return content;
  }

  /**
   * Find a transformation that matches the given AST node
   */
  private findMatchingTransformation(
    node: any,
    transformations: TransformationMapping[],
    fileContent: string
  ): TransformationMapping | undefined {
    // First try exact position match
    const exactMatch = transformations.find(t => {
      const astNode = t.sourceMapping.astNode.node;
      return astNode.start === node.start && astNode.end === node.end;
    });
    
    if (exactMatch) {
      return exactMatch;
    }

    // Only use content-based matching if positions are reasonably close
    // This prevents matching completely unrelated nodes
    const nodeContent = this.extractNodeGraphQLContent(node);
    
    const contentMatch = transformations.find(t => {
      const astNode = t.sourceMapping.astNode.node;
      
      // Check if the transformation is for a node in the same general area of the file
      // Allow some flexibility for small position differences (e.g., due to whitespace)
      const positionDiff = Math.abs((astNode.start ?? 0) - node.start) + Math.abs((astNode.end ?? 0) - node.end);
      if (positionDiff > 100) {
        // Positions are too different, skip this transformation
        return false;
      }
      
      // Normalize both contents for comparison
      const transformationOriginal = t.transformation.original.replace(/\s+/g, ' ').trim();
      const nodeContentNormalized = nodeContent.replace(/\s+/g, ' ').trim();
      
      // Check if the content matches (allowing for whitespace differences)
      return transformationOriginal === nodeContentNormalized ||
             // Also check if it's a substring match (for cases with interpolations)
             (nodeContentNormalized.includes(transformationOriginal) && transformationOriginal.length > 10) ||
             (transformationOriginal.includes(nodeContentNormalized) && nodeContentNormalized.length > 10);
    });
    
    return contentMatch;
  }

  /**
   * Extract GraphQL content from any supported node type
   */
  private extractNodeGraphQLContent(node: any): string {
    if (node.type === 'TaggedTemplateExpression') {
      return this.extractGraphQLContent(node.quasi);
    } else if (node.type === 'CallExpression' && this.isGraphQLCall(node)) {
      const templateLiteral = node.arguments[0];
      if (t.isTemplateLiteral(templateLiteral)) {
        return this.extractGraphQLContent(templateLiteral);
      }
    }
    return '';
  }

  /**
   * Check if a node is a GraphQL call expression
   */
  private isGraphQLCall(node: any): boolean {
    return node.type === 'CallExpression' &&
           node.callee.type === 'Identifier' &&
           ['gql', 'graphql', 'GraphQL'].includes(node.callee.name) &&
           node.arguments.length > 0 &&
           node.arguments[0].type === 'TemplateLiteral';
  }

  /**
   * Validate that changes were applied correctly
   */
  private async validateChanges(
    filePath: string,
    originalContent: string,
    newContent: string
  ): Promise<void> {
    // Basic validation: ensure file can still be parsed
    try {
      babel.parse(newContent, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties']
      });
    } catch (error) {
      throw new Error(`Generated invalid JavaScript/TypeScript: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Additional validation can be added here
    logger.info(`Successfully validated changes for ${filePath}`);
  }
} 