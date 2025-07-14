import { GraphQLSchema, buildSchema } from 'graphql';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { loadSchema } from '@graphql-tools/load';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';

/**
 * Schema loader for tests with caching and multiple schema support
 */
export class TestSchemaLoader {
  private static schemaCache = new Map<string, GraphQLSchema>();
  private static defaultSchemaPath = join(process.cwd(), 'data', 'schema.graphql');

  /**
   * Load the production schema for testing
   */
  static async loadProductionSchema(): Promise<GraphQLSchema> {
    return this.loadSchema(this.defaultSchemaPath);
  }

  /**
   * Load a schema from file with caching
   */
  static async loadSchema(path: string): Promise<GraphQLSchema> {
    // Check cache first
    if (this.schemaCache.has(path)) {
      return this.schemaCache.get(path)!;
    }

    try {
      // Try using GraphQL tools loader (handles imports, etc.)
      const schema = await loadSchema(path, {
        loaders: [new GraphQLFileLoader()],
      });
      
      this.schemaCache.set(path, schema);
      return schema;
    } catch (error) {
      // Fallback to simple file read
      const schemaString = await readFile(path, 'utf-8');
      const schema = buildSchema(schemaString);
      
      this.schemaCache.set(path, schema);
      return schema;
    }
  }

  /**
   * Load a simplified test schema for basic tests
   */
  static loadSimpleSchema(): GraphQLSchema {
    const schemaString = `
      type Query {
        user(id: ID!): User
        users: [User!]!
        deprecatedField: String @deprecated(reason: "Use newField")
        newField: String
      }
      
      type User {
        id: ID!
        name: String!
        email: String!
        posts: [Post!]!
      }
      
      type Post {
        id: ID!
        title: String!
        content: String!
      }
    `;
    
    return buildSchema(schemaString);
  }

  /**
   * Load a schema with specific deprecation patterns for testing
   */
  static loadDeprecationTestSchema(): GraphQLSchema {
    const schemaString = `
      directive @deprecated(reason: String = "No longer supported") on FIELD_DEFINITION | ENUM_VALUE

      type Query {
        # Simple deprecation
        oldField: String @deprecated(reason: "Use newField instead")
        newField: String
        
        # Method rename
        getUser(id: ID!): User @deprecated(reason: "Use user instead")
        user(id: ID!): User
        
        # Argument change
        search(text: String!): [User] @deprecated(reason: "Use searchUsers with filter")
        searchUsers(filter: SearchFilter!): [User]
        
        # Type change
        items: [OldItem] @deprecated(reason: "Use products instead")
        products: [Product]
      }
      
      input SearchFilter {
        text: String!
        limit: Int
      }
      
      type User {
        id: ID!
        username: String @deprecated(reason: "Use name instead")
        name: String
        # Nested deprecation
        profile: OldProfile @deprecated(reason: "Use userProfile instead")
        userProfile: UserProfile
      }
      
      type OldItem {
        id: ID!
        title: String
      }
      
      type Product {
        id: ID!
        name: String
        price: Float
      }
      
      type OldProfile {
        bio: String
      }
      
      type UserProfile {
        biography: String
        avatar: String
      }
    `;
    
    return buildSchema(schemaString);
  }

  /**
   * Load schema with complex patterns (connections, interfaces, etc.)
   */
  static loadComplexTestSchema(): GraphQLSchema {
    const schemaString = `
      interface Node {
        id: ID!
      }
      
      interface Connection {
        edges: [Edge]
        pageInfo: PageInfo!
      }
      
      interface Edge {
        node: Node
        cursor: String
      }
      
      type PageInfo {
        hasNextPage: Boolean!
        hasPreviousPage: Boolean!
        startCursor: String
        endCursor: String
      }
      
      type Query {
        # Relay-style connection
        users(first: Int, after: String): UserConnection
        
        # Direct array (deprecated pattern)
        usersList: [User] @deprecated(reason: "Use users connection instead")
        
        # Node lookup
        node(id: ID!): Node
      }
      
      type User implements Node {
        id: ID!
        name: String
        posts(first: Int, after: String): PostConnection
      }
      
      type Post implements Node {
        id: ID!
        title: String
        content: String
        author: User
      }
      
      type UserConnection implements Connection {
        edges: [UserEdge]
        pageInfo: PageInfo!
        totalCount: Int
      }
      
      type UserEdge implements Edge {
        node: User
        cursor: String
      }
      
      type PostConnection implements Connection {
        edges: [PostEdge]
        pageInfo: PageInfo!
      }
      
      type PostEdge implements Edge {
        node: Post
        cursor: String
      }
    `;
    
    return buildSchema(schemaString);
  }

  /**
   * Clear the schema cache
   */
  static clearCache(): void {
    this.schemaCache.clear();
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): { size: number; paths: string[] } {
    return {
      size: this.schemaCache.size,
      paths: Array.from(this.schemaCache.keys()),
    };
  }
} 