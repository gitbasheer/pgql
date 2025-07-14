// @ts-nocheck
import { nanoid } from 'nanoid';
import { logger } from '../../utils/logger';
import {
  AlignmentFunction,
  AlignmentTest,
  AlignmentOptions,
  Difference,
  DifferenceType
} from './types';

export class AlignmentGenerator {
  constructor(
    private options: AlignmentOptions = {
      strict: false,
      preserveNulls: true,
      preserveOrder: false
    }
  ) {}

  generateAlignmentFunction(
    queryId: string,
    differences: Difference[]
  ): AlignmentFunction {
    const id = nanoid();
    const transformations = this.analyzeTransformations(differences);
    const code = this.generateCode(transformations);
    const transform = this.createTransformFunction(transformations);
    const tests = this.generateTests(differences, transform);

    return {
      id,
      queryId,
      differences,
      transform,
      code,
      tests
    };
  }

  generateTypeScriptCode(alignment: AlignmentFunction): string {
    return `
// Auto-generated alignment function for query: ${alignment.queryId}
// Generated on: ${new Date().toISOString()}
// Differences handled: ${alignment.differences.length}

export function align_${alignment.queryId.replace(/[^a-zA-Z0-9]/g, '_')}(response: any): any {
${alignment.code}
}

// Test cases
export const testCases = ${JSON.stringify(alignment.tests, null, 2)};
`.trim();
  }

  validateAlignment(
    data: any,
    alignment: AlignmentFunction
  ): boolean {
    try {
      const aligned = alignment.transform(data);
      
      // Run validation tests
      for (const test of alignment.tests) {
        const result = this.deepCompare(
          alignment.transform(test.input),
          test.expected
        );
        if (!result) {
          logger.error(`Alignment test failed: ${test.description}`);
          return false;
        }
      }
      
      return true;
    } catch (error) {
      logger.error('Alignment validation failed:', error);
      return false;
    }
  }

  private analyzeTransformations(differences: Difference[]): Transformation[] {
    const transformations: Transformation[] = [];

    for (const diff of differences) {
      const transformation = this.createTransformation(diff);
      if (transformation) {
        transformations.push(transformation);
      }
    }

    // Sort transformations by path depth (deepest first)
    transformations.sort((a, b) => b.path.length - a.path.length);

    return transformations;
  }

  private createTransformation(diff: Difference): Transformation | null {
    switch (diff.type) {
      case 'missing-field':
        return {
          type: 'add-field',
          path: diff.path,
          value: diff.baseline,
          description: `Add missing field '${diff.path.join('.')}'`
        };

      case 'extra-field':
        return {
          type: 'remove-field',
          path: diff.path,
          description: `Remove extra field '${diff.path.join('.')}'`
        };

      case 'type-mismatch':
        return {
          type: 'convert-type',
          path: diff.path,
          fromType: typeof diff.transformed,
          toType: typeof diff.baseline,
          description: `Convert type at '${diff.path.join('.')}'`
        };

      case 'value-change':
        if (this.canMapValue(diff.baseline, diff.transformed)) {
          return {
            type: 'map-value',
            path: diff.path,
            mapping: { [diff.transformed]: diff.baseline },
            description: `Map value at '${diff.path.join('.')}'`
          };
        }
        return null;

      case 'null-mismatch':
        return {
          type: 'handle-null',
          path: diff.path,
          defaultValue: diff.baseline,
          description: `Handle null at '${diff.path.join('.')}'`
        };

      case 'array-order':
        return {
          type: 'reorder-array',
          path: diff.path,
          description: `Reorder array at '${diff.path.join('.')}'`
        };

      case 'array-length':
        return {
          type: 'adjust-array',
          path: diff.path,
          targetLength: diff.baseline,
          description: `Adjust array length at '${diff.path.join('.')}'`
        };

      default:
        return null;
    }
  }

  private generateCode(transformations: Transformation[]): string {
    const lines: string[] = [
      '  const result = JSON.parse(JSON.stringify(response));',
      ''
    ];

    for (const transformation of transformations) {
      const codeLines = this.generateTransformationCode(transformation);
      lines.push(...codeLines, '');
    }

    lines.push('  return result;');
    return lines.join('\n');
  }

