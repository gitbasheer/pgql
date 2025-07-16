// @ts-nocheck
import { ResponseComparator } from '../validator/ResponseComparator.js';
import { AlignmentGenerator } from '../validator/AlignmentGenerator.js';
import { logger } from '../../utils/logger.js';
import { CapturedResponse, ComparisonResult, AlignmentFunction } from '../validator/types.js';

export interface FieldMapping {
  from: string;
  to: string;
  transform?: (value: any) => any;
}

export interface ResponseMappingConfig {
  fieldMappings?: FieldMapping[];
  preserveTypename?: boolean;
  handlePagination?: boolean;
  commonMappings?: boolean;
}

export class ResponseMapper {
  private comparator: ResponseComparator;
  private alignmentGenerator: AlignmentGenerator;
  private fieldMappings: Map<string, FieldMapping>;

  private static readonly COMMON_FIELD_MAPPINGS: FieldMapping[] = [
    { from: 'displayName', to: 'name' },
    { from: 'logoUrl', to: 'profile.logoUrl' },
    {
      from: 'ventures',
      to: 'ventures',
      transform: (value) => {
        if (Array.isArray(value)) {
          return value.slice(0, 10);
        }
        return value;
      },
    },
  ];

  constructor(config: ResponseMappingConfig = {}) {
    this.comparator = new ResponseComparator({
      strict: false,
      ignorePatterns: [
        { path: '__typename', type: 'all' },
        { path: /.*\.pageInfo\.hasNextPage/, type: 'value' },
        { path: /.*\.pageInfo\.hasPreviousPage/, type: 'value' },
      ],
    });

    this.alignmentGenerator = new AlignmentGenerator({
      strict: false,
      preserveNulls: config.preserveTypename !== false,
      preserveOrder: false,
    });

    this.fieldMappings = new Map();

    if (config.commonMappings !== false) {
      ResponseMapper.COMMON_FIELD_MAPPINGS.forEach((mapping) => {
        this.fieldMappings.set(mapping.from, mapping);
      });
    }

    if (config.fieldMappings) {
      config.fieldMappings.forEach((mapping) => {
        this.fieldMappings.set(mapping.from, mapping);
      });
    }
  }

  /**
   * Map a response from one schema to another
   */
  async mapResponse(
    sourceResponse: CapturedResponse,
    targetSchema?: CapturedResponse,
  ): Promise<any> {
    try {
      const mappedData = this.applyFieldMappings(sourceResponse.response.data);

      if (targetSchema) {
        const comparison = this.comparator.compare(targetSchema, {
          ...sourceResponse,
          response: { ...sourceResponse.response, data: mappedData },
        });

        if (!comparison.identical && comparison.differences.length > 0) {
          const alignment = this.alignmentGenerator.generateAlignmentFunction(
            sourceResponse.queryId,
            comparison.differences,
          );

          return alignment.transform(mappedData);
        }
      }

      return mappedData;
    } catch (error) {
      logger.error('Response mapping failed:', error);
      throw error;
    }
  }

  /**
   * Generate mapping function for repeated use
   */
  generateMappingFunction(
    sourceResponse: CapturedResponse,
    targetResponse: CapturedResponse,
  ): AlignmentFunction {
    const comparison = this.comparator.compare(targetResponse, sourceResponse);

    const alignment = this.alignmentGenerator.generateAlignmentFunction(
      sourceResponse.queryId,
      comparison.differences,
    );

    const originalTransform = alignment.transform;
    alignment.transform = (response: any) => {
      const mapped = this.applyFieldMappings(response);
      return originalTransform(mapped);
    };

    return alignment;
  }

  /**
   * Apply configured field mappings
   */
  private applyFieldMappings(data: any): any {
    if (!data || typeof data !== 'object') return data;

    const result = JSON.parse(JSON.stringify(data));

    this.applyMappingsRecursively(result, '');

    return result;
  }

