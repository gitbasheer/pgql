import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaValidator } from '../../core/validator/SchemaValidator.js';
import { buildSchema } from 'graphql';

describe('SchemaValidator - Deprecation Field Checking', () => {
  let validator: SchemaValidator;

  const schemaSDL = `
    type Query {
      users: [User!]!
      oldUsers: [User!]! @deprecated(reason: "Use users instead")
      ventures: [Venture!]!
      ventureByDomain(domain: String!): Venture @deprecated(reason: "Use ventures with filter")
    }

    type User {
      id: ID!
      name: String!
      displayName: String!
      email: String! @deprecated(reason: "Use contactEmail")
      contactEmail: String!
      isActive: Boolean @deprecated(reason: "Check status field instead")
      status: UserStatus!
    }

    type Venture {
      id: ID!
      name: String!
      domain: String!
      oldDomain: String @deprecated(reason: "Use domain field")
    }

    enum UserStatus {
      ACTIVE
      INACTIVE
      SUSPENDED
    }
  `;

  const schemaWithDeprecations = buildSchema(schemaSDL);

  beforeEach(async () => {
    validator = new SchemaValidator();
    await validator.loadSchema(schemaSDL);
  });

  it('should detect deprecated fields in queries', async () => {
    const query = `
      query GetUserData {
        users {
          id
          name
          email
        }
        oldUsers {
          id
          displayName
        }
      }
    `;

    const result = await validator.validateQuery(query);

    expect(result.valid).toBe(true); // Query is syntactically valid
    expect(result.warnings).toHaveLength(2);

    // Check for email deprecation warning
    const emailWarning = result.warnings.find((w) => w.field === 'User.email');
    expect(emailWarning).toBeDefined();
    expect(emailWarning?.message).toContain('deprecated');
    expect(emailWarning?.message).toContain('Use contactEmail');
    expect(emailWarning?.suggestion).toContain("Use 'contactEmail' instead");
    expect(emailWarning?.type).toBe('deprecation');

    // Check for oldUsers deprecation warning
    const oldUsersWarning = result.warnings.find((w) => w.field === 'Query.oldUsers');
    expect(oldUsersWarning).toBeDefined();
    expect(oldUsersWarning?.message).toContain('deprecated');
    expect(oldUsersWarning?.message).toContain('Use users instead');
    expect(oldUsersWarning?.suggestion).toContain("Use 'users' instead");
  });

  it('should handle multiple deprecated fields in nested queries', async () => {
    const query = `
      query ComplexQuery {
        users {
          id
          email
          isActive
        }
        ventures {
          id
          oldDomain
        }
        ventureByDomain(domain: "example.com") {
          id
          name
        }
      }
    `;

    const result = await validator.validateQuery(query);

    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThanOrEqual(4);

    // Verify all deprecated fields are detected
    const warningFields = result.warnings.map((w) => w.field);
    expect(warningFields).toContain('User.email');
    expect(warningFields).toContain('User.isActive');
    expect(warningFields).toContain('Venture.oldDomain');
    expect(warningFields).toContain('Query.ventureByDomain');
  });

  it('should provide suggestions when available', async () => {
    const query = `
      query TestSuggestions {
        users {
          isActive
        }
      }
    `;

    const result = await validator.validateQuery(query);

    const isActiveWarning = result.warnings.find((w) => w.field === 'User.isActive');
    expect(isActiveWarning).toBeDefined();
    expect(isActiveWarning?.suggestion).toBe('Check the schema documentation for alternatives');
  });

  it('should not warn about non-deprecated fields', async () => {
    const query = `
      query SafeQuery {
        users {
          id
          name
          displayName
          contactEmail
          status
        }
        ventures {
          id
          name
          domain
        }
      }
    `;

    const result = await validator.validateQuery(query);

    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('should handle queries with fragments', async () => {
    const query = `
      fragment UserFields on User {
        id
        email
        isActive
      }

      query GetUsersWithFragment {
        users {
          ...UserFields
          name
        }
      }
    `;

    const result = await validator.validateQuery(query);

    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);

    // Deprecated fields in fragments should be detected
    const warningFields = result.warnings.map((w) => w.field);
    expect(warningFields).toContain('User.email');
    expect(warningFields).toContain('User.isActive');
  });

  it('should handle inline fragments', async () => {
    const query = `
      query GetUsersWithInlineFragment {
        users {
          id
          ... on User {
            email
            name
          }
        }
      }
    `;

    const result = await validator.validateQuery(query);

    expect(result.valid).toBe(true);

    // Email deprecation should be detected even in inline fragments
    const emailWarning = result.warnings.find((w) => w.field === 'User.email');
    expect(emailWarning).toBeDefined();
  });
});
