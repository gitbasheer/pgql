import { describe, it, expect, beforeEach } from 'vitest';
import { PatternMatcher } from '../../core/analyzer/PatternMatcher.js';
import { parse } from 'graphql';

describe('PatternMatcher', () => {
  let matcher: PatternMatcher;

  beforeEach(() => {
    matcher = new PatternMatcher();
  });

  describe('analyzeQueryPattern', () => {
    it('should identify subscription patterns', () => {
      const query = parse(`
        subscription OnUserUpdate {
          userUpdated {
            id
            name
            status
          }
        }
      `);

      const pattern = matcher.analyzeQueryPattern(query);

      expect(pattern).toEqual({
        type: 'SUBSCRIPTION',
        eventType: 'userUpdated',
      });
    });

    it('should identify paginated query patterns', () => {
      const query = parse(`
        query GetUsers($first: Int, $after: String) {
          usersConnection(first: $first, after: $after) {
            edges {
              node {
                id
                name
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `);

      const pattern = matcher.analyzeQueryPattern(query);

      expect(pattern).toEqual({
        type: 'PAGINATED_QUERY',
        connectionType: 'usersConnection',
      });
    });

    it('should identify nested query patterns', () => {
      const query = parse(`
        query GetUser($id: ID!) {
          user(id: $id) {
            id
            name
            posts {
              title
              comments {
                text
                author {
                  name
                }
              }
            }
          }
        }
      `);

      const pattern = matcher.analyzeQueryPattern(query);

      expect(pattern).toMatchObject({
        type: 'NESTED_QUERY',
        depth: 4, // user -> posts -> comments -> author
        fragments: [],
      });
    });

    it('should extract fragments in nested queries', () => {
      const query = parse(`
        query GetUser {
          user {
            id
            ...UserDetails
            posts {
              ...PostFields
            }
          }
        }
      `);

      const pattern = matcher.analyzeQueryPattern(query);

      expect(pattern).toEqual({
        type: 'NESTED_QUERY',
        depth: 2,
        fragments: ['UserDetails', 'PostFields'],
      });
    });

    it('should handle simple queries', () => {
      const query = parse(`
        query GetStatus {
          status
        }
      `);

      const pattern = matcher.analyzeQueryPattern(query);

      expect(pattern).toEqual({
        type: 'NESTED_QUERY',
        depth: 1,
        fragments: [],
      });
    });

    it('should prioritize pagination pattern over nested pattern', () => {
      const query = parse(`
        query GetPosts {
          postsConnection {
            edges {
              node {
                id
                author {
                  name
                }
              }
            }
          }
        }
      `);

      const pattern = matcher.analyzeQueryPattern(query);

      expect(pattern).toEqual({
        type: 'PAGINATED_QUERY',
        connectionType: 'postsConnection',
      });
    });

    it('should handle multiple connection fields', () => {
      const query = parse(`
        query GetData {
          usersConnection {
            edges {
              node {
                id
              }
            }
          }
          postsConnection {
            edges {
              node {
                title
              }
            }
          }
        }
      `);

      const pattern = matcher.analyzeQueryPattern(query);

      // Should identify the first connection found
      expect(pattern).toEqual({
        type: 'PAGINATED_QUERY',
        connectionType: 'usersConnection',
      });
    });

    it('should handle empty selection sets', () => {
      const query = parse(`
        query Empty {
          __typename
        }
      `);

      const pattern = matcher.analyzeQueryPattern(query);

      expect(pattern).toEqual({
        type: 'NESTED_QUERY',
        depth: 1,
        fragments: [],
      });
    });
  });

  describe('detectMigrationPattern', () => {
    it('should detect edge to node migration', () => {
      const oldQuery = `
        query GetUsers {
          users {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      `;

      const newQuery = `
        query GetUsers {
          users {
            nodes {
              id
              name
            }
          }
        }
      `;

      const pattern = matcher.detectMigrationPattern(oldQuery, newQuery);

      expect(pattern).toEqual({
        type: 'EDGE_TO_NODE_MIGRATION',
      });
    });

    it('should detect pagination removal', () => {
      const oldQuery = `
        query GetUsers {
          users {
            edges {
              node {
                id
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;

      const newQuery = `
        query GetUsers {
          users {
            edges {
              node {
                id
              }
            }
          }
        }
      `;

      const pattern = matcher.detectMigrationPattern(oldQuery, newQuery);

      expect(pattern).toEqual({
        type: 'PAGINATION_REMOVAL',
      });
    });

    it('should detect field selection changes', () => {
      const oldQuery = `
        query GetUser {
          user {
            id
            name
          }
        }
      `;

      const newQuery = `
        query GetUser {
          user {
            id
            name
            email
            avatar
          }
        }
      `;

      const pattern = matcher.detectMigrationPattern(oldQuery, newQuery);

      expect(pattern).toEqual({
        type: 'FIELD_SELECTION_CHANGE',
      });
    });

    it('should return unknown pattern for identical queries', () => {
      const query = `
        query GetUser {
          user {
            id
            name
          }
        }
      `;

      const pattern = matcher.detectMigrationPattern(query, query);

      expect(pattern).toEqual({
        type: 'UNKNOWN_PATTERN',
      });
    });

    it('should prioritize edge to node migration over field changes', () => {
      const oldQuery = `
        query GetUsers {
          users {
            edges {
              node {
                id
              }
            }
          }
        }
      `;

      const newQuery = `
        query GetUsers {
          users {
            nodes {
              id
              name
            }
          }
        }
      `;

      const pattern = matcher.detectMigrationPattern(oldQuery, newQuery);

      // Should detect edge to node migration even though fields also changed
      expect(pattern).toEqual({
        type: 'EDGE_TO_NODE_MIGRATION',
      });
    });
  });

  describe('edge cases', () => {
    it('should handle queries without operation definitions', () => {
      const query = parse(`
        {
          user {
            id
          }
        }
      `);

      const pattern = matcher.analyzeQueryPattern(query);

      expect(pattern).toEqual({
        type: 'NESTED_QUERY',
        depth: 1,
        fragments: [],
      });
    });

    it('should handle mutations', () => {
      const query = parse(`
        mutation CreateUser($input: UserInput!) {
          createUser(input: $input) {
            id
            name
          }
        }
      `);

      const pattern = matcher.analyzeQueryPattern(query);

      expect(pattern).toEqual({
        type: 'NESTED_QUERY',
        depth: 1,
        fragments: [],
      });
    });

    it('should handle inline fragments', () => {
      const query = parse(`
        query GetNode($id: ID!) {
          node(id: $id) {
            id
            ... on User {
              name
              email
            }
            ... on Post {
              title
              content
            }
          }
        }
      `);

      const pattern = matcher.analyzeQueryPattern(query);

      expect(pattern).toEqual({
        type: 'NESTED_QUERY',
        depth: 1, // Inline fragments don't increase depth
        fragments: [],
      });
    });

    it('should handle complex field extraction in migration detection', () => {
      const oldQuery = `
        query Complex {
          user {
            profile {
              settings {
                notifications {
                  email
                }
              }
            }
          }
        }
      `;

      const newQuery = `
        query Complex {
          user {
            profile {
              preferences {
                alerts {
                  email
                  push
                }
              }
            }
          }
        }
      `;

      const pattern = matcher.detectMigrationPattern(oldQuery, newQuery);

      expect(pattern).toEqual({
        type: 'FIELD_SELECTION_CHANGE',
      });
    });

    it('should handle subscription with unknown event type', () => {
      const query = parse(`
        subscription {
          _
        }
      `);

      const pattern = matcher.analyzeQueryPattern(query);

      expect(pattern).toEqual({
        type: 'SUBSCRIPTION',
        eventType: '_',
      });
    });

    it('should handle connection pattern with non-standard naming', () => {
      const query = parse(`
        query GetItems {
          itemConnection {
            items {
              id
            }
          }
        }
      `);

      const pattern = matcher.analyzeQueryPattern(query);

      expect(pattern).toEqual({
        type: 'PAGINATED_QUERY',
        connectionType: 'itemConnection',
      });
    });
  });
});
