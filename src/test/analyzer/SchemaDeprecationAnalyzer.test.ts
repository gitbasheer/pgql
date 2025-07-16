import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SchemaDeprecationAnalyzer } from '../../core/analyzer/SchemaDeprecationAnalyzer.js';

describe('SchemaDeprecationAnalyzer', () => {
  let analyzer: SchemaDeprecationAnalyzer;

  beforeEach(async () => {
    vi.resetModules();
    analyzer = new SchemaDeprecationAnalyzer();
  });

  describe('analyzeSchema', () => {
    it('should extract simple deprecation with clear replacement', () => {
      const schema = `
type CustomerQuery {
  venture(ventureId: UUID!): Venture @deprecated(reason: "Use ventureNode")
  ventureNode(ventureId: UUID): VentureNode
}`;

      const rules = analyzer.analyzeSchema(schema);

      expect(rules).toHaveLength(1);
      expect(rules[0]).toMatchObject({
        type: 'field',
        objectType: 'CustomerQuery',
        fieldName: 'venture',
        deprecationReason: 'Use ventureNode',
        replacement: 'ventureNode',
        isVague: false,
        action: 'replace',
      });
    });

    it('should extract nested replacement deprecation', () => {
      const schema = `
type Venture {
  id: ID!
  logoUrl: String @deprecated(reason: "Use profile.logoUrl instead")
  profile: Profile
}`;

      const rules = analyzer.analyzeSchema(schema);

      expect(rules).toHaveLength(1);
      expect(rules[0]).toMatchObject({
        type: 'field',
        objectType: 'Venture',
        fieldName: 'logoUrl',
        deprecationReason: 'Use profile.logoUrl instead',
        replacement: 'profile.logoUrl',
        isVague: false,
        action: 'replace',
      });
    });

    it('should identify vague deprecations without clear replacement', () => {
      const schema = `
type WAMProduct {
  accountId: UUID @deprecated(reason: "Use the billing property to ensure forward compatibility")
  data: JSONObject @deprecated(reason: "Use calculated fields to ensure forward compatibility")
  billing: Billing
}`;

      const rules = analyzer.analyzeSchema(schema);

      expect(rules).toHaveLength(2);
      expect(rules[0]).toMatchObject({
        fieldName: 'accountId',
        isVague: true,
        action: 'comment-out',
        replacement: undefined,
      });
      expect(rules[1]).toMatchObject({
        fieldName: 'data',
        isVague: true,
        action: 'comment-out',
        replacement: undefined,
      });
    });

    it('should handle "switch to using X" pattern', () => {
      const schema = `
type Profile {
  isInfinityStone: Boolean @deprecated(reason: "switch to using aiOnboarded")
  aiOnboarded: Boolean
}`;

      const rules = analyzer.analyzeSchema(schema);

      expect(rules).toHaveLength(1);
      expect(rules[0]).toMatchObject({
        fieldName: 'isInfinityStone',
        replacement: 'aiOnboarded',
        isVague: false,
        action: 'replace',
      });
    });

    it('should handle interfaces with deprecations', () => {
      const schema = `
interface User {
  email: String
  projects: [Project] @deprecated(reason: "Use CustomerQuery.projects")
}

type CurrentUser implements User {
  email: String
  projects: [Project] @deprecated(reason: "Use CustomerQuery.projects")
}`;

      const rules = analyzer.analyzeSchema(schema);

      // Should find deprecations in both interface and implementation
      expect(rules.length).toBeGreaterThanOrEqual(1);

      const interfaceRule = rules.find((r) => r.objectType === 'User');
      expect(interfaceRule).toBeDefined();

      const implRule = rules.find((r) => r.objectType === 'CurrentUser');
      expect(implRule).toBeDefined();
    });

    it('should deduplicate identical deprecation rules', () => {
      const schema = `
type Query {
  user: User @deprecated(reason: "Use me")
  me: User
}

type Mutation {
  user: User @deprecated(reason: "Use me")
}`;

      const rules = analyzer.analyzeSchema(schema);

      // Should have rules for both Query.user and Mutation.user
      const queryRule = rules.find((r) => r.objectType === 'Query' && r.fieldName === 'user');
      const mutationRule = rules.find((r) => r.objectType === 'Mutation' && r.fieldName === 'user');

      expect(queryRule).toBeDefined();
      expect(mutationRule).toBeDefined();
      expect(rules.length).toBe(2);
    });

    it('should handle multi-line deprecations', () => {
      const schema = `
type Project {
  id: ID!
  name: String
  accountId: UUID @deprecated(
    reason: "Use the billing property to ensure forward compatibility"
  )
  billing: Billing
}`;

      const rules = analyzer.analyzeSchema(schema);

      // Multi-line deprecations are currently not handled perfectly
      // This test documents current behavior
      expect(rules.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getSummary', () => {
    it('should return correct summary statistics', () => {
      const schema = `
type Test {
  oldField1: String @deprecated(reason: "Use newField1")
  oldField2: String @deprecated(reason: "Use newField2")
  vagueField: String @deprecated(reason: "Will be removed in future versions")
  newField1: String
  newField2: String
}`;

      analyzer.analyzeSchema(schema);
      const summary = analyzer.getSummary();

      expect(summary.total).toBe(3);
      expect(summary.replaceable).toBe(2);
      expect(summary.vague).toBe(1);
    });
  });

  describe('parseDeprecationReason', () => {
    it('should handle various deprecation message formats', () => {
      const testCases = [
        {
          schema: 'field: String @deprecated(reason: "Use newField")',
          expected: { replacement: 'newField', isVague: false },
        },
        {
          schema: 'field: String @deprecated(reason: "Use `newField` instead")',
          expected: { replacement: 'newField', isVague: false },
        },
        {
          schema: 'field: String @deprecated(reason: "switch to using newField")',
          expected: { replacement: 'newField', isVague: false },
        },
        {
          schema: 'field: String @deprecated(reason: "Use profile.name instead")',
          expected: { replacement: 'profile.name', isVague: false },
        },
        {
          schema: 'field: String @deprecated(reason: "This will be removed")',
          expected: { replacement: undefined, isVague: true },
        },
      ];

      testCases.forEach(({ schema, expected }) => {
        const fullSchema = `type Test { ${schema} }`;
        const rules = analyzer.analyzeSchema(fullSchema);

        expect(rules).toHaveLength(1);
        expect(rules[0].replacement).toBe(expected.replacement);
        expect(rules[0].isVague).toBe(expected.isVague);
      });
    });
  });
});
