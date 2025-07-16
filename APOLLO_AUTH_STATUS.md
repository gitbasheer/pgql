# Apollo Authentication Status Report

## Summary

We've successfully implemented SSO authentication support in the codebase, but the GoDaddy GraphQL endpoint at `https://pg.api.godaddy.com/v1/gql/customer` is returning 400 "Invalid request" errors for all test queries.

## What's Working

1. ✅ SSO cookie authentication is implemented in `AuthHelper.ts`
2. ✅ SSO cookies are being loaded from `.env` file
3. ✅ Required `x-app-key: vnext-dashboard` header is included
4. ✅ All 4 required cookies are being sent (auth_idp, cust_idp, info_cust_idp, info_idp)
5. ✅ ResponseCaptureService is configured to use SSO authentication

## Current Issue

- Getting 400 "Invalid request" errors from the GraphQL endpoint
- Same error occurs with and without authentication
- This suggests the issue is with the request format, not authentication

## Test Results

```bash
# All queries return the same error:
Status: 400
Response: {"error":{"reason":"Invalid request"}}
```

## Possible Causes

1. The GraphQL endpoint might require additional parameters or headers
2. The endpoint might expect a different request format
3. The endpoint might be restricted to specific queries or operations
4. The cookies might be expired or for a different environment
5. The endpoint might require additional authentication beyond cookies

## Files Updated

- `/src/core/validator/AuthHelper.ts` - Updated to use SSO cookies from .env
- `/src/core/extraction/index.ts` - Fixed module exports
- Created multiple test scripts:
  - `test-direct-apollo.ts` - Tests with all 4 SSO cookies
  - `test-apollo-simple.ts` - Tests different auth methods
  - `test-apollo-real.ts` - Tests with real query patterns
  - `test-apollo-curl.sh` - Direct curl tests

## Next Steps

To successfully authenticate and query the Apollo endpoint, you may need to:

1. **Verify the endpoint URL** - Confirm `https://pg.api.godaddy.com/v1/gql/customer` is correct
2. **Check cookie validity** - The SSO cookies in .env might be expired
3. **Review API documentation** - The endpoint might have specific requirements not documented in the code
4. **Contact the API team** - They might need to whitelist your account or provide specific access
5. **Try a different endpoint** - There might be a staging or test endpoint available

## Environment Variables Used

```env
APOLLO_PG_ENDPOINT=https://pg.api.godaddy.com/v1/gql/customer
SSO_AUTH_IDP=<your_auth_idp_cookie>
SSO_CUST_IDP=<your_cust_idp_cookie>
SSO_INFO_CUST_IDP=<your_info_cust_idp_cookie>
SSO_INFO_IDP=<your_info_idp_cookie>
```

## Test Commands

```bash
# Direct test with all cookies
npx tsx test-direct-apollo.ts

# Test different auth methods
npx tsx test-apollo-simple.ts

# Test with real query patterns
npx tsx test-apollo-real.ts

# Test with curl
./test-apollo-curl.sh
```
