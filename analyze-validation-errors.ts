#!/usr/bin/env tsx

import { SchemaValidator } from './src/core/validator/SchemaValidator';
import * as fs from 'fs/promises';

async function main() {
  const validator = new SchemaValidator();
  await validator.loadSchemaFromFile('./data/schema.graphql');
  
  const extractedData = JSON.parse(await fs.readFile('./extracted-queries.json', 'utf-8'));
  const queries = extractedData.queries || extractedData;
  
  console.log('Analyzing validation errors for', queries.length, 'queries\n');
  
  const errors: any[] = [];
  const errorTypes = new Map<string, number>();
  
  for (const query of queries) {
    const result = await validator.validateQuery(query.content);
    
    if (!result.valid) {
      console.log(`\n❌ Query: ${query.name || query.id}`);
      console.log(`   File: ${query.file}`);
      
      for (const error of result.errors) {
        console.log(`   Error: ${error.message}`);
        if (error.suggestion) {
          console.log(`   Suggestion: ${error.suggestion}`);
        }
        
        // Count error types
        const errorKey = error.message.split(':')[0];
        errorTypes.set(errorKey, (errorTypes.get(errorKey) || 0) + 1);
        
        errors.push({
          queryId: query.id,
          queryName: query.name,
          error: error.message,
          type: error.type,
          suggestion: error.suggestion
        });
      }
    }
  }
  
  console.log('\n\n📊 Error Summary:');
  for (const [type, count] of errorTypes.entries()) {
    console.log(`  ${type}: ${count} occurrences`);
  }
  
  // Save detailed errors
  await fs.writeFile('./validation-errors.json', JSON.stringify(errors, null, 2));
  console.log('\n✅ Detailed errors saved to validation-errors.json');
}

main().catch(console.error);