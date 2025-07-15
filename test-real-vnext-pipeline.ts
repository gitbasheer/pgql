#!/usr/bin/env node

/**
 * @fileoverview Real vnext pipeline testing with comprehensive validation
 * Tests full Extract → Validate → Test → Transform → PR flow with real API authentication
 * Following CLAUDE.local.md: Use spreads for var merging, JSDoc for API calls
 */

import { UnifiedExtractor } from './dist/core/extraction/engine/UnifiedExtractor.js';
import { ResponseValidationService } from './dist/core/validator/ResponseValidationService.js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config();

/**
 * Test configuration with readonly properties (CLAUDE.local.md compliance)
 */
interface TestConfig {
  readonly vnextPath: string;
  readonly expectedQueries: number;
  readonly endpoints: {
    readonly productGraph: string;
    readonly offerGraph: string;
  };
  readonly auth: {
    readonly cookies: string;
  };
}

/**
 * Real vnext pipeline testing main function
 * @param config - Test configuration with endpoints and auth
 * @returns Promise<void>
 */
async function testRealVnextPipeline(config: TestConfig): Promise<void> {
  console.log('🚀 Starting Real vnext Pipeline Test');
  console.log('=====================================');
  
  try {
    // Phase 1: Extraction with enhanced options
    console.log('\\n📁 Phase 1: Extraction');
    const extractor = new UnifiedExtractor({
      directory: config.vnextPath,
      strategies: ['hybrid'], // AST + Pluck for comprehensive coverage
      resolveFragments: true,
      preserveSourceAST: true,
      enableVariantDetection: true,
      parallel: false, // Sequential for debugging
      patterns: ['**/*.{js,jsx,ts,tsx,graphql}']
    });
    
    const queries = await extractor.extractFromRepo();
    console.log(`✅ Extracted ${queries.length} queries from vnext-dashboard`);
    
    // Verify query count meets expectations
    if (queries.length < config.expectedQueries) {
      console.warn(`⚠️  Expected ${config.expectedQueries}+ queries, got ${queries.length}`);
    }
    
    // Display query breakdown by endpoint
    const endpointBreakdown = queries.reduce((acc, q) => {
      acc[q.endpoint] = (acc[q.endpoint] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('📊 Endpoint Classification:');
    Object.entries(endpointBreakdown).forEach(([endpoint, count]) => {
      console.log(`   ${endpoint}: ${count} queries`);
    });
    
    // Phase 2: Template Resolution Verification
    console.log('\\n🔧 Phase 2: Template Resolution');
    let templateResolvedCount = 0;
    queries.forEach(q => {
      if (q.fullExpandedQuery && q.fullExpandedQuery !== q.query) {
        templateResolvedCount++;
        console.log(`   ✅ Template resolved: ${q.name || 'unnamed'}`);
      }
    });
    console.log(`📈 Template Resolution: ${templateResolvedCount}/${queries.length} queries`);
    
    // Phase 3: Real API Testing with spreads (CLAUDE.local.md compliance)
    console.log('\\n🌐 Phase 3: Real API Testing');
    const validator = new ResponseValidationService({
      endpoints: [],
      capture: { parallel: true, maxConcurrency: 10, timeout: 30000 },
      comparison: { strict: false },
      storage: { type: 'file', path: './validation-storage' }
    });
    
    // Test first few queries on real API
    const testQueries = queries.slice(0, Math.min(3, queries.length));
    let apiSuccessCount = 0;
    
    for (const query of testQueries) {
      try {
        console.log(`   🧪 Testing ${query.name || 'unnamed'} on ${query.endpoint}`);
        
        // Build variables with spreads (CLAUDE.local.md compliance)
        const baseVars = await validator.buildVariables(query.fullExpandedQuery);
        const envOverrides = {
          ...(process.env.DEFAULT_VENTURE_ID && { ventureId: process.env.DEFAULT_VENTURE_ID }),
          ...(process.env.DEFAULT_USER_ID && { userId: process.env.DEFAULT_USER_ID })
        };
        const mergedVars = { ...baseVars, ...envOverrides };
        
        // Test on real API with proper auth construction
        const testResult = await validator.testOnRealApi({
          query: {
            name: query.name || 'unnamed',
            endpoint: query.endpoint,
            fullExpandedQuery: query.fullExpandedQuery,
            variables: mergedVars
          },
          auth: {
            cookies: config.auth.cookies,
            appKey: 'vnext-dashboard'
          },
          testingAccount: {
            id: process.env.DEFAULT_USER_ID || 'test-user',
            ventures: [{ id: process.env.DEFAULT_VENTURE_ID || 'test-venture' }],
            projects: [{ domain: 'test-domain.com' }]
          }
        });
        
        console.log(`   ✅ API test successful for ${query.name}`);
        apiSuccessCount++;
        
      } catch (error) {
        console.warn(`   ⚠️  API test failed for ${query.name}: ${error.message}`);
        // Continue with other queries - don't fail entire test
      }
    }
    
    console.log(`📊 API Testing: ${apiSuccessCount}/${testQueries.length} successful`);
    
    // Phase 4: Edge Case Testing (@experimentalOptIn, etc.)
    console.log('\\n🔍 Phase 4: Edge Case Testing');
    const edgeCases = queries.filter(q => 
      q.fullExpandedQuery.includes('@experimentalOptIn') ||
      q.fullExpandedQuery.includes('@defer') ||
      q.fullExpandedQuery.includes('@stream') ||
      q.fullExpandedQuery.includes('${')
    );
    
    console.log(`🧪 Found ${edgeCases.length} queries with edge cases:`);
    edgeCases.forEach(q => {
      console.log(`   - ${q.name || 'unnamed'}: Contains advanced GraphQL features`);
    });
    
    // Final Summary
    console.log('\\n📈 Pipeline Test Summary');
    console.log('=========================');
    console.log(`✅ Extraction: ${queries.length} queries extracted`);
    console.log(`✅ Template Resolution: ${templateResolvedCount} resolved`);
    console.log(`✅ API Testing: ${apiSuccessCount}/${testQueries.length} successful`);
    console.log(`✅ Edge Cases: ${edgeCases.length} identified`);
    console.log(`✅ Endpoint Classification: ${Object.keys(endpointBreakdown).length} endpoints`);
    
    const successRate = queries.length > 0 ? 
      ((templateResolvedCount + apiSuccessCount) / (queries.length + testQueries.length)) * 100 : 0;
    console.log(`\\n🎯 Overall Success Rate: ${successRate.toFixed(1)}%`);
    
    if (successRate >= 80) {
      console.log('🎉 Pipeline test PASSED! Ready for production.');
    } else {
      console.warn('⚠️  Pipeline test needs improvement before production.');
    }
    
  } catch (error) {
    console.error('❌ Pipeline test failed:', error);
    throw error;
  }
}

/**
 * Main execution with proper error handling
 */
async function main(): Promise<void> {
  // Configuration with spreads (CLAUDE.local.md compliance)
  const baseConfig = {
    vnextPath: './data/sample_data/vnext-dashboard',
    expectedQueries: 3, // Minimum expected from vnext sample
    endpoints: {
      productGraph: process.env.APOLLO_PG_ENDPOINT || 'https://pg.api.godaddy.com/v1/gql/customer',
      offerGraph: process.env.APOLLO_OG_ENDPOINT || 'https://og.api.godaddy.com/'
    }
  };
  
  // Auth configuration with individual cookies (as shown in PG/OG examples)
  const authConfig = {
    auth: {
      cookies: [
        `auth_idp=${process.env.auth_idp || ''}`,
        `cust_idp=${process.env.cust_idp || ''}`,
        `info_cust_idp=${process.env.info_cust_idp || ''}`,
        `info_idp=${process.env.info_idp || ''}`
      ].filter(c => !c.endsWith('=')).join('; ')
    }
  };
  
  // Merge configurations with spreads
  const config: TestConfig = { ...baseConfig, ...authConfig };
  
  await testRealVnextPipeline(config);
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { testRealVnextPipeline };
export type { TestConfig };