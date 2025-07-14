import * as babel from '@babel/parser';
import traverse from '@babel/traverse';
import { BaseStrategy } from './BaseStrategy';
import { ExtractedQuery, QueryContext, ImportInfo, OperationType, SourceAST } from '../types/index';
import { ExtractionContext } from '../engine/ExtractionContext';
import { safeParseGraphQL } from '../../../utils/graphqlValidator';
import { SourceMapper } from '../utils/SourceMapper';

export class ASTStrategy extends BaseStrategy {
  private sourceMapper: SourceMapper;

  constructor(context: ExtractionContext) {
    super(context);
    this.sourceMapper = new SourceMapper();
  }

  get name(): string {
    return 'ast';
  }

  canHandle(filePath: string): boolean {
    return /\.(js|jsx|ts|tsx)$/.test(filePath);
  }

  async extract(filePath: string, content: string): Promise<ExtractedQuery[]> {
    const extracted: ExtractedQuery[] = [];

    try {
      const ast = babel.parse(content, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties']
      });

      const imports = this.extractImports(ast);
      let queryIndex = 0;

      traverse(ast, {
        TaggedTemplateExpression: (path: any) => {
          if (this.isGraphQLTag(path.node.tag)) {
            const query = this.extractQueryFromTemplate(path, filePath, queryIndex++);
            if (query) {
              query.imports = imports;
              query.context = this.extractContext(path);

              // Preserve source AST if enabled
              if (this.context.options.preserveSourceAST) {
                const sourceAST = this.createSourceAST(path);
                if (sourceAST) {
                  query.sourceAST = sourceAST;
                  this.sourceMapper.register(query.id, sourceAST);
                }
              }

              extracted.push(query);
            }
          }
        },

        CallExpression: (path: any) => {
          // Handle cases like graphql(`...`)
          if (this.isGraphQLCall(path.node)) {
            const query = this.extractQueryFromCall(path, filePath, queryIndex++);
            if (query) {
              query.imports = imports;
              query.context = this.extractContext(path);

              // Preserve source AST if enabled
              if (this.context.options.preserveSourceAST) {
                const sourceAST = this.createSourceAST(path);
                if (sourceAST) {
                  query.sourceAST = sourceAST;
                  this.sourceMapper.register(query.id, sourceAST);
                }
              }

              extracted.push(query);
            }
          }
        }
      });

      // Use pattern-aware processing instead of old name resolution
      if (this.context.options.resolveNames) {
        const namingService = this.context.getQueryNamingService();
        // @ts-ignore
        extracted = namingService.processQueries(extracted);
        // @ts-ignore
        console.log(`Processed ${extracted.length} queries with pattern-aware naming`);
      }
    } catch (error) {
      this.context.addError(
        filePath,
        `AST parsing failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return extracted;
  }

  /**
   * Create a SourceAST object from a Babel path
   */
  private createSourceAST(path: any): SourceAST | null {
    try {
      const node = path.node;
      const parent = path.parent;

      const sourceAST: SourceAST = {
        node,
        start: node.start ?? 0,
        end: node.end ?? 0,
        parent
      };

      // Extract template literal if present
      const templateLiteral = SourceMapper.extractTemplateLiteral(node);
      if (templateLiteral) {
        sourceAST.templateLiteral = templateLiteral;
      }

      return sourceAST;
    } catch (error) {
      this.context.addError(
        'unknown',
        `Failed to create source AST: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * Get the source mapper instance
   */
  getSourceMapper(): SourceMapper {
    return this.sourceMapper;
  }

  private isGraphQLTag(tag: any): boolean {
    if (tag.type === 'Identifier') {
      return ['gql', 'graphql', 'GraphQL'].includes(tag.name);
    }
    if (tag.type === 'MemberExpression') {
      return this.isGraphQLTag(tag.property);
    }
    return false;
  }

  private isGraphQLCall(node: any): boolean {
    return node.callee.type === 'Identifier' &&
           ['gql', 'graphql', 'GraphQL'].includes(node.callee.name) &&
           node.arguments.length > 0 &&
           node.arguments[0].type === 'TemplateLiteral';
  }

  private extractQueryFromTemplate(path: any, filePath: string, index: number): ExtractedQuery | null {
    const quasi = path.node.quasi;

    // Safety check for quasi structure
    if (!quasi || !quasi.quasis) {
      this.context.addError(
        filePath,
        'Invalid template literal structure',
        path.node.loc?.start.line,
        path.node.loc?.start.column
      );
      return null;
    }

    const content = this.reconstructTemplate(quasi);
    const hasInterpolations = content.includes('${');

    // For templates with interpolations, extract without full parsing
    if (hasInterpolations) {
      const type = this.detectOperationTypeFromString(content) || 'query';
      const name = this.extractOperationNameFromString(content);

      return {
        id: this.generateQueryId(filePath, index, name),
        filePath,
        content,
        ast: null,
        location: {
          line: path.node.loc?.start.line || 1,
          column: path.node.loc?.start.column || 1,
          file: filePath
        },
        name,
        type,
        metadata: {
          hasInterpolations: true,
          needsResolution: true
        }
      };
    }

    const validation = safeParseGraphQL(content);
    if (!validation.isValid || !validation.ast) {
      this.context.addError(
        filePath,
        `Invalid GraphQL in template: ${validation.error?.message}`,
        path.node.loc?.start.line,
        path.node.loc?.start.column
      );
      return null;
    }

    const type = this.detectOperationType(validation.ast);
    const name = this.extractOperationName(validation.ast);

    return {
      id: this.generateQueryId(filePath, index, name),
      filePath,
      content,
      ast: validation.ast,
      location: {
        line: path.node.loc?.start.line || 1,
        column: path.node.loc?.start.column || 1,
        file: filePath
      },
      name,
      type
    };
  }

  private extractQueryFromCall(path: any, filePath: string, index: number): ExtractedQuery | null {
    const templateLiteral = path.node.arguments[0];

    // Safety check for template literal structure
    if (!templateLiteral || !templateLiteral.quasis) {
      this.context.addError(
        filePath,
        'Invalid template literal structure in call',
        path.node.loc?.start.line,
        path.node.loc?.start.column
      );
      return null;
    }

    const content = this.reconstructTemplate(templateLiteral);
    const hasInterpolations = content.includes('${');

    // For templates with interpolations, extract without full parsing
    if (hasInterpolations) {
      const type = this.detectOperationTypeFromString(content) || 'query';
      const name = this.extractOperationNameFromString(content);

      return {
        id: this.generateQueryId(filePath, index, name),
        filePath,
        content,
        ast: null,
        location: {
          line: path.node.loc?.start.line || 1,
          column: path.node.loc?.start.column || 1,
          file: filePath
        },
        name,
        type,
        metadata: {
          hasInterpolations: true,
          needsResolution: true
        }
      };
    }

    const validation = safeParseGraphQL(content);
    if (!validation.isValid || !validation.ast) {
      this.context.addError(
        filePath,
        `Invalid GraphQL in call: ${validation.error?.message}`,
        path.node.loc?.start.line,
        path.node.loc?.start.column
      );
      return null;
    }

    const type = this.detectOperationType(validation.ast);
    const name = this.extractOperationName(validation.ast);

    return {
      id: this.generateQueryId(filePath, index, name),
      filePath,
      content,
      ast: validation.ast,
      location: {
        line: path.node.loc?.start.line || 1,
        column: path.node.loc?.start.column || 1,
        file: filePath
      },
      name,
      type
    };
  }

  private reconstructTemplate(quasi: any): string {
    let content = '';

    // Ensure quasis exists
    if (!quasi.quasis) {
      return '';
    }

    quasi.quasis.forEach((element: any, index: number) => {
      content += element.value.raw;

      // Check if expressions exist and has elements before accessing length
      if (quasi.expressions && Array.isArray(quasi.expressions) && quasi.expressions.length > 0 && index < quasi.expressions.length) {
        // For now, just add a placeholder
        // The variant analyzer will handle these properly
        content += '${...}';
      }
    });

    return content;
  }

  private extractImports(ast: any): ImportInfo[] {
    const imports: ImportInfo[] = [];

    traverse(ast, {
      ImportDeclaration: (path: any) => {
        const source = path.node.source.value;
        const imported = path.node.specifiers.map((spec: any) => {
          if (spec.type === 'ImportDefaultSpecifier') {
            return 'default';
          } else if (spec.type === 'ImportSpecifier') {
            return spec.imported.name;
          } else if (spec.type === 'ImportNamespaceSpecifier') {
            return '*';
          }
          return '';
        }).filter(Boolean);

        if (imported.length > 0) {
          imports.push({ source, imported, type: 'es6' });
        }
      },

      CallExpression: (path: any) => {
        if (path.node.callee.name === 'require' && path.node.arguments[0]?.type === 'StringLiteral') {
          const source = path.node.arguments[0].value;
          imports.push({ source, imported: ['*'], type: 'commonjs' });
        }
      }
    });

    return imports;
  }

  private extractContext(path: any): QueryContext {
    const context: QueryContext = {};

    // Find containing function
    let functionPath = path.getFunctionParent();
    if (functionPath) {
      if (functionPath.node.id) {
        context.functionName = functionPath.node.id.name;
      }

      // Check if it's exported
      if (functionPath.parent?.type === 'ExportNamedDeclaration') {
        context.isExported = true;
      } else if (functionPath.parent?.type === 'ExportDefaultDeclaration') {
        context.isExported = true;
        context.isDefaultExport = true;
      }
    }

    // Find containing class/component
    let classPath = path.findParent((p: any) => p.isClassDeclaration() || p.isClassExpression());
    if (classPath && classPath.node.id) {
      context.componentName = classPath.node.id.name;
    }

    // Extract surrounding code (limited)
    if (path.node.loc) {
      const start = Math.max(0, path.node.loc.start.line - 3);
      const end = path.node.loc.end.line + 3;
      context.surroundingCode = `lines ${start}-${end}`;
    }

    return context;
  }

  /**
   * @deprecated This method is replaced by QueryNamingService pattern-based approach
   * The old approach used unsafe eval() and manual name resolution
   */
  private resolveQueryNames(ast: any, queries: ExtractedQuery[]): Map<number, string> {
    // @ts-ignore
    console.warn('resolveQueryNames is deprecated. Use QueryNamingService for pattern-based query processing.');
    return new Map(); // Return empty map for backward compatibility
  }

  private detectOperationType(ast: any): any {
    const definition = ast.definitions[0];

    if (definition.kind === 'OperationDefinition') {
      return definition.operation;
    }

    if (definition.kind === 'FragmentDefinition') {
      return 'fragment';
    }

    return 'query';
  }

  private extractOperationName(ast: any): string | undefined {
    const definition = ast.definitions[0];

    if (definition.kind === 'OperationDefinition' || definition.kind === 'FragmentDefinition') {
      return definition.name?.value;
    }

    return undefined;
  }

  private detectOperationTypeFromString(content: string): OperationType | null {
    const trimmed = content.trim();

    if (trimmed.includes('query') || trimmed.match(/query\s+[\w$]/)) return 'query';
    if (trimmed.includes('mutation') || trimmed.match(/mutation\s+[\w$]/)) return 'mutation';
    if (trimmed.includes('subscription') || trimmed.match(/subscription\s+[\w$]/)) return 'subscription';
    if (trimmed.includes('fragment') || trimmed.match(/fragment\s+[\w$]/)) return 'fragment';

    return null;
  }

  private extractOperationNameFromString(content: string): string | undefined {
    // Try to extract operation name from templates with interpolations
    // Look for patterns like "query SomeName" or "mutation SomeName"
    const patterns = [
      /query\s+([\w]+)\s*[({$]/,
      /mutation\s+([\w]+)\s*[({$]/,
      /subscription\s+([\w]+)\s*[({$]/,
      /fragment\s+([\w]+)\s+on/
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return undefined;
  }
}