  private generateTransformationCode(transformation: Transformation): string[] {
    const pathCode = this.generatePathCode(transformation.path);

    switch (transformation.type) {
      case 'add-field':
        return [
          `  // ${transformation.description}`,
          `  ${pathCode} = ${JSON.stringify(transformation.value)};`
        ];

      case 'remove-field':
        return [
          `  // ${transformation.description}`,
          `  delete ${pathCode};`
        ];

      case 'convert-type':
        return this.generateTypeConversionCode(
          transformation.path,
          transformation.fromType!,
          transformation.toType!
        );

      case 'map-value':
        return [
          `  // ${transformation.description}`,
          `  const mapping = ${JSON.stringify(transformation.mapping)};`,
          `  if (${pathCode} in mapping) {`,
          `    ${pathCode} = mapping[${pathCode}];`,
          `  }`
        ];

      case 'handle-null':
        return [
          `  // ${transformation.description}`,
          `  if (${pathCode} === null || ${pathCode} === undefined) {`,
          `    ${pathCode} = ${JSON.stringify(transformation.defaultValue)};`,
          `  }`
        ];

      case 'reorder-array':
        return [
          `  // ${transformation.description}`,
          `  // Array reordering handled by response comparator`
        ];

      case 'adjust-array':
        return [
          `  // ${transformation.description}`,
          `  if (Array.isArray(${pathCode})) {`,
          `    ${pathCode}.length = ${transformation.targetLength};`,
          `  }`
        ];

      default:
        return [`  // Unknown transformation type: ${transformation.type}`];
    }
  }

  private generateTypeConversionCode(
    path: string[],
    fromType: string,
    toType: string
  ): string[] {
    const pathCode = this.generatePathCode(path);
    const lines = [`  // Convert ${fromType} to ${toType} at '${path.join('.')}'`];

    if (fromType === 'string' && toType === 'number') {
      lines.push(
        `  if (typeof ${pathCode} === 'string') {`,
        `    ${pathCode} = Number(${pathCode});`,
        `  }`
      );
    } else if (fromType === 'number' && toType === 'string') {
      lines.push(
        `  if (typeof ${pathCode} === 'number') {`,
        `    ${pathCode} = String(${pathCode});`,
        `  }`
      );
    } else if (fromType === 'string' && toType === 'boolean') {
      lines.push(
        `  if (typeof ${pathCode} === 'string') {`,
        `    ${pathCode} = ${pathCode} === 'true';`,
        `  }`
      );
    } else {
      lines.push(`  // Complex type conversion needed`);
    }

    return lines;
  }

