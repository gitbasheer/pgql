/** @fileoverview Diagnose and refresh auth tokens for real API validation */

import { SSOService } from './src/core/validator/SSOService.js';
import { logger } from './src/utils/logger.js';
import * as dotenv from 'dotenv';
import axios from 'axios';

// Load environment variables
dotenv.config();

/**
 * Test if current auth tokens are valid
 */
async function testCurrentAuth() {
  logger.info('🔍 Testing current auth tokens validity...');

  const authTokens = {
    auth_idp: process.env.auth_idp,
    cust_idp: process.env.cust_idp,
    info_cust_idp: process.env.info_cust_idp,
    info_idp: process.env.info_idp,
  };

  // Check if tokens exist
  const hasTokens = Object.values(authTokens).every(
    (token) => token && token.length > 50 && !token.includes('test-'),
  );

  if (!hasTokens) {
    logger.warn('⚠️ Auth tokens missing or look like test values');
    return { valid: false, reason: 'Missing or invalid tokens' };
  }

  // Test a simple GraphQL request
  const cookieString = Object.entries(authTokens)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');

  const testQuery = {
    query: `query TestAuth { user { id } }`,
  };

  const endpoint = process.env.APOLLO_PG_ENDPOINT || 'https://pg.api.godaddy.com/v1/gql/customer';

  try {
    logger.info(`🌐 Testing endpoint: ${endpoint}`);

    const response = await axios.post(endpoint, testQuery, {
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieString,
        'User-Agent': 'pg-migration-620/1.0.0',
      },
      timeout: 10000,
      validateStatus: () => true, // Don't throw on non-2xx status
    });

    // Check if we got HTML (redirect to login)
    const isHTML = response.headers['content-type']?.includes('text/html');
    const isRedirect = response.status >= 300 && response.status < 400;
    const isLoginPage = response.data?.includes?.('Sign In') || response.data?.includes?.('login');

    if (isHTML || isRedirect || isLoginPage) {
      logger.warn('⚠️ Auth tokens appear to be expired - redirected to login');
      return {
        valid: false,
        reason: 'Tokens expired - redirected to login page',
        status: response.status,
        redirected: response.request?.res?.responseUrl || response.url,
      };
    }

    // Check for GraphQL response
    if (response.data?.data || response.data?.errors) {
      logger.info('✅ Auth tokens appear to be valid - got GraphQL response');
      return {
        valid: true,
        data: response.data,
        status: response.status,
      };
    }

    logger.warn('⚠️ Unexpected response format');
    return {
      valid: false,
      reason: 'Unexpected response format',
      status: response.status,
      contentType: response.headers['content-type'],
    };
  } catch (error) {
    logger.error('❌ Auth test failed:', error instanceof Error ? error.message : 'Unknown error');
    return {
      valid: false,
      reason: `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Attempt to refresh auth using SSO service
 */
async function refreshAuthWithSSO() {
  logger.info('🔄 Attempting to refresh auth using SSO service...');

  const ssoService = SSOService.getInstance();

  const ssoConfig = {
    provider: 'godaddy' as const,
    credentials: {
      username: process.env.SSO_USER,
      password: process.env.SSO_PASS,
    },
  };

  if (!ssoConfig.credentials.username || !ssoConfig.credentials.password) {
    logger.error('❌ SSO credentials not found in .env');
    return { success: false, error: 'SSO credentials missing' };
  }

  try {
    const ssoResult = await ssoService.authenticate(ssoConfig);

    if (!ssoResult.success || !ssoResult.cookies) {
      logger.error('❌ SSO authentication failed:', ssoResult.error);
      return { success: false, error: ssoResult.error };
    }

    logger.info('✅ SSO authentication successful');

    // Display new tokens for manual .env update
    console.log('\n🔑 New auth tokens (update your .env file):');
    console.log('# SSO-refreshed tokens');
    Object.entries(ssoResult.cookies).forEach(([key, value]) => {
      console.log(`${key}=${value}`);
    });
    console.log(`# Expires: ${ssoResult.expiresAt?.toISOString() || 'Unknown'}\n`);

    return {
      success: true,
      cookies: ssoResult.cookies,
      expiresAt: ssoResult.expiresAt,
    };
  } catch (error) {
    logger.error(
      '❌ SSO refresh failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Main diagnosis function
 */
async function diagnoseAuth() {
  console.log('🩺 Auth Token Diagnosis and Refresh Tool\n');

  try {
    // Step 1: Test current auth
    const authTest = await testCurrentAuth();

    if (authTest.valid) {
      console.log('✅ Current auth tokens are working!');
      console.log(`📊 Response status: ${authTest.status}`);
      if (authTest.data?.data) {
        console.log('📋 GraphQL data received:', JSON.stringify(authTest.data.data, null, 2));
      }
      if (authTest.data?.errors) {
        console.log('⚠️ GraphQL errors:', authTest.data.errors);
      }

      console.log('\n🎉 Real vnext validation is ready to proceed with current tokens!');
      return;
    }

    // Step 2: Show diagnosis
    console.log('❌ Current auth tokens are not working');
    console.log(`📋 Reason: ${authTest.reason}`);
    if (authTest.status) {
      console.log(`📊 HTTP Status: ${authTest.status}`);
    }
    if (authTest.redirected) {
      console.log(`🔀 Redirected to: ${authTest.redirected}`);
    }

    // Step 3: Attempt SSO refresh
    console.log('\n🔄 Attempting to refresh tokens with SSO...');
    const refreshResult = await refreshAuthWithSSO();

    if (refreshResult.success) {
      console.log('✅ SSO refresh successful!');
      console.log('📝 Please update your .env file with the new tokens shown above');
      console.log('🔄 Then re-run the vnext validation script');
    } else {
      console.log('❌ SSO refresh failed:', refreshResult.error);
      console.log('📝 Please manually update auth tokens in .env file');
      console.log('💡 You can get fresh tokens from:');
      console.log('   1. Browser developer tools (Application > Cookies)');
      console.log('   2. SSO authentication flow');
      console.log('   3. Contact team lead for current valid tokens');
    }
  } catch (error) {
    console.error(
      '❌ Auth diagnosis failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    process.exit(1);
  }
}

// Run diagnosis if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  diagnoseAuth();
}

export { diagnoseAuth, testCurrentAuth, refreshAuthWithSSO };
