import { describe, it, expect, beforeEach } from 'vitest';
import { GraphQLSchema, buildSchema } from 'graphql';
import { TypeSafeTransformer } from '../core/transformer/TypeSafeTransformer';
import { SchemaAnalyzer } from '../core/analyzer/SchemaAnalyzer';

interface TestContext {
  schema: GraphQLSchema;
  transformer: TypeSafeTransformer;
  analyzer: SchemaAnalyzer;
}

describe('GraphQL Migration Tool', () => {
  let ctx: TestContext;

  beforeEach(() => {
    const schemaSDL = `
      type Query {
        user(id: ID!): User
        allVentures: VentureConnection @deprecated(reason: "Use \`ventures\` instead")
        ventures: [Venture!]!
      }

      type User {
        id: ID!
        fullName: String @deprecated(reason: "Use \`displayName\` instead")
        displayName: String
        email: String!
        isActive: Boolean @deprecated(reason: "Use \`status\` instead")
        status: UserStatus
      }

      enum UserStatus {
        ACTIVE
        INACTIVE
        SUSPENDED
      }

      type Venture {
        id: ID!
        name: String!
        owner: User
      }

      type VentureConnection {
        edges: [VentureEdge!]! @deprecated(reason: "Use \`nodes\` instead")
        nodes: [Venture!]!
        pageInfo: PageInfo!
      }

      type VentureEdge {
        node: Venture!
        cursor: String!
      }

      type PageInfo {
        hasNextPage: Boolean!
        hasPreviousPage: Boolean!
        startCursor: String
        endCursor: String
      }
    `;

    const schema = buildSchema(schemaSDL);
    const analyzer = new SchemaAnalyzer(schema);
    const rules = analyzer.generateMigrationRules();
    const transformer = new TypeSafeTransformer(schema, rules);

    ctx = { schema, transformer, analyzer };
  });

  it('should detect deprecated fields', () => {
    const deprecatedFields = ctx.analyzer.findDeprecatedFields();
    
    expect(deprecatedFields.size).toBeGreaterThan(0);
    expect(deprecatedFields.has('Query')).toBe(true);
    expect(deprecatedFields.has('User')).toBe(true);
    
    const queryDeprecations = deprecatedFields.get('Query');
    expect(queryDeprecations).toBeDefined();
    expect(queryDeprecations!.length).toBe(1);
    expect(queryDeprecations![0].fieldName).toBe('allVentures');
    expect(queryDeprecations![0].suggestedReplacement).toBe('ventures');
  });

  it('should generate migration rules from deprecations', () => {
    const rules = ctx.analyzer.generateMigrationRules();
    
    expect(rules.length).toBeGreaterThan(0);
    
    const allVenturesRule = rules.find(r => 
      r.from.field === 'allVentures' && r.to.field === 'ventures'
    );
    expect(allVenturesRule).toBeDefined();
    
    const fullNameRule = rules.find(r => 
      r.from.field === 'fullName' && r.to.field === 'displayName'
    );
    expect(fullNameRule).toBeDefined();
  });

  it('should handle deprecated field transformation', () => {
    const input = `
      query GetUser {
        user(id: "123") {
          id
          fullName
          email
          isActive
        }
      }
    `;

    const result = ctx.transformer.transform(input, {
      file: 'test.ts',
      schema: ctx.schema,
      options: { 
        preserveAliases: true,
        addTypeAnnotations: false,
        generateTests: false
      }
    });

    // Type-safe assertions
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.changes).toHaveLength(2); // fullName and isActive
      
      const fullNameChange = result.value.changes.find(c => 
        c.before.includes('fullName')
      );
      expect(fullNameChange).toBeDefined();
      expect(fullNameChange!.type).toBe('FIELD_RENAME');
      expect(fullNameChange!.after).toContain('displayName');
    }
  });

  it('should handle connection to array transformation', () => {
    const input = `
      query GetVentures {
        allVentures {
          edges {
            node {
              id
              name
            }
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    `;

    const result = ctx.transformer.transform(input, {
      file: 'test.ts',
      schema: ctx.schema,
      options: {
        preserveAliases: true,
        addTypeAnnotations: false,
        generateTests: false
      }
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // Should transform allVentures to ventures
      expect(result.value.transformedCode).toContain('ventures');
      expect(result.value.transformedCode).not.toContain('allVentures');
      
      // Should transform edges to nodes
      expect(result.value.transformedCode).toContain('nodes');
      expect(result.value.transformedCode).not.toContain('edges');
    }
  });

  it('should preserve non-deprecated fields', () => {
    const input = `
      query GetUser {
        user(id: "123") {
          id
          email
          displayName
        }
      }
    `;

    const result = ctx.transformer.transform(input, {
      file: 'test.ts',
      schema: ctx.schema,
      options: {
        preserveAliases: true,
        addTypeAnnotations: false,
        generateTests: false
      }
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // Should not change non-deprecated fields
      expect(result.value.changes).toHaveLength(0);
      expect(result.value.transformedCode).toBe(result.value.originalCode);
    }
  });

  it('should handle nested deprecated fields', () => {
    const input = `
      query GetVentureWithOwner {
        ventures {
          id
          name
          owner {
            id
            fullName
            isActive
          }
        }
      }
    `;

    const result = ctx.transformer.transform(input, {
      file: 'test.ts',
      schema: ctx.schema,
      options: {
        preserveAliases: true,
        addTypeAnnotations: false,
        generateTests: false
      }
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // Should transform nested deprecated fields
      expect(result.value.transformedCode).toContain('displayName');
      expect(result.value.transformedCode).not.toContain('fullName');
      expect(result.value.transformedCode).toContain('status');
      expect(result.value.transformedCode).not.toContain('isActive');
    }
  });
});