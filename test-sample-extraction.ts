/** @fileoverview Simple test script to extract queries from sample data directory */

import { UnifiedExtractor } from './src/core/extraction/engine/UnifiedExtractor';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testSampleExtraction() {
  console.log('🚀 Testing extraction on sample data directory...\n');

  const sampleDataPath = path.join(__dirname, 'data/sample_data');
  const extractor = new UnifiedExtractor({
    directory: sampleDataPath,
    patterns: ['**/*.{js,jsx,ts,tsx}'],
    strategies: ['hybrid']
  });
  
  try {
    // Run extraction
    console.log(`📂 Extracting from: ${sampleDataPath}`);
    const result = await extractor.extract();

    // Display results
    console.log('\n✅ Extraction Results:');
    console.log(`  - Total queries found: ${result.queries.length}`);
    console.log(`  - Total fragments found: ${result.fragments.size}`);
    console.log(`  - Total variants generated: ${result.variants.length}`);
    console.log(`  - Total errors: ${result.errors.length}`);
    
    // Show queries by file
    console.log('\n📄 Queries by file:');
    const fileGroups = new Map<string, any[]>();
    for (const query of result.queries) {
      const fileName = path.basename(query.filePath || 'unknown');
      if (!fileGroups.has(fileName)) {
        fileGroups.set(fileName, []);
      }
      fileGroups.get(fileName)!.push(query);
    }
    
    for (const [fileName, queries] of fileGroups) {
      console.log(`\n  ${fileName}: ${queries.length} queries`);
      for (const query of queries) {
        console.log(`    - ${query.queryName || 'Unnamed query'}`);
      }
    }

    // Show endpoint classification
    console.log('\n🏷️  Endpoint classification:');
    let productGraphCount = 0;
    let offerGraphCount = 0;
    
    for (const query of result.queries) {
      const isOfferGraph = query.filePath?.includes('offer-graph') ||
                          query.queryContent?.includes('transitions') ||
                          query.queryContent?.includes('modifyBasket');
      
      if (isOfferGraph) {
        offerGraphCount++;
      } else {
        productGraphCount++;
      }
    }
    
    console.log(`  - productGraph: ${productGraphCount} queries`);
    console.log(`  - offerGraph: ${offerGraphCount} queries`);

    // Save results
    const outputPath = path.join(__dirname, 'sample-extraction-results.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`\n💾 Results saved to: ${outputPath}`);

    // Show errors if any
    if (result.errors.length > 0) {
      console.log('\n⚠️  Extraction errors:');
      for (const error of result.errors) {
        console.log(`  - ${error.message} (${error.file})`);
      }
    }

    return result;
  } catch (error) {
    console.error('❌ Extraction failed:', error);
    throw error;
  }
}

// Run if called directly
testSampleExtraction()
  .then(() => {
    console.log('\n✨ Extraction test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Extraction test failed:', error);
    process.exit(1);
  });

export { testSampleExtraction };