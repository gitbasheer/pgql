#!/bin/bash

# Load environment variables
source .env

echo "🚀 Testing Apollo endpoint with curl..."
echo ""

# Test with all cookies
echo "Testing with all SSO cookies:"
curl -X POST https://pg.api.godaddy.com/v1/gql/customer \
  -H "Content-Type: application/json" \
  -H "x-app-key: vnext-dashboard" \
  -H "Accept: application/json" \
  -H "User-Agent: pg-migration-620/1.0.0" \
  -H "Cookie: auth_idp=$SSO_AUTH_IDP; cust_idp=$SSO_CUST_IDP; info_cust_idp=$SSO_INFO_CUST_IDP; info_idp=$SSO_INFO_IDP" \
  -d '{"query":"query { __typename }"}' \
  -s -v 2>&1 | grep -E "(< HTTP|< Location|^{|^<)"

echo ""
echo "Testing without cookies:"
curl -X POST https://pg.api.godaddy.com/v1/gql/customer \
  -H "Content-Type: application/json" \
  -H "x-app-key: vnext-dashboard" \
  -d '{"query":"query { __typename }"}' \
  -s -i | head -10