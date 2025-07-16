import { faker } from '@faker-js/faker';
import type { ExtractedQuery } from '@core/extraction/types';

export class EnhancedTestDataFactory {
  // Generate realistic GraphQL queries
  static generateRealisticQuery(options?: {
    complexity?: 'simple' | 'medium' | 'complex';
    includeFragments?: boolean;
    includeVariables?: boolean;
  }): ExtractedQuery {
    const complexity = options?.complexity || 'simple';
    const queryName = faker.helpers.fromRegExp(/[A-Z][a-zA-Z]{4,12}Query/);

    let content = `query ${queryName}`;

    if (options?.includeVariables) {
      const varCount = complexity === 'simple' ? 1 : complexity === 'medium' ? 3 : 5;
      const variables = Array.from({ length: varCount }, () => ({
        name: faker.helpers.fromRegExp(/\$[a-z][a-zA-Z]{3,8}/),
        type: faker.helpers.arrayElement(['ID!', 'String', 'Int', 'Boolean', 'Input']),
      }));
      content += `(${variables.map((v) => `${v.name}: ${v.type}`).join(', ')})`;
    }

    content += ' {\n';

    // Add fields based on complexity
    const fieldCount = complexity === 'simple' ? 3 : complexity === 'medium' ? 7 : 15;
    for (let i = 0; i < fieldCount; i++) {
      const indent = '  ';
      const fieldName = faker.helpers.fromRegExp(/[a-z][a-zA-Z]{3,10}/);
      content += `${indent}${fieldName}`;

      if (Math.random() > 0.7 && complexity !== 'simple') {
        // Add nested fields
        content += ' {\n';
        const nestedCount = Math.floor(Math.random() * 3) + 1;
        for (let j = 0; j < nestedCount; j++) {
          const nestedField = faker.helpers.fromRegExp(/[a-z][a-zA-Z]{3,8}/);
          content += `${indent}  ${nestedField}\n`;
        }
        content += `${indent}}\n`;
      } else {
        content += '\n';
      }
    }

    content += '}';

    if (options?.includeFragments) {
      content += `\n${faker.helpers.fromRegExp(/fragment [A-Z][a-zA-Z]{4,10} on [A-Z][a-zA-Z]{3,8} \{[^}]+\}/)}\n`;
    }

    return {
      id: faker.string.uuid(),
      name: queryName,
      content,
      type: 'query',
      filePath: faker.system.filePath(),
      ast: null,
      location: {
        line: faker.number.int({ min: 1, max: 500 }),
        column: faker.number.int({ min: 1, max: 80 }),
        file: faker.system.filePath(),
      },
    };
  }

  // Generate datasets for performance testing
  static generateLargeDataset(size: number): ExtractedQuery[] {
    return Array.from({ length: size }, () =>
      this.generateRealisticQuery({
        complexity: faker.helpers.arrayElement(['simple', 'medium', 'complex']),
        includeFragments: Math.random() > 0.7,
        includeVariables: Math.random() > 0.5,
      }),
    );
  }
}
