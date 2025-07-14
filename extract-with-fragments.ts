#!/usr/bin/env tsx

import * as fs from 'fs/promises';
import * as path from 'path';

async function main() {
  console.log('Extracting queries with fragments...\n');
  
  // Skip re-extraction for now due to build issues
  
  // Load the fragments file
  console.log('\nLoading fragments from fragments.js...');
  const fragmentsPath = path.join(process.cwd(), 'src/test/fixtures/baseline/fragments.js');
  const fragmentsContent = await fs.readFile(fragmentsPath, 'utf-8');
  
  // Extract fragment definitions using regex
  const fragmentRegex = /fragment\s+(\w+)\s+on\s+(\w+)\s*{([^}]+{[^}]*}[^}]*|[^}]+)}/gm;
  const fragments: Record<string, string> = {};
  
  let match;
  while ((match = fragmentRegex.exec(fragmentsContent)) !== null) {
    const [fullMatch, fragmentName, fragmentType] = match;
    fragments[fragmentName] = fullMatch;
    console.log(`  Found fragment: ${fragmentName} on ${fragmentType}`);
  }
  
  // Also check for exported const fragments
  const constFragmentRegex = /export\s+const\s+(\w+Fragment)\s*=\s*`([^`]+)`/gm;
  while ((match = constFragmentRegex.exec(fragmentsContent)) !== null) {
    const [, fragmentName, fragmentContent] = match;
    if (fragmentContent.includes('fragment')) {
      fragments[fragmentName] = fragmentContent.trim();
      console.log(`  Found const fragment: ${fragmentName}`);
    }
  }
  
  console.log(`\nTotal fragments found: ${Object.keys(fragments).length}`);
  
  // Load extracted queries
  const extractedData = JSON.parse(await fs.readFile('./extracted-queries.json', 'utf-8'));
  const queries = extractedData.queries || extractedData;
  
  // Create a complete GraphQL document with fragments
  const completeQueries = queries.map((query: any) => {
    // Check which fragments this query references
    const referencedFragments = new Set<string>();
    const fragmentSpreadRegex = /\.\.\.(\w+)/g;
    
    let match;
    while ((match = fragmentSpreadRegex.exec(query.content)) !== null) {
      referencedFragments.add(match[1]);
    }
    
    // Build complete query with fragments
    let completeContent = query.content;
    
    if (referencedFragments.size > 0) {
      const fragmentDefinitions: string[] = [];
      for (const fragmentName of referencedFragments) {
        if (fragments[fragmentName]) {
          fragmentDefinitions.push(fragments[fragmentName]);
        } else {
          console.warn(`  Warning: Fragment ${fragmentName} referenced in ${query.name} but not found`);
        }
      }
      
      if (fragmentDefinitions.length > 0) {
        completeContent = query.content + '\n\n' + fragmentDefinitions.join('\n\n');
      }
    }
    
    return {
      ...query,
      originalContent: query.content,
      content: completeContent,
      fragments: Array.from(referencedFragments)
    };
  });
  
  // Save enhanced queries
  const enhancedData = {
    ...extractedData,
    queries: completeQueries,
    fragmentsIncluded: true,
    fragmentDefinitions: fragments
  };
  
  await fs.writeFile('./extracted-queries-with-fragments.json', JSON.stringify(enhancedData, null, 2));
  console.log('\n✅ Saved queries with fragments to extracted-queries-with-fragments.json');
  
  // Show fragment usage summary
  console.log('\n=== FRAGMENT USAGE SUMMARY ===\n');
  const fragmentUsage = new Map<string, number>();
  
  for (const query of completeQueries) {
    for (const fragment of query.fragments || []) {
      fragmentUsage.set(fragment, (fragmentUsage.get(fragment) || 0) + 1);
    }
  }
  
  for (const [fragment, count] of fragmentUsage.entries()) {
    console.log(`  ${fragment}: used in ${count} queries`);
  }
  
  // Identify missing fragments
  const missingFragments = new Set<string>();
  for (const query of completeQueries) {
    for (const fragment of query.fragments || []) {
      if (!fragments[fragment]) {
        missingFragments.add(fragment);
      }
    }
  }
  
  if (missingFragments.size > 0) {
    console.log('\n⚠️  Missing fragment definitions:');
    for (const fragment of missingFragments) {
      console.log(`  - ${fragment}`);
    }
  }
}

main().catch(console.error);