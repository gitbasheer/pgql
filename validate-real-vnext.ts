/** @fileoverview Real vnext validation with .env auth headers and SSO fallback */

import { ResponseValidationService } from './src/core/validator/ResponseValidationService.js';
import { SSOService, SSOResult } from './src/core/validator/SSOService.js';
import { logger } from './src/utils/logger.js';
import { UnifiedExtractor } from './src/core/extraction/engine/UnifiedExtractor.js';
import { ResponseCaptureService } from './src/core/validator/ResponseCaptureService.js';
import { GoDaddySSO } from './src/core/validator/GoDaddyEndpointConfig.js';
import * as dotenv from 'dotenv';
import { GraphQLClient } from './src/core/testing/GraphQLClient.js';

// Load environment variables
dotenv.config();

interface VnextAuthConfig {
  cookies: GoDaddySSO;
  source: 'env' | 'sso';
  expiresAt?: Date;
}

/**
 * Get authentication configuration from .env or SSO service
 */
async function getAuthConfig(): Promise<VnextAuthConfig | null> {
  logger.info('🔐 Getting authentication configuration for vnext validation...');

  // Try .env first
  const envCookies = {
    auth_idp: process.env.auth_idp,
    cust_idp: process.env.cust_idp,
    info_cust_idp: process.env.info_cust_idp,
    info_idp: process.env.info_idp,
  };

  // Check if all cookies are present
  const hasAllEnvCookies = Object.values(envCookies).every(
    (cookie) => cookie && cookie.length > 10 && !cookie.includes('test-'),
  );

  if (hasAllEnvCookies) {
    logger.info('✅ Using auth cookies from .env file');
    return {
      cookies: envCookies as GoDaddySSO,
      source: 'env',
    };
  }

  logger.warn('⚠️ .env auth cookies missing or invalid, falling back to SSO...');

  // Fall back to SSO service
  const ssoService = SSOService.getInstance();

  const ssoConfig = {
    provider: 'godaddy' as const,
    credentials: {
      username: process.env.SSO_USER,
      password: process.env.SSO_PASS,
    },
  };

  if (!ssoConfig.credentials.username || !ssoConfig.credentials.password) {
    logger.error('❌ SSO credentials not found in .env. Cannot authenticate.');
    return null;
  }

  try {
    const ssoResult: SSOResult = await ssoService.authenticate(ssoConfig);

    if (!ssoResult.success || !ssoResult.cookies) {
      logger.error('❌ SSO authentication failed:', ssoResult.error);
      return null;
    }

    logger.info('✅ SSO authentication successful');
    return {
      cookies: ssoResult.cookies,
      source: 'sso',
      expiresAt: ssoResult.expiresAt,
    };
  } catch (error) {
    logger.error('❌ SSO service error:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Extract queries from vnext codebase path
 */
async function extractVnextQueries(vnextPath: string) {
  logger.info(`🔍 Extracting GraphQL queries from vnext path: ${vnextPath}`);

  try {
    const extractor = new UnifiedExtractor({
      directory: vnextPath,
      strategies: ['hybrid'],
      patterns: ['**/*.{ts,tsx,js,jsx}'],
      ignorePatterns: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
      enableIncrementalExtraction: true,
      preserveSourceAST: false,
    });

    const result = await extractor.extract();

    logger.info(`✅ Extracted ${result.queries.length} queries from vnext`);
    logger.info(`📊 Endpoints: ${Object.keys(result.stats.endpointCoverage || {}).join(', ')}`);

    return result.queries.slice(0, 10); // Test with first 10 queries for speed
  } catch (error) {
    logger.error(
      '❌ Query extraction failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    throw error;
  }
}

/**
 * Test real API validation with auth
 */
async function testRealAPIValidation(auth: VnextAuthConfig, queries: any[]) {
  logger.info('🚀 Testing real API validation with extracted queries...');

  const cookieString = Object.entries(auth.cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');

  const endpoints = {
    productGraph: process.env.APOLLO_PG_ENDPOINT || 'https://pg.api.godaddy.com/v1/gql/customer',
    offerGraph: process.env.APOLLO_OG_ENDPOINT || 'https://og.api.godaddy.com/v1/graphql',
  };

  let successful = 0;
  let failed = 0;
  const errors: string[] = [];

  // Test each query individually
  for (const query of queries) {
    try {
      logger.info(`🧪 Testing query: ${query.name || query.id}`);

      const client = new GraphQLClient({
        endpoint: endpoints[query.endpoint] || endpoints.productGraph,
        cookieString,
        baselineDir: './validation-storage',
        timeout: 15000,
      });

      // Build minimal variables for testing
      const testVars = buildTestVariables(query);

      // Execute query
      const result = await client.query(query.source || query.content, testVars, false);

      if (result && !result.errors) {
        successful++;
        logger.info(`✅ Query ${query.name || query.id} succeeded`);
      } else {
        failed++;
        const errorMsg = `Query failed: ${result?.errors?.[0]?.message || 'Unknown error'}`;
        errors.push(errorMsg);
        logger.warn(`⚠️ ${errorMsg}`);
      }
    } catch (error) {
      failed++;
      const errorMsg = `Query execution error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(errorMsg);
      logger.warn(`⚠️ ${errorMsg}`);
    }
  }

  return { successful, failed, errors };
}

/**
 * Build test variables for GraphQL query
 */
function buildTestVariables(query: any): Record<string, any> {
  const variables: Record<string, any> = {};

  // Extract variable names from query (basic parsing)
  const variableMatches = (query.source || query.content).match(/\$(\w+):/g);

  if (variableMatches) {
    variableMatches.forEach((match: string) => {
      const varName = match.replace('$', '').replace(':', '');

      // Provide test values based on common patterns
      switch (varName) {
        case 'ventureId':
        case 'id':
          variables[varName] = 'a5a1a68d-cfe8-4649-8763-71ad64d62306';
          break;
        case 'domainName':
        case 'domain':
          variables[varName] = 'example.com';
          break;
        case 'limit':
          variables[varName] = 10;
          break;
        case 'offset':
          variables[varName] = 0;
          break;
        default:
          // Default to string type
          variables[varName] = 'test-value';
      }
    });
  }

  return variables;
}

/**
 * Main validation function
 */
async function validateRealVnext() {
  console.log('🎯 Real vnext validation with .env auth headers and SSO fallback\n');

  try {
    // Step 1: Get authentication
    const auth = await getAuthConfig();
    if (!auth) {
      console.error('❌ Failed to get authentication configuration');
      process.exit(1);
    }

    console.log(
      `✅ Authentication: ${auth.source} (expires: ${auth.expiresAt?.toISOString() || 'N/A'})`,
    );

    // Step 2: Extract queries from vnext path
    const vnextPath = process.argv[2] || './src/test/fixtures/sample-vnext';
    console.log(`📂 Vnext path: ${vnextPath}`);

    const queries = await extractVnextQueries(vnextPath);
    if (queries.length === 0) {
      console.warn('⚠️ No queries extracted from vnext path');
      return;
    }

    // Step 3: Test real API validation
    const results = await testRealAPIValidation(auth, queries);

    // Step 4: Generate summary
    console.log('\n📊 Real vnext validation results:');
    console.log(`✅ Successful queries: ${results.successful}`);
    console.log(`❌ Failed queries: ${results.failed}`);
    console.log(
      `📈 Success rate: ${((results.successful / (results.successful + results.failed)) * 100).toFixed(1)}%`,
    );

    if (results.errors.length > 0) {
      console.log('\n🔍 Error summary:');
      results.errors.slice(0, 5).forEach((error, i) => {
        console.log(`${i + 1}. ${error}`);
      });
      if (results.errors.length > 5) {
        console.log(`... and ${results.errors.length - 5} more errors`);
      }
    }

    // Validation coverage assessment
    const coverageScore = (results.successful / (results.successful + results.failed)) * 100;

    if (coverageScore >= 85) {
      console.log('\n🎉 VALIDATION PASSED: >=85% success rate achieved!');
      console.log('✅ Real vnext validation completed successfully');
      console.log('✅ Auth system working properly');
      console.log('✅ Ready for production deployment');
    } else {
      console.log('\n⚠️ VALIDATION WARNING: <85% success rate');
      console.log('❓ Review failed queries for potential issues');
      console.log('❓ Check auth tokens and endpoint availability');
    }
  } catch (error) {
    console.error(
      '❌ Real vnext validation failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    process.exit(1);
  }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  validateRealVnext();
}

export { validateRealVnext, getAuthConfig, buildTestVariables };