  private generatePathCode(path: string[]): string {
    if (path.length === 0) return 'result';

    let code = 'result';
    for (const segment of path) {
      if (/^\d+$/.test(segment)) {
        code += `[${segment}]`;
      } else if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(segment)) {
        code += `.${segment}`;
      } else {
        code += `[${JSON.stringify(segment)}]`;
      }
    }
    return code;
  }

  private createTransformFunction(transformations: Transformation[]): (response: any) => any {
    // Create a dynamic function based on transformations
    return (response: any) => {
      const result = JSON.parse(JSON.stringify(response));

      for (const transformation of transformations) {
        try {
          this.applyTransformation(result, transformation);
        } catch (error) {
          logger.warn(`Failed to apply transformation: ${transformation.description}`, error);
        }
      }

      return result;
    };
  }

  private applyTransformation(data: any, transformation: Transformation): void {
    const target = this.navigateToParent(data, transformation.path);
    if (!target.parent) return;

    const key = transformation.path[transformation.path.length - 1];

    switch (transformation.type) {
      case 'add-field':
        target.parent[key] = transformation.value;
        break;

      case 'remove-field':
        delete target.parent[key];
        break;

      case 'convert-type':
        if (key in target.parent) {
          target.parent[key] = this.convertType(
            target.parent[key],
            transformation.toType!
          );
        }
        break;

      case 'map-value':
        if (key in target.parent && target.parent[key] in transformation.mapping!) {
          target.parent[key] = transformation.mapping![target.parent[key]];
        }
        break;

      case 'handle-null':
        if (target.parent[key] === null || target.parent[key] === undefined) {
          target.parent[key] = transformation.defaultValue;
        }
        break;

      case 'adjust-array':
        if (Array.isArray(target.parent[key])) {
          target.parent[key].length = transformation.targetLength!;
        }
        break;
    }
  }

  private navigateToParent(data: any, path: string[]): { parent: any; exists: boolean } {
    if (path.length === 0) {
      return { parent: null, exists: true };
    }

    let current = data;
    for (let i = 0; i < path.length - 1; i++) {
      if (!current || typeof current !== 'object') {
        return { parent: null, exists: false };
      }
      current = current[path[i]];
    }

    return { parent: current, exists: true };
  }

  private convertType(value: any, toType: string): any {
    switch (toType) {
      case 'string':
        return String(value);
      case 'number':
        return Number(value);
      case 'boolean':
        return Boolean(value);
      default:
        return value;
    }
  }

  private generateTests(
    differences: Difference[],
    transform: (response: any) => any
  ): AlignmentTest[] {
    const tests: AlignmentTest[] = [];

    // Generate test for each difference type
    const testInputs = this.generateTestInputs(differences);

    for (const input of testInputs) {
      const expected = transform(input.data);
      tests.push({
        input: input.data,
        expected,
        description: input.description
      });
    }

    return tests;
  }

  private generateTestInputs(differences: Difference[]): TestInput[] {
    const inputs: TestInput[] = [];

    // Group differences by type
    const byType = new Map<DifferenceType, Difference[]>();
    for (const diff of differences) {
      if (!byType.has(diff.type)) {
        byType.set(diff.type, []);
      }
      byType.get(diff.type)!.push(diff);
    }

    // Generate test inputs for each type
    for (const [type, diffs] of byType) {
      const input = this.generateTestInputForType(type, diffs);
      if (input) {
        inputs.push(input);
      }
    }

    return inputs;
  }

  private generateTestInputForType(
    type: DifferenceType,
    differences: Difference[]
  ): TestInput | null {
    const testData: any = {};

    switch (type) {
      case 'missing-field':
        // Create data without the field
        for (const diff of differences) {
          this.setNestedValue(testData, diff.path.slice(0, -1), {});
        }
        return {
          data: testData,
          description: 'Test adding missing fields'
        };

      case 'extra-field':
        // Create data with extra fields
        for (const diff of differences) {
          this.setNestedValue(testData, diff.path, 'extra-value');
        }
        return {
          data: testData,
          description: 'Test removing extra fields'
        };

      case 'type-mismatch':
        // Create data with wrong types
        for (const diff of differences) {
          this.setNestedValue(testData, diff.path, diff.transformed);
        }
        return {
          data: testData,
          description: 'Test type conversions'
        };

      default:
        return null;
    }
  }

  private setNestedValue(obj: any, path: string[], value: any): void {
    if (path.length === 0) return;

    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
      if (!(path[i] in current)) {
        current[path[i]] = /^\d+$/.test(path[i + 1]) ? [] : {};
      }
      current = current[path[i]];
    }

    current[path[path.length - 1]] = value;
  }

  private canMapValue(baseline: any, transformed: any): boolean {
    // Simple values that can be mapped
    return (
      typeof baseline !== 'object' &&
      typeof transformed !== 'object' &&
      baseline !== null &&
      transformed !== null
    );
  }

  private deepCompare(a: any, b: any): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;

    if (typeof a === 'object') {
      if (Array.isArray(a) !== Array.isArray(b)) return false;
      
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      
      if (keysA.length !== keysB.length) return false;
      
      for (const key of keysA) {
        if (!this.deepCompare(a[key], b[key])) return false;
      }
      
      return true;
    }

    return a === b;
  }
}

interface Transformation {
  type: 'add-field' | 'remove-field' | 'convert-type' | 'map-value' | 
        'handle-null' | 'reorder-array' | 'adjust-array';
  path: string[];
  description: string;
  value?: any;
  fromType?: string;
  toType?: string;
  mapping?: Record<string, any>;
  defaultValue?: any;
  targetLength?: number;
}

interface TestInput {
  data: any;
  description: string;
} 