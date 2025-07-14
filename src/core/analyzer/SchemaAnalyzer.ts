import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLFieldMap,
  GraphQLField
} from 'graphql';

export interface DeprecatedField {
  typeName: string;
  fieldName: string;
  deprecationReason: string;
  suggestedReplacement?: string;
}

export interface MigrationRule {
  from: FieldReference;
  to: FieldReference;
  transform?: (value: unknown) => unknown;
}

export interface FieldReference {
  type: string;
  field: string;
  path: string[];  // Nested field path
}

export class SchemaAnalyzer {
  constructor(private schema: GraphQLSchema) {}

  // Type-safe schema analysis
  findDeprecatedFields(): Map<string, DeprecatedField[]> {
    const deprecatedFields = new Map<string, DeprecatedField[]>();
    const typeMap = this.schema.getTypeMap();

    Object.entries(typeMap).forEach(([typeName, type]) => {
      if (type instanceof GraphQLObjectType) {
        const fields = type.getFields();

        Object.entries(fields).forEach(([fieldName, field]) => {
          const deprecatedDirective = field.astNode?.directives?.find(
            d => d.name.value === 'deprecated'
          );

          if (deprecatedDirective || field.deprecationReason) {
            const reason = field.deprecationReason || this.extractDeprecationReason(deprecatedDirective);

            if (reason) {
              const existing = deprecatedFields.get(typeName) || [];
              deprecatedFields.set(typeName, [
                ...existing,
                {
                  typeName,
                  fieldName,
                  deprecationReason: reason,
                  suggestedReplacement: this.extractReplacement(reason)
                }
              ]);
            }
          }
        });
      }
    });

    return deprecatedFields;
  }

  private extractDeprecationReason(directive: any): string | null {
    if (!directive) return null;

    const reason = directive.arguments?.find(
      (arg: any) => arg.name.value === 'reason'
    )?.value;

    if (reason && 'value' in reason) {
      return reason.value;
    }

    return null;
  }

  private extractReplacement(reason: string): string | undefined {
    // Common patterns: "Use `newField` instead"
    const match = reason.match(/Use `(\w+)`/);
    return match ? match[1] : undefined;
  }

  generateMigrationRules(): MigrationRule[] {
    const deprecatedFields = this.findDeprecatedFields();
    const rules: MigrationRule[] = [];

    deprecatedFields.forEach((fields, typeName) => {
      fields.forEach(field => {
        if (field.suggestedReplacement) {
          rules.push({
            from: {
              type: typeName,
              field: field.fieldName,
              path: [typeName, field.fieldName]
            },
            to: {
              type: typeName,
              field: field.suggestedReplacement,
              path: [typeName, field.suggestedReplacement]
            }
          });
        }
      });
    });

    return rules;
  }

  findBreakingChanges(previousSchema: GraphQLSchema): BreakingChange[] {
    const changes: BreakingChange[] = [];

    // Compare type maps
    const oldTypes = previousSchema.getTypeMap();
    const newTypes = this.schema.getTypeMap();

    // Find removed types
    Object.keys(oldTypes).forEach(typeName => {
      if (!newTypes[typeName] && !typeName.startsWith('__')) {
        changes.push({
          type: 'TYPE_REMOVED',
          typeName,
          message: `Type ${typeName} was removed`
        });
      }
    });

    // Find removed fields
    Object.entries(newTypes).forEach(([typeName, type]) => {
      if (type instanceof GraphQLObjectType && oldTypes[typeName]) {
        const oldType = oldTypes[typeName] as GraphQLObjectType;
        if (oldType instanceof GraphQLObjectType) {
          const oldFields = oldType.getFields();
          const newFields = type.getFields();

          Object.keys(oldFields).forEach(fieldName => {
            if (!newFields[fieldName]) {
              changes.push({
                type: 'FIELD_REMOVED',
                typeName,
                fieldName,
                message: `Field ${typeName}.${fieldName} was removed`
              });
            }
          });
        }
      }
    });

    return changes;
  }
}

export interface BreakingChange {
  type: 'TYPE_REMOVED' | 'FIELD_REMOVED' | 'ARG_REMOVED' | 'TYPE_CHANGED';
  typeName: string;
  fieldName?: string;
  argName?: string;
  message: string;
}
