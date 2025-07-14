#!/usr/bin/env tsx

import { MultiSchemaValidator } from './src/core/validator/MultiSchemaValidator';
import * as fs from 'fs/promises';

async function main() {
  console.log('🔍 Multi-Schema Validation Pipeline\n');
  
  // Load configuration
  const config = await MultiSchemaValidator.loadConfig();
  console.log('Loaded schema configuration:');
  for (const [name, cfg] of Object.entries(config.schemas)) {
    console.log(`  - ${name}: ${cfg.path}`);
  }
  
  // Initialize validator
  const validator = new MultiSchemaValidator(config);
  await validator.initialize();
  
  // Load queries with fragments
  console.log('\nLoading queries...');
  const queriesPath = await fs.access('./extracted-queries-with-fragments.json')
    .then(() => './extracted-queries-with-fragments.json')
    .catch(() => './extracted-queries.json');
    
  const extractedData = JSON.parse(await fs.readFile(queriesPath, 'utf-8'));
  const queries = extractedData.queries || extractedData;
  
  // Filter valid queries
  const validQueries = queries.filter((q: any) => 
    q.content && 
    q.content.length > 10 && 
    (q.content.includes('query') || q.content.includes('mutation') || q.content.includes('fragment'))
  );
  
  console.log(`Found ${validQueries.length} valid queries to validate\n`);
  
  // Validate all queries
  console.log('Validating queries...\n');
  const results = await validator.validateQueries(validQueries);
  
  // Generate report
  const report = validator.generateValidationReport(results);
  
  // Display results
  console.log('=== VALIDATION RESULTS ===\n');
  console.log(`Total Queries: ${report.totalQueries}`);
  console.log(`✅ Valid: ${report.summary.valid}`);
  console.log(`❌ Invalid: ${report.summary.invalid}`);
  console.log(`⚠️  Warnings: ${report.summary.warnings}`);
  
  console.log('\n=== BY SCHEMA ===\n');
  for (const [schema, stats] of Object.entries(report.bySchema as any)) {
    console.log(`${schema.toUpperCase()} SCHEMA:`);
    console.log(`  Total: ${stats.total}`);
    console.log(`  Valid: ${stats.valid} (${Math.round(stats.valid / stats.total * 100)}%)`);
    console.log(`  Invalid: ${stats.invalid}`);
    console.log(`  Warnings: ${stats.warnings}`);
    console.log('');
  }
  
  // Show specific problem queries
  console.log('=== PROBLEM QUERIES ===\n');
  const problemQueries = ['FindUnifiedBillDetails', 'ModifyBasketWithOptions', 'GetQuickLinksData'];
  
  for (const queryName of problemQueries) {
    const result = Array.from(results.values()).find(r => r.queryName === queryName);
    if (result) {
      console.log(`${queryName}:`);
      console.log(`  Schema Used: ${result.schema}`);
      console.log(`  Detected Schema: ${result.classification.detectedSchema} (${Math.round(result.classification.confidence * 100)}%)`);
      console.log(`  Valid: ${result.validationResult.valid ? '✅' : '❌'}`);
      
      if (!result.validationResult.valid) {
        console.log('  Errors:');
        for (const error of result.validationResult.errors.slice(0, 3)) {
          console.log(`    - ${error.message}`);
        }
      }
      console.log('');
    }
  }
  
  // Save detailed report
  const detailedReport = {
    timestamp: new Date().toISOString(),
    config,
    summary: report,
    results: Array.from(results.entries()).map(([id, result]) => ({
      id,
      ...result
    }))
  };
  
  await fs.writeFile('./multi-schema-validation-report.json', JSON.stringify(detailedReport, null, 2));
  console.log('📄 Detailed report saved to multi-schema-validation-report.json');
  
  // Update todo status
  console.log('\n✅ Multi-schema validation complete!');
}

main().catch(console.error);