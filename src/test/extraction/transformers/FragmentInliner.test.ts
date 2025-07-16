import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FragmentInliner } from '../../../core/extraction/transformers/FragmentInliner.js';
import { ExtractionContext } from '../../../core/extraction/engine/ExtractionContext.js';
import { ResolvedQuery } from '../../../core/extraction/types/index.js';
import { parse, print } from 'graphql';
import { logger } from '../../../utils/logger.js';

vi.mock('../../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('FragmentInliner', () => {
  let inliner: FragmentInliner;
  let mockContext: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = {} as any;
    inliner = new FragmentInliner(mockContext);
  });

  describe('transform', () => {
    it('should return queries unchanged when no fragments to inline', async () => {
      const queries: ResolvedQuery[] = [
        {
          id: '1',
          name: 'GetUser',
          content: 'query GetUser { user { id name } }',
          resolvedContent: 'query GetUser { user { id name } }',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
          resolvedFragments: [],
          type: 'query',
        },
      ];

      const result = await inliner.transform(queries);
      expect(result).toEqual(queries);
    });

    it('should inline simple fragments', async () => {
      const fragmentContent = 'fragment UserFields on User { id name email }';
      const fragmentAst = parse(fragmentContent);

      const queries: ResolvedQuery[] = [
        {
          id: '1',
          name: 'GetUser',
          content: 'query GetUser { user { ...UserFields } }',
          resolvedContent: 'query GetUser { user { ...UserFields } }',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
          resolvedFragments: [
            {
              name: 'UserFields',
              content: fragmentContent,
              ast: fragmentAst,
              filePath: '/src/fragments.ts',
              location: { line: 1, column: 1 },
              hash: 'fragmentHash',
            },
          ],
          type: 'query',
        },
      ];

      const result = await inliner.transform(queries);

      expect(result[0].resolvedContent).toContain('... on User');
      expect(result[0].resolvedContent).toContain('id');
      expect(result[0].resolvedContent).toContain('name');
      expect(result[0].resolvedContent).toContain('email');
      expect(result[0].resolvedContent).not.toContain('...UserFields');
    });

    it('should handle multiple fragment spreads', async () => {
      const userFieldsFragment = parse('fragment UserFields on User { id name }');
      const profileFieldsFragment = parse('fragment ProfileFields on User { avatar bio }');

      const queries: ResolvedQuery[] = [
        {
          id: '1',
          name: 'GetUser',
          content: 'query GetUser { user { ...UserFields ...ProfileFields } }',
          resolvedContent: 'query GetUser { user { ...UserFields ...ProfileFields } }',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
          resolvedFragments: [
            {
              name: 'UserFields',
              content: 'fragment UserFields on User { id name }',
              ast: userFieldsFragment,
              filePath: '/src/fragments.ts',
              location: { line: 1, column: 1 },
              hash: 'hash1',
            },
            {
              name: 'ProfileFields',
              content: 'fragment ProfileFields on User { avatar bio }',
              ast: profileFieldsFragment,
              filePath: '/src/fragments.ts',
              location: { line: 5, column: 1 },
              hash: 'hash2',
            },
          ],
          type: 'query',
        },
      ];

      const result = await inliner.transform(queries);
      const inlinedContent = result[0].resolvedContent;

      expect(inlinedContent).toContain('id');
      expect(inlinedContent).toContain('name');
      expect(inlinedContent).toContain('avatar');
      expect(inlinedContent).toContain('bio');
      expect(inlinedContent).not.toContain('...UserFields');
      expect(inlinedContent).not.toContain('...ProfileFields');
    });

    it('should preserve directives on fragment spreads', async () => {
      const fragmentAst = parse('fragment UserFields on User { id name }');

      const queries: ResolvedQuery[] = [
        {
          id: '1',
          name: 'GetUser',
          content: 'query GetUser { user { ...UserFields @include(if: $includeUser) } }',
          resolvedContent: 'query GetUser { user { ...UserFields @include(if: $includeUser) } }',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
          resolvedFragments: [
            {
              name: 'UserFields',
              content: 'fragment UserFields on User { id name }',
              ast: fragmentAst,
              filePath: '/src/fragments.ts',
              location: { line: 1, column: 1 },
              hash: 'fragmentHash',
            },
          ],
          type: 'query',
        },
      ];

      const result = await inliner.transform(queries);
      expect(result[0].resolvedContent).toContain('@include(if: $includeUser)');
    });

    it('should handle nested fragments', async () => {
      const baseFieldsFragment = parse('fragment BaseFields on User { id }');
      const userFieldsFragment = parse('fragment UserFields on User { ...BaseFields name }');

      const queries: ResolvedQuery[] = [
        {
          id: '1',
          name: 'GetUser',
          content: 'query GetUser { user { ...UserFields } }',
          resolvedContent: 'query GetUser { user { ...UserFields } }',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
          resolvedFragments: [
            {
              name: 'UserFields',
              content: 'fragment UserFields on User { ...BaseFields name }',
              ast: userFieldsFragment,
              filePath: '/src/fragments.ts',
              location: { line: 1, column: 1 },
              hash: 'hash1',
            },
            // Note: BaseFields would need to be resolved separately in a real scenario
          ],
          type: 'query',
        },
      ];

      const result = await inliner.transform(queries);
      expect(result[0].resolvedContent).toContain('name');
      expect(result[0].resolvedContent).not.toContain('...UserFields');
    });

    it('should handle missing fragments gracefully', async () => {
      const queries: ResolvedQuery[] = [
        {
          id: '1',
          name: 'GetUser',
          content: 'query GetUser { user { ...MissingFragment } }',
          resolvedContent: 'query GetUser { user { ...MissingFragment } }',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
          resolvedFragments: [], // Fragment not resolved
          type: 'query',
        },
      ];

      const result = await inliner.transform(queries);
      expect(result[0].resolvedContent).toContain('...MissingFragment');
    });

    it('should handle parsing errors gracefully', async () => {
      const queries: ResolvedQuery[] = [
        {
          id: '1',
          name: 'InvalidQuery',
          content: 'query { { invalid syntax }',
          resolvedContent: 'query { { invalid syntax }',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
          resolvedFragments: [
            {
              name: 'TestFragment',
              content: 'fragment TestFragment on User { id name }',
              ast: {
                kind: 'Document',
                definitions: [
                  {
                    kind: 'FragmentDefinition',
                    name: { kind: 'Name', value: 'TestFragment' },
                    typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: 'User' } },
                    selectionSet: {
                      kind: 'SelectionSet',
                      selections: [
                        { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                        { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      ],
                    },
                  },
                ],
              },
              filePath: '/src/fragments.ts',
              dependencies: [],
            },
          ],
          type: 'query',
        },
      ];

      const result = await inliner.transform(queries);

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to inline fragments for InvalidQuery:',
        expect.any(Error),
      );
      expect(result[0]).toEqual(queries[0]);
    });
  });

  describe('complex scenarios', () => {
    it('should inline fragments with field arguments', async () => {
      const fragmentAst = parse('fragment UserFields on User { posts(limit: 10) { title } }');

      const queries: ResolvedQuery[] = [
        {
          id: '1',
          name: 'GetUser',
          content: 'query GetUser { user { id ...UserFields } }',
          resolvedContent: 'query GetUser { user { id ...UserFields } }',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
          resolvedFragments: [
            {
              name: 'UserFields',
              content: 'fragment UserFields on User { posts(limit: 10) { title } }',
              ast: fragmentAst,
              filePath: '/src/fragments.ts',
              location: { line: 1, column: 1 },
              hash: 'fragmentHash',
            },
          ],
          type: 'query',
        },
      ];

      const result = await inliner.transform(queries);
      expect(result[0].resolvedContent).toContain('posts(limit: 10)');
      expect(result[0].resolvedContent).toContain('title');
    });

    it('should handle fragments with aliases', async () => {
      const fragmentAst = parse('fragment UserFields on User { userId: id userName: name }');

      const queries: ResolvedQuery[] = [
        {
          id: '1',
          name: 'GetUser',
          content: 'query GetUser { user { ...UserFields } }',
          resolvedContent: 'query GetUser { user { ...UserFields } }',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
          resolvedFragments: [
            {
              name: 'UserFields',
              content: 'fragment UserFields on User { userId: id userName: name }',
              ast: fragmentAst,
              filePath: '/src/fragments.ts',
              location: { line: 1, column: 1 },
              hash: 'fragmentHash',
            },
          ],
          type: 'query',
        },
      ];

      const result = await inliner.transform(queries);
      expect(result[0].resolvedContent).toContain('userId: id');
      expect(result[0].resolvedContent).toContain('userName: name');
    });

    it('should handle fragments on interfaces', async () => {
      const fragmentAst = parse(`
        fragment NodeFields on Node {
          id
          ... on User {
            name
          }
          ... on Post {
            title
          }
        }
      `);

      const queries: ResolvedQuery[] = [
        {
          id: '1',
          name: 'GetNode',
          content: 'query GetNode($id: ID!) { node(id: $id) { ...NodeFields } }',
          resolvedContent: 'query GetNode($id: ID!) { node(id: $id) { ...NodeFields } }',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
          resolvedFragments: [
            {
              name: 'NodeFields',
              content: print(fragmentAst),
              ast: fragmentAst,
              filePath: '/src/fragments.ts',
              location: { line: 1, column: 1 },
              hash: 'fragmentHash',
            },
          ],
          type: 'query',
        },
      ];

      const result = await inliner.transform(queries);
      const inlinedContent = result[0].resolvedContent;

      expect(inlinedContent).toContain('... on Node');
      expect(inlinedContent).toContain('... on User');
      expect(inlinedContent).toContain('... on Post');
      expect(inlinedContent).toContain('name');
      expect(inlinedContent).toContain('title');
    });

    it('should process multiple queries in parallel', async () => {
      const fragmentAst = parse('fragment UserFields on User { id name }');

      const queries: ResolvedQuery[] = [
        {
          id: '1',
          name: 'Query1',
          content: 'query Query1 { user { ...UserFields } }',
          resolvedContent: 'query Query1 { user { ...UserFields } }',
          filePath: '/src/q1.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
          resolvedFragments: [
            {
              name: 'UserFields',
              content: 'fragment UserFields on User { id name }',
              ast: fragmentAst,
              filePath: '/src/fragments.ts',
              location: { line: 1, column: 1 },
              hash: 'frag1',
            },
          ],
          type: 'query',
        },
        {
          id: '2',
          name: 'Query2',
          content: 'query Query2 { user { ...UserFields } }',
          resolvedContent: 'query Query2 { user { ...UserFields } }',
          filePath: '/src/q2.ts',
          location: { line: 1, column: 1 },
          hash: 'hash2',
          resolvedFragments: [
            {
              name: 'UserFields',
              content: 'fragment UserFields on User { id name }',
              ast: fragmentAst,
              filePath: '/src/fragments.ts',
              location: { line: 1, column: 1 },
              hash: 'frag1',
            },
          ],
          type: 'query',
        },
      ];

      const result = await inliner.transform(queries);

      expect(result).toHaveLength(2);
      expect(result[0].resolvedContent).not.toContain('...UserFields');
      expect(result[1].resolvedContent).not.toContain('...UserFields');
    });
  });
});
