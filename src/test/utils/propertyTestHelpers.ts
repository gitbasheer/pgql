import fc from 'fast-check';
import { ExtractedQuery, OperationType } from '@core/extraction/types';
import { TransformResult } from '@core/transformer/types';

// GraphQL query generators
export const arbitraryGraphQLQuery = (): fc.Arbitrary<string> => 
  fc.record({
    operationType: fc.constantFrom('query', 'mutation', 'subscription'),
    name: fc.option(fc.stringMatching(/^[A-Z][a-zA-Z0-9]*/)),
    fields: fc.array(fc.stringMatching(/^[a-z][a-zA-Z0-9]*/), { minLength: 1, maxLength: 10 }),
    arguments: fc.option(fc.dictionary(
      fc.stringMatching(/^[a-z][a-zA-Z0-9]*/),
      fc.oneof(fc.string(), fc.integer(), fc.boolean())
    ))
  }).map(({ operationType, name, fields, arguments: args }) => {
    const nameStr = name ? ` ${name}` : '';
    const argsStr = args && Object.keys(args).length > 0 
      ? `(${Object.entries(args).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')})`
      : '';
    const fieldsStr = fields.join('\n    ');
    return `${operationType}${nameStr}${argsStr} {
    ${fieldsStr}
  }`;
  });

// ExtractedQuery generators
export const arbitraryExtractedQuery = (): fc.Arbitrary<ExtractedQuery> =>
  fc.record({
    id: fc.uuid(),
    name: fc.option(fc.stringMatching(/^[A-Z][a-zA-Z0-9]*/)),
    content: arbitraryGraphQLQuery(),
    type: fc.constantFrom<OperationType>('query', 'mutation', 'subscription', 'fragment'),
    filePath: fc.stringMatching(/^\/[a-zA-Z0-9\/]+\.ts$/),
    ast: fc.constant(null),
    location: fc.record({
      line: fc.integer({ min: 1, max: 1000 }),
      column: fc.integer({ min: 1, max: 120 }),
      file: fc.stringMatching(/^\/[a-zA-Z0-9\/]+\.ts$/)
    })
  });

// TransformResult generators
export const arbitraryTransformResult = (): fc.Arbitrary<TransformResult> =>
  fc.record({
    queryId: fc.uuid(),
    originalQuery: arbitraryGraphQLQuery(),
    transformedQuery: arbitraryGraphQLQuery(),
    changes: fc.array(
      fc.record({
        type: fc.constantFrom('field', 'argument', 'type', 'directive', 'fragment'),
        path: fc.stringMatching(/^[A-Za-z0-9\.]+$/),
        oldValue: fc.string(),
        newValue: fc.string(),
        reason: fc.string()
      }),
      { minLength: 1, maxLength: 5 }
    ),
    confidence: fc.integer({ min: 0, max: 100 }),
    metadata: fc.option(fc.record({
      transformationType: fc.string(),
      appliedRules: fc.array(fc.string())
    }))
  });

// Property test helpers
export const propertyTest = {
  // Test that a function preserves certain properties
  preservesProperty: <T, U>(
    fn: (input: T) => U,
    property: (input: T, output: U) => boolean,
    arbitrary: fc.Arbitrary<T>,
    numRuns = 100
  ) => {
    fc.assert(
      fc.property(arbitrary, (input) => {
        const output = fn(input);
        return property(input, output);
      }),
      { numRuns }
    );
  },

  // Test that a function is idempotent
  isIdempotent: <T>(
    fn: (input: T) => T,
    arbitrary: fc.Arbitrary<T>,
    equals: (a: T, b: T) => boolean = (a, b) => a === b
  ) => {
    fc.assert(
      fc.property(arbitrary, (input) => {
        const once = fn(input);
        const twice = fn(once);
        return equals(once, twice);
      })
    );
  },

  // Test that two functions are equivalent
  areEquivalent: <T, U>(
    fn1: (input: T) => U,
    fn2: (input: T) => U,
    arbitrary: fc.Arbitrary<T>,
    equals: (a: U, b: U) => boolean = (a, b) => a === b
  ) => {
    fc.assert(
      fc.property(arbitrary, (input) => {
        const result1 = fn1(input);
        const result2 = fn2(input);
        return equals(result1, result2);
      })
    );
  }
};
