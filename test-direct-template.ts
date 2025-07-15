#!/usr/bin/env node
/** @fileoverview Test direct template pattern matching */

import * as fs from 'fs/promises';

async function testDirectTemplate() {
  try {
    const content = await fs.readFile('./test/fixtures/sample_data/sampleQueries.ts', 'utf-8');
    
    console.log('🔍 Looking for template patterns...');
    
    // Find all template literal patterns that might contain GraphQL
    const templateLiteralRegex = /`[^`]*\$\{[^}]+\}[^`]*`/gs;
    const matches = content.match(templateLiteralRegex);
    
    if (matches) {
      console.log(`📊 Found ${matches.length} template literals with interpolation:`);
      matches.forEach((match, index) => {
        console.log(`\n--- Template ${index + 1} ---`);
        console.log(match.substring(0, 200) + (match.length > 200 ? '...' : ''));
        
        // Check if it looks like GraphQL
        if (match.includes('query') || match.includes('mutation') || match.includes('fragment')) {
          console.log('✅ Looks like GraphQL!');
        }
      });
    } else {
      console.log('❌ No template literals with interpolation found');
    }
    
    // Also look for the specific pattern we're interested in
    const specificPattern = /query\s+\$\{[^}]+\}/g;
    const specificMatches = content.match(specificPattern);
    
    if (specificMatches) {
      console.log(`\n🎯 Found ${specificMatches.length} 'query \${...}' patterns:`);
      specificMatches.forEach((match, index) => {
        console.log(`  ${index + 1}. ${match}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testDirectTemplate();