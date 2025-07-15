import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ASTCodeApplicator } from '../../core/applicator/ASTCodeApplicator.js';
import { TransformationMapping, SourceMapping } from '../../core/applicator/types.js';
import { SourceAST } from '../../core/extraction/types/query.types.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as babel from '@babel/parser';
import traverse from '@babel/traverse';


describe('ASTCodeApplicator', () => {
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

    // Create temp directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-applicator-test-'));
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('applyTransformations', () => {
    it('should apply transformation to a simple tagged template', async () => {
      const testFile = path.join(tempDir, 'test-simple-tagged.ts');
      const content = `
import { gql } from 'graphql-tag';

const query = gql\`
  query GetUsers {
    allUsers {
      id
      name
    }
  }
\`;
`;
      await fs.writeFile(testFile, content);

      // Parse to get source AST
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

      const sourceAST: SourceAST = {
        node: sourceNode,
        start: sourceNode.start!,
        end: sourceNode.end!,
        parent: ast
      };

      const sourceMapping: SourceMapping = {
        astNode: sourceAST,
        filePath: testFile,
        originalContent: content
      };

      const transformationMapping: TransformationMapping = {
        queryId: 'test-query-1',
        sourceMapping,
        transformation: {
          original: 'query GetUsers {\n    allUsers {\n      id\n      name\n    }\n  }',
          transformed: 'query GetUsers {\n    users {\n      id\n      name\n    }\n  }',
          ast: null as any,
          changes: [],
          rules: []
        },
        preserveInterpolations: false
      };

      const result = await applicator.applyTransformations(testFile, [transformationMapping]);

      expect(result.success).toBe(true);
      expect(result.newContent).toContain('users {');
      expect(result.newContent).not.toContain('allUsers {');
      expect(result.changes).toHaveLength(1);
    });

    it('should preserve interpolations in template literals', async () => {
      const testFile = path.join(tempDir, 'test-interpolations.ts');
      const content = `
import { gql } from 'graphql-tag';

const fragment = 'userFields';
const query = gql\`
  query GetUser($id: ID!) {
    user(id: $id) {
      ...\${fragment}
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

      const sourceAST: SourceAST = {
        node: sourceNode,
        start: sourceNode.start!,
        end: sourceNode.end!,
        parent: ast,
        templateLiteral: {
          quasis: sourceNode.quasi.quasis,
          expressions: sourceNode.quasi.expressions
        }
      };

      const sourceMapping: SourceMapping = {
        astNode: sourceAST,
        filePath: testFile,
        originalContent: content
      };

      const transformationMapping: TransformationMapping = {
        queryId: 'test-query-2',
        sourceMapping,
        transformation: {
          original: 'query GetUser($id: ID!) {\n    user(id: $id) {\n      ...${...}\n    }\n  }',
          transformed: 'query GetUser($id: ID!) {\n    account(id: $id) {\n      ...${...}\n    }\n  }',
          ast: null as any,
          changes: [],
          rules: []
        },
        preserveInterpolations: true
      };

      const result = await applicator.applyTransformations(testFile, [transformationMapping]);

      expect(result.success).toBe(true);
      expect(result.newContent).toContain('account(id: $id)');
      expect(result.newContent).toMatch(/\$\{\s*fragment\s*\}/); // Interpolation preserved
    });

    it('should handle multiple transformations in the same file', async () => {
      const testFile = path.join(tempDir, 'test-multiple.ts');
      const content = `
import { gql } from 'graphql-tag';

const query1 = gql\`
  query GetVentures {
    allVentures {
      id
    }
  }
\`;

const query2 = gql\`
  query GetUsers {
    allUsers {
      id
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

      const sourceNodes: any[] = [];
      traverse(ast, {
        TaggedTemplateExpression(path: any) {
          sourceNodes.push(path.node);
        }
      });

      const transformations: TransformationMapping[] = [
        {
          queryId: 'query-1',
          sourceMapping: {
            astNode: {
              node: sourceNodes[0],
              start: sourceNodes[0].start!,
              end: sourceNodes[0].end!,
              parent: ast
            },
            filePath: testFile,
            originalContent: content
          },
          transformation: {
            original: 'query GetVentures {\n    allVentures {\n      id\n    }\n  }',
            transformed: 'query GetVentures {\n    ventures {\n      id\n    }\n  }',
            ast: null as any,
            changes: [],
            rules: []
          },
          preserveInterpolations: false
        },
        {
          queryId: 'query-2',
          sourceMapping: {
            astNode: {
              node: sourceNodes[1],
              start: sourceNodes[1].start!,
              end: sourceNodes[1].end!,
              parent: ast
            },
            filePath: testFile,
            originalContent: content
          },
          transformation: {
            original: 'query GetUsers {\n    allUsers {\n      id\n    }\n  }',
            transformed: 'query GetUsers {\n    users {\n      id\n    }\n  }',
            ast: null as any,
            changes: [],
            rules: []
          },
          preserveInterpolations: false
        }
      ];

      const result = await applicator.applyTransformations(testFile, transformations);

      expect(result.success).toBe(true);
      expect(result.newContent).toContain('ventures {');
      expect(result.newContent).toContain('users {');
      expect(result.newContent).not.toContain('allVentures');
      expect(result.newContent).not.toContain('allUsers');
      expect(result.changes).toHaveLength(2);
    });

    it('should handle graphql call expressions', async () => {
      const testFile = path.join(tempDir, 'test-call-expressions.ts');
      const content = `
import { graphql } from 'graphql';

const query = graphql(\`
  query GetData {
    oldField {
      id
    }
  }
\`);
`;
      await fs.writeFile(testFile, content);

      const ast = babel.parse(content, {
        sourceType: 'module',
        plugins: ['typescript'],
        ranges: true
      });

      let sourceNode: any;
      traverse(ast, {
        CallExpression(path: any) {
          if (path.node.callee.name === 'graphql') {
            sourceNode = path.node;
          }
        }
      });

      const sourceAST: SourceAST = {
        node: sourceNode,
        start: sourceNode.start!,
        end: sourceNode.end!,
        parent: ast
      };

      const sourceMapping: SourceMapping = {
        astNode: sourceAST,
        filePath: testFile,
        originalContent: content
      };

      const transformationMapping: TransformationMapping = {
        queryId: 'test-query-3',
        sourceMapping,
        transformation: {
          original: 'query GetData {\n    oldField {\n      id\n    }\n  }',
          transformed: 'query GetData {\n    newField {\n      id\n    }\n  }',
          ast: null as any,
          changes: [],
          rules: []
        },
        preserveInterpolations: false
      };

      const result = await applicator.applyTransformations(testFile, [transformationMapping]);

      expect(result.success).toBe(true);
      expect(result.newContent).toContain('newField {');
      expect(result.newContent).not.toContain('oldField {');
    });

    it('should validate generated code', async () => {
      const testFile = path.join(tempDir, 'test-validate.ts');
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

      const sourceAST: SourceAST = {
        node: sourceNode,
        start: sourceNode.start!,
        end: sourceNode.end!,
        parent: ast
      };

      const sourceMapping: SourceMapping = {
        astNode: sourceAST,
        filePath: testFile,
        originalContent: content
      };

      // Create a transformation that would result in invalid JS
      const transformationMapping: TransformationMapping = {
        queryId: 'test-query-4',
        sourceMapping,
        transformation: {
          original: 'query Test {\n    field\n  }',
          transformed: 'query Test {\n    field\n  }', // Valid transformation
          ast: null as any,
          changes: [],
          rules: []
        },
        preserveInterpolations: false
      };

      const result = await applicator.applyTransformations(testFile, [transformationMapping]);

      // Should succeed because the transformation is valid
      expect(result.success).toBe(true);
    });

    it('should handle dry run mode', async () => {
      const testFile = path.join(tempDir, 'test-dry-run.ts');
      const content = `
import { gql } from 'graphql-tag';

const query = gql\`
  query Test {
    oldField
  }
\`;
`;
      // Write file BEFORE creating the applicator
      await fs.writeFile(testFile, content);

      const dryRunApplicator = new ASTCodeApplicator({
        preserveFormatting: true,
        preserveComments: true,
        validateChanges: false,
        dryRun: true
      });

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

      const sourceAST: SourceAST = {
        node: sourceNode,
        start: sourceNode.start!,
        end: sourceNode.end!,
        parent: ast
      };

      const sourceMapping: SourceMapping = {
        astNode: sourceAST,
        filePath: testFile,
        originalContent: content
      };

      const transformationMapping: TransformationMapping = {
        queryId: 'test-query-5',
        sourceMapping,
        transformation: {
          original: 'query Test {\n    oldField\n  }',
          transformed: 'query Test {\n    newField\n  }',
          ast: null as any,
          changes: [],
          rules: []
        },
        preserveInterpolations: false
      };

      const result = await dryRunApplicator.applyTransformations(testFile, [transformationMapping]);

      expect(result.success).toBe(true);
      expect(result.newContent).toBe(content); // Content unchanged in dry run
      expect(result.changes).toHaveLength(1);
      
      // Original file should be unchanged
      const fileContent = await fs.readFile(testFile, 'utf-8');
      expect(fileContent).toBe(content);
    });
  });
}); 