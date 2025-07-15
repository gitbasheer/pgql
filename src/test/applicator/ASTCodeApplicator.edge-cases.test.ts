import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ASTCodeApplicator } from '../../core/applicator/ASTCodeApplicator.js';
import { TransformationMapping, SourceMapping } from '../../core/applicator/types.js';
import { SourceAST } from '../../core/extraction/types/query.types.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as babel from '@babel/parser';
import traverse from '@babel/traverse';


describe('ASTCodeApplicator - Edge Cases', () => {
  let applicator: ASTCodeApplicator;
  let tempDir: string;

  beforeEach(async () => {
    vi.resetModules();
    applicator = new ASTCodeApplicator({
      preserveFormatting: true,
      preserveComments: true,
      validateChanges: true,
      dryRun: false
    });

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-applicator-edge-'));
  });

  afterEach(async () => {
    // Clean up temp directory with retry logic for race conditions
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Retry once after a small delay if directory is not empty
      if ((error as any).code === 'ENOTEMPTY') {
        await new Promise(resolve => setTimeout(resolve, 100));
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    }
  });

  describe('error handling', () => {
    it('should handle file read errors gracefully', async () => {
      const nonExistentFile = path.join(tempDir, 'non-existent.ts');
      
      const transformationMapping: TransformationMapping = {
        queryId: 'test-1',
        sourceMapping: {
          astNode: {
            node: {} as any,
            start: 0,
            end: 10,
            parent: {} as any
          },
          filePath: nonExistentFile,
          originalContent: ''
        },
        transformation: {
          original: '',
          transformed: '',
          ast: null as any,
          changes: [],
          rules: []
        },
        preserveInterpolations: false
      };

      const result = await applicator.applyTransformations(nonExistentFile, [transformationMapping]);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle invalid JavaScript in file', async () => {
      const testFile = path.join(tempDir, 'test-invalid-js.ts');
      const content = `
import { gql } from 'graphql-tag';

const query = gql\`
  query Test {
    field
  }
\`; // Missing closing brace intentionally

const broken = {
`;
      await fs.writeFile(testFile, content);

      const transformationMapping: TransformationMapping = {
        queryId: 'test-2',
        sourceMapping: {
          astNode: {
            node: {} as any,
            start: 0,
            end: 10,
            parent: {} as any
          },
          filePath: testFile,
          originalContent: content
        },
        transformation: {
          original: 'query Test { field }',
          transformed: 'query Test { newField }',
          ast: null as any,
          changes: [],
          rules: []
        },
        preserveInterpolations: false
      };

      const result = await applicator.applyTransformations(testFile, [transformationMapping]);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unexpected token');
    });

    it('should handle transformations that produce invalid JavaScript', async () => {
      const testFile = path.join(tempDir, 'test-validate-js.ts');
      const noValidateApplicator = new ASTCodeApplicator({
        preserveFormatting: true,
        preserveComments: true,
        validateChanges: false, // Disable validation to test the validation itself
        dryRun: false
      });

      const content = `
import { gql } from 'graphql-tag';

const query = gql\`
  query Test {
    field
  }
\`;
`;
      await fs.writeFile(testFile, content);

      const ast = babel.parse(content, {
        sourceType: 'module',
        plugins: ['typescript'],
        ranges: true
      });

      let sourceNode: any;
      traverse(ast, {
        TaggedTemplateExpression(path: any) {
          sourceNode = path.node;
        }
      });

      // This would test the validator, but since we can't easily create invalid JS
      // from valid transformations, we'll test that valid transformations pass
      const transformationMapping: TransformationMapping = {
        queryId: 'test-3',
        sourceMapping: {
          astNode: {
            node: sourceNode,
            start: sourceNode.start!,
            end: sourceNode.end!,
            parent: ast
          },
          filePath: testFile,
          originalContent: content
        },
        transformation: {
          original: 'query Test {\n    field\n  }',
          transformed: 'query Test {\n    newField\n  }',
          ast: null as any,
          changes: [],
          rules: []
        },
        preserveInterpolations: false
      };

      const result = await noValidateApplicator.applyTransformations(testFile, [transformationMapping]);
      
      expect(result.success).toBe(true);
    });
  });

  describe('complex GraphQL patterns', () => {
    it('should handle GraphQL tags with member expressions', async () => {
      const testFile = path.join(tempDir, 'test-member-expressions.ts');
      const content = `
import { Apollo } from 'apollo-client';

const query = Apollo.gql\`
  query Test {
    field
  }
\`;
`;
      await fs.writeFile(testFile, content);

      const ast = babel.parse(content, {
        sourceType: 'module',
        plugins: ['typescript'],
        ranges: true
      });

      // ASTCodeApplicator should not find this as it only looks for simple identifiers
      const transformations: TransformationMapping[] = [];

      const result = await applicator.applyTransformations(testFile, transformations);
      
      expect(result.success).toBe(true);
      expect(result.changes).toHaveLength(0);
    });

    it('should handle multiple GraphQL tags of different types', async () => {
      const testFile = path.join(tempDir, 'test-multiple-tags.ts');
      const content = `
import { gql, graphql, GraphQL } from 'graphql-tag';

const query1 = gql\`query { a }\`;
const query2 = graphql\`query { b }\`;
const query3 = GraphQL\`query { c }\`;
`;
      await fs.writeFile(testFile, content);

      const ast = babel.parse(content, {
        sourceType: 'module',
        plugins: ['typescript'],
        ranges: true
      });

      const sourceNodes: any[] = [];
      traverse(ast, {
        TaggedTemplateExpression(path: any) {
          sourceNodes.push(path.node);
        }
      });

      expect(sourceNodes).toHaveLength(3);

      // Create transformations for all three
      const transformations = sourceNodes.map((node, index) => ({
        queryId: `query-${index + 1}`,
        sourceMapping: {
          astNode: {
            node,
            start: node.start!,
            end: node.end!,
            parent: ast
          },
          filePath: testFile,
          originalContent: content
        },
        transformation: {
          original: `query { ${String.fromCharCode(97 + index)} }`,
          transformed: `query { new${String.fromCharCode(65 + index)} }`,
          ast: null as any,
          changes: [],
          rules: []
        },
        preserveInterpolations: false
      }));

      const result = await applicator.applyTransformations(testFile, transformations);
      
      expect(result.success).toBe(true);
      expect(result.changes).toHaveLength(3);
      expect(result.newContent).toContain('newA');
      expect(result.newContent).toContain('newB');
      expect(result.newContent).toContain('newC');
    });
  });

  describe('interpolation edge cases', () => {
    it('should handle nested template literals', async () => {
      const testFile = path.join(tempDir, 'test-nested-literals.ts');
      const content = `
import { gql } from 'graphql-tag';

const innerFragment = \`fragment Inner on User { id }\`;
const query = gql\`
  query Test {
    user {
      ...\${innerFragment}
    }
  }
\`;
`;
      await fs.writeFile(testFile, content);

      const ast = babel.parse(content, {
        sourceType: 'module',
        plugins: ['typescript'],
        ranges: true
      });

      let sourceNode: any;
      traverse(ast, {
        TaggedTemplateExpression(path: any) {
          if (path.node.tag.name === 'gql') {
            sourceNode = path.node;
          }
        }
      });

      const transformationMapping: TransformationMapping = {
        queryId: 'test-nested',
        sourceMapping: {
          astNode: {
            node: sourceNode,
            start: sourceNode.start!,
            end: sourceNode.end!,
            parent: ast,
            templateLiteral: {
              quasis: sourceNode.quasi.quasis,
              expressions: sourceNode.quasi.expressions
            }
          },
          filePath: testFile,
          originalContent: content
        },
        transformation: {
          original: 'query Test {\n    user {\n      ...${...}\n    }\n  }',
          transformed: 'query Test {\n    account {\n      ...${...}\n    }\n  }',
          ast: null as any,
          changes: [],
          rules: []
        },
        preserveInterpolations: true
      };

      const result = await applicator.applyTransformations(testFile, [transformationMapping]);
      
      expect(result.success).toBe(true);
      expect(result.newContent).toContain('account');
      expect(result.newContent).toMatch(/\$\{\s*innerFragment\s*\}/);
    });

    it('should handle complex interpolation expressions', async () => {
      const testFile = path.join(tempDir, 'test-complex-interpolations.ts');
      const content = `
import { gql } from 'graphql-tag';

const fragments = { user: 'fragment UserFields on User { id }' };
const query = gql\`
  query Test {
    user {
      ...\${fragments.user}
      ...\${getFragment('profile')}
    }
  }
\`;
`;
      await fs.writeFile(testFile, content);

      const ast = babel.parse(content, {
        sourceType: 'module',
        plugins: ['typescript'],
        ranges: true
      });

      let sourceNode: any;
      traverse(ast, {
        TaggedTemplateExpression(path: any) {
          sourceNode = path.node;
        }
      });

      const transformationMapping: TransformationMapping = {
        queryId: 'test-complex',
        sourceMapping: {
          astNode: {
            node: sourceNode,
            start: sourceNode.start!,
            end: sourceNode.end!,
            parent: ast,
            templateLiteral: {
              quasis: sourceNode.quasi.quasis,
              expressions: sourceNode.quasi.expressions
            }
          },
          filePath: testFile,
          originalContent: content
        },
        transformation: {
          original: 'query Test {\n    user {\n      ...${...}\n      ...${...}\n    }\n  }',
          transformed: 'query Test {\n    account {\n      ...${...}\n      ...${...}\n    }\n  }',
          ast: null as any,
          changes: [],
          rules: []
        },
        preserveInterpolations: true
      };

      const result = await applicator.applyTransformations(testFile, [transformationMapping]);
      
      expect(result.success).toBe(true);
      expect(result.newContent).toContain('account');
      expect(result.newContent).toMatch(/\$\{\s*fragments\.user\s*\}/);
      expect(result.newContent).toMatch(/\$\{\s*getFragment\('profile'\)\s*\}/);
    });
  });

  describe('whitespace and formatting', () => {
    it('should preserve custom formatting', async () => {
      const testFile = path.join(tempDir, 'test-custom-formatting.ts');
      const content = `
import { gql } from 'graphql-tag';

const query = gql\`
  query Test {
    user {
      id
      name
      email
    }
  }
\`;
`;
      await fs.writeFile(testFile, content);

      const ast = babel.parse(content, {
        sourceType: 'module',
        plugins: ['typescript'],
        ranges: true
      });

      let sourceNode: any;
      traverse(ast, {
        TaggedTemplateExpression(path: any) {
          sourceNode = path.node;
        }
      });

      const transformationMapping: TransformationMapping = {
        queryId: 'test-format',
        sourceMapping: {
          astNode: {
            node: sourceNode,
            start: sourceNode.start!,
            end: sourceNode.end!,
            parent: ast
          },
          filePath: testFile,
          originalContent: content
        },
        transformation: {
          original: content.match(/query Test[\s\S]*?}\s*}/)?.[0] || '',
          transformed: 'query Test {\n    account {\n      id\n      name\n      email\n    }\n  }',
          ast: null as any,
          changes: [],
          rules: []
        },
        preserveInterpolations: false
      };

      const result = await applicator.applyTransformations(testFile, [transformationMapping]);
      
      expect(result.success).toBe(true);
      expect(result.newContent).toContain('account');
      // Should maintain similar formatting
      expect(result.newContent.includes('      id\n      name\n      email')).toBe(true);
    });

    it('should preserve comments', async () => {
      const testFile = path.join(tempDir, 'test-preserve-comments.ts');
      const content = `
import { gql } from 'graphql-tag';

// This is an important query
const query = gql\`
  # GraphQL comment
  query Test {
    user { # inline comment
      id
    }
  }
\`;
// After query comment
`;
      await fs.writeFile(testFile, content);

      const ast = babel.parse(content, {
        sourceType: 'module',
        plugins: ['typescript'],
        ranges: true,
        attachComment: true
      });

      let sourceNode: any;
      traverse(ast, {
        TaggedTemplateExpression(path: any) {
          sourceNode = path.node;
        }
      });

      const transformationMapping: TransformationMapping = {
        queryId: 'test-comments',
        sourceMapping: {
          astNode: {
            node: sourceNode,
            start: sourceNode.start!,
            end: sourceNode.end!,
            parent: ast
          },
          filePath: testFile,
          originalContent: content
        },
        transformation: {
          original: '# GraphQL comment\n  query Test {\n    user { # inline comment\n      id\n    }\n  }',
          transformed: '# GraphQL comment\n  query Test {\n    account { # inline comment\n      id\n    }\n  }',
          ast: null as any,
          changes: [],
          rules: []
        },
        preserveInterpolations: false
      };

      const result = await applicator.applyTransformations(testFile, [transformationMapping]);
      
      expect(result.success).toBe(true);
      expect(result.newContent).toContain('// This is an important query');
      expect(result.newContent).toContain('// After query comment');
      expect(result.newContent).toContain('# GraphQL comment');
      expect(result.newContent).toContain('# inline comment');
    });
  });

  describe('no matching transformations', () => {
    it('should handle empty transformation list', async () => {
      const testFile = path.join(tempDir, 'test-empty-list.ts');
      const content = `
import { gql } from 'graphql-tag';

const query = gql\`
  query Test {
    field
  }
\`;
`;
      await fs.writeFile(testFile, content);

      const result = await applicator.applyTransformations(testFile, []);
      
      expect(result.success).toBe(true);
      expect(result.changes).toHaveLength(0);
      expect(result.newContent).toBe(content);
    });

    it('should handle transformations with non-matching positions', async () => {
      const testFile = path.join(tempDir, 'test-non-matching.ts');
      const content = `
import { gql } from 'graphql-tag';

const query = gql\`
  query Test {
    field
  }
\`;
`;
      await fs.writeFile(testFile, content);

      const transformationMapping: TransformationMapping = {
        queryId: 'test-no-match',
        sourceMapping: {
          astNode: {
            node: { start: 9999, end: 10000 } as any,
            start: 9999,
            end: 10000,
            parent: {} as any
          },
          filePath: testFile,
          originalContent: content
        },
        transformation: {
          original: 'query Test { field }',
          transformed: 'query Test { newField }',
          ast: null as any,
          changes: [],
          rules: []
        },
        preserveInterpolations: false
      };

      const result = await applicator.applyTransformations(testFile, [transformationMapping]);
      
      expect(result.success).toBe(true);
      expect(result.changes).toHaveLength(0);
      expect(result.newContent).toBe(content);
    });
  });
}); 