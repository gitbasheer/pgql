#!/usr/bin/env node
/** @fileoverview Test manual template resolution */

import * as fs from 'fs/promises';

async function testManualResolution() {
  try {
    const content = await fs.readFile('./test/fixtures/sample_data/sampleQueries.ts', 'utf-8');
    
    console.log('🧪 Testing manual template resolution...');
    
    // Extract SAMPLE_QUERY_NAMES
    const sampleQueryNamesMatch = content.match(/export\s+const\s+SAMPLE_QUERY_NAMES\s*=\s*\{([^}]+)\}/s);
    if (!sampleQueryNamesMatch) {
      console.error('❌ Could not find SAMPLE_QUERY_NAMES');
      return;
    }
    
    const objContent = sampleQueryNamesMatch[1];
    const queryNames: Record<string, string> = {};
    
    // Extract key-value pairs
    const pairs = objContent.match(/(\w+):\s*['"`]([^'"`]+)['"`]/g);
    if (pairs) {
      pairs.forEach(pair => {
        const [, key, value] = pair.match(/(\w+):\s*['"`]([^'"`]+)['"`]/) || [];
        if (key && value) {
          queryNames[key] = value;
        }
      });
    }
    
    console.log('📋 Extracted queryNames:', Object.keys(queryNames).length);
    console.log('   allV1:', queryNames.allV1);
    
    // Find and resolve the template query
    const queryPattern = /query\s+\$\{SAMPLE_QUERY_NAMES\.(\w+)\}/;
    const match = content.match(queryPattern);
    if (match) {
      const [fullMatch, key] = match;
      const resolvedName = queryNames[key];
      
      console.log('\n🎯 Found template query:');
      console.log('   Pattern:', fullMatch);
      console.log('   Key:', key);
      console.log('   Resolved name:', resolvedName);
      
      if (resolvedName) {
        const resolvedContent = content.replace(fullMatch, `query ${resolvedName}`);
        console.log('✅ Template resolution would work!');
        console.log('   Before:', fullMatch);
        console.log('   After:', `query ${resolvedName}`);
        
        // Check if the resolved content no longer contains templates
        const hasTemplates = resolvedContent.includes('${');
        console.log(`   Still has templates: ${hasTemplates ? 'YES' : 'NO'}`);
      }
    } else {
      console.log('❌ No template query pattern found');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testManualResolution();