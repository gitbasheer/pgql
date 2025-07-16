# SSO Cookie Update Guide

## Current Status

The SSO authentication is properly implemented, but the cookies in your .env file appear to be expired. When cookies are expired, you get a 302 redirect to the SSO login page.

## How to Update Your SSO Cookies

1. **Use your working curl command** to verify it still works:

   ```bash
   curl 'https://pg.api.godaddy.com/v1/gql/customer' \
     -H 'content-type: application/json' \
     -b 'auth_idp=YOUR_AUTH_IDP; cust_idp=YOUR_CUST_IDP; info_cust_idp=YOUR_INFO_CUST_IDP; info_idp=YOUR_INFO_IDP' \
     --data-raw '{"query":"query { __typename }","operationName":null}'
   ```

2. **Extract the cookie values** from your working curl command:
   - `auth_idp` - The main authentication token (starts with `eyJhbGci...`)
   - `cust_idp` - Customer identification token
   - `info_cust_idp` - URL-encoded customer info
   - `info_idp` - URL-encoded identity info

3. **Update your .env file** with the fresh cookie values:

   ```env
   SSO_AUTH_IDP=eyJhbGci... (copy the full value)
   SSO_CUST_IDP=eyJhbGci... (copy the full value)
   SSO_INFO_CUST_IDP=%7B%22typ%22%3A... (copy the full URL-encoded value)
   SSO_INFO_IDP=%7B%22typ%22%3A... (copy the full URL-encoded value)
   ```

4. **Test the updated cookies**:
   ```bash
   npx tsx test-apollo-minimal.ts
   ```

## Expected Results

With fresh cookies, you should see:

- Status: 200 (not 302)
- A valid GraphQL response

## Query Format

The working query format requires:

- `operationName` field (can be null for simple queries, or match the query name)
- Proper GraphQL query syntax
- Required headers: `content-type`, `cookie`, `origin`, `referer`

## Test Script

Use `test-apollo-minimal.ts` to quickly verify your cookies are working.
