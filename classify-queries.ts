#!/usr/bin/env tsx

import { QuerySchemaClassifier } from './src/core/validator/QuerySchemaClassifier';
import * as fs from 'fs/promises';

async function main() {
  // Load extracted queries
  const extractedData = JSON.parse(await fs.readFile('./extracted-queries.json', 'utf-8'));
  const queries = extractedData.queries || extractedData;

  console.log(`\nAnalyzing ${queries.length} queries for schema classification...\n`);

  // Filter out invalid queries (like those emoji ones)
  const validQueries = queries.filter(
    (q: any) =>
      q.content &&
      q.content.length > 10 &&
      (q.content.includes('query') ||
        q.content.includes('mutation') ||
        q.content.includes('fragment')),
  );

  console.log(`Found ${validQueries.length} valid GraphQL queries\n`);

  // Classify each query
  const classifications = validQueries.map((q: any) =>
    QuerySchemaClassifier.classifyQuery(q.id, q.name, q.content),
  );

  // Group by schema
  const schemaGroups = new Map<string, any[]>();
  for (const classification of classifications) {
    const group = schemaGroups.get(classification.detectedSchema) || [];
    group.push(classification);
    schemaGroups.set(classification.detectedSchema, group);
  }

  // Print detailed results
  console.log('=== SCHEMA CLASSIFICATION RESULTS ===\n');

  for (const [schema, queries] of schemaGroups.entries()) {
    console.log(`\n${schema.toUpperCase()} SCHEMA (${queries.length} queries):`);
    console.log('─'.repeat(50));

    // Show high confidence classifications
    const highConfidence = queries.filter((q) => q.confidence > 0.7);
    const mediumConfidence = queries.filter((q) => q.confidence > 0.4 && q.confidence <= 0.7);
    const lowConfidence = queries.filter((q) => q.confidence <= 0.4);

    if (highConfidence.length > 0) {
      console.log('\n  High Confidence (>70%):');
      for (const q of highConfidence.slice(0, 5)) {
        console.log(`    - ${q.queryName} (${Math.round(q.confidence * 100)}%)`);
        if (q.indicators.length > 0) {
          console.log(`      ${q.indicators[0]}`);
        }
      }
      if (highConfidence.length > 5) {
        console.log(`    ... and ${highConfidence.length - 5} more`);
      }
    }

    if (mediumConfidence.length > 0) {
      console.log('\n  Medium Confidence (40-70%):');
      console.log(`    ${mediumConfidence.length} queries`);
    }

    if (lowConfidence.length > 0) {
      console.log('\n  Low Confidence (<40%):');
      console.log(`    ${lowConfidence.length} queries`);
    }
  }

  // Analyze specific problem queries
  console.log('\n\n=== PROBLEM QUERIES ANALYSIS ===\n');

  const problemQueries = ['FindUnifiedBillDetails', 'ModifyBasketWithOptions', 'GetQuickLinksData'];

  for (const queryName of problemQueries) {
    const query = validQueries.find((q: any) => q.name === queryName);
    if (query) {
      const classification = QuerySchemaClassifier.classifyQuery(
        query.id,
        query.name,
        query.content,
      );
      console.log(`\n${queryName}:`);
      console.log(`  Detected Schema: ${classification.detectedSchema}`);
      console.log(`  Confidence: ${Math.round(classification.confidence * 100)}%`);
      console.log('  Indicators:');
      for (const indicator of classification.indicators) {
        console.log(`    - ${indicator}`);
      }
    }
  }

  // Save classification results
  const classificationReport = {
    timestamp: new Date().toISOString(),
    totalQueries: queries.length,
    validQueries: validQueries.length,
    classifications: classifications,
    summary: Object.fromEntries(
      Array.from(schemaGroups.entries()).map(([schema, queries]) => [
        schema,
        {
          count: queries.length,
          highConfidence: queries.filter((q) => q.confidence > 0.7).length,
          mediumConfidence: queries.filter((q) => q.confidence > 0.4 && q.confidence <= 0.7).length,
          lowConfidence: queries.filter((q) => q.confidence <= 0.4).length,
        },
      ]),
    ),
  };

  await fs.writeFile(
    './query-classification-report.json',
    JSON.stringify(classificationReport, null, 2),
  );
  console.log('\n\n✅ Classification report saved to query-classification-report.json');
}

main().catch(console.error);