  private applyMappingsRecursively(obj: any, currentPath: string): void {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        this.applyMappingsRecursively(item, `${currentPath}[${index}]`);
      });
      return;
    }

    const entries = Object.entries(obj);

    for (const [key, value] of entries) {
      const fullPath = currentPath ? `${currentPath}.${key}` : key;

      if (this.fieldMappings.has(key)) {
        const mapping = this.fieldMappings.get(key)!;
        const mappedValue = mapping.transform ? mapping.transform(value) : value;

        if (mapping.to.includes('.')) {
          this.setNestedValue(obj, mapping.to, mappedValue);
          if (mapping.to !== key) {
            delete obj[key];
          }
        } else {
          obj[mapping.to] = mappedValue;
          if (mapping.to !== key) {
            delete obj[key];
          }
        }
      } else if (typeof value === 'object') {
        this.applyMappingsRecursively(value, fullPath);
      }
    }
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current)) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }

    current[parts[parts.length - 1]] = value;
  }

  /**
   * Add custom field mapping
   */
  addFieldMapping(mapping: FieldMapping): void {
    this.fieldMappings.set(mapping.from, mapping);
  }

  /**
   * Get TypeScript code for the mapping
   */
  generateTypeScriptCode(alignment: AlignmentFunction): string {
    const mappingCode = this.generateFieldMappingCode();
    const alignmentCode = this.alignmentGenerator.generateTypeScriptCode(alignment);

    return `
${mappingCode}

${alignmentCode}

// Combined mapping and alignment function
export function mapAndAlign_${alignment.queryId.replace(/[^a-zA-Z0-9]/g, '_')}(response: any): any {
  const mapped = applyFieldMappings(response);
  return align_${alignment.queryId.replace(/[^a-zA-Z0-9]/g, '_')}(mapped);
}
`.trim();
  }

  private generateFieldMappingCode(): string {
    const mappings = Array.from(this.fieldMappings.entries());

    return `
// Field mappings configuration
const fieldMappings = ${JSON.stringify(
      mappings.map(([from, mapping]) => ({
        from,
        to: mapping.to,
        hasTransform: !!mapping.transform,
      })),
      null,
      2,
    )};

// Apply field mappings
function applyFieldMappings(data: any): any {
  const result = JSON.parse(JSON.stringify(data));
  
  function applyRecursively(obj: any, path: string = ''): void {
    if (!obj || typeof obj !== 'object') return;
    
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => applyRecursively(item, \`\${path}[\${index}]\`));
      return;
    }
    
    const entries = Object.entries(obj);
    for (const [key, value] of entries) {
      const mapping = fieldMappings.find(m => m.from === key);
      if (mapping) {
        if (mapping.to.includes('.')) {
          setNestedValue(obj, mapping.to, value);
          if (mapping.to !== key) delete obj[key];
        } else {
          obj[mapping.to] = value;
          if (mapping.to !== key) delete obj[key];
        }
      } else if (typeof value === 'object') {
        applyRecursively(value, path ? \`\${path}.\${key}\` : key);
      }
    }
  }
  
  function setNestedValue(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current)) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }
  
  applyRecursively(result);
  return result;
}
`.trim();
  }

  /**
   * Detect common mapping patterns
   */
  detectMappingPatterns(
    sourceResponse: CapturedResponse,
    targetResponse: CapturedResponse,
  ): FieldMapping[] {
    const comparison = this.comparator.compare(targetResponse, sourceResponse);
    const detectedMappings: FieldMapping[] = [];

    for (const diff of comparison.differences) {
      if (diff.type === 'missing-field' || diff.type === 'extra-field') {
        const sourcePath =
          diff.type === 'missing-field'
            ? diff.path
            : this.findSimilarPath(diff.path, targetResponse.response.data);

        if (sourcePath) {
          detectedMappings.push({
            from: this.pathToString(sourcePath),
            to: this.pathToString(diff.path),
          });
        }
      }
    }

    return detectedMappings;
  }

  private findSimilarPath(path: string | string[], data: any): string[] | null {
    const pathArray = Array.isArray(path) ? path : path.split('.');
    const fieldName = pathArray[pathArray.length - 1];

    const candidates = [
      fieldName.replace(/([A-Z])/g, '_$1').toLowerCase(),
      fieldName.replace(/_([a-z])/g, (g) => g[1].toUpperCase()),
      `display${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}`,
      fieldName.replace(/^display/, '').toLowerCase(),
    ];

    for (const candidate of candidates) {
      if (this.hasPath(data, [...pathArray.slice(0, -1), candidate])) {
        return [...pathArray.slice(0, -1), candidate];
      }
    }

    return null;
  }

  private hasPath(obj: any, path: string[]): boolean {
    let current = obj;
    for (const segment of path) {
      if (!current || typeof current !== 'object' || !(segment in current)) {
        return false;
      }
      current = current[segment];
    }
    return true;
  }

  private pathToString(path: string | string[]): string {
    if (typeof path === 'string') return path;
    return path.join('.');
  }
}
