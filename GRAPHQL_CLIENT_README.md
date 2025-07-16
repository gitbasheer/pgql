# GraphQL Client for GoDaddy API

A clean, reliable, and easy-to-use GraphQL client for interacting with GoDaddy's GraphQL APIs.

## Features

- 🔐 Cookie-based authentication (from .env file)
- 📦 Response baseline saving and comparison
- 🎯 Type-safe queries with Apollo Client
- 🚀 Simple high-level API wrapper
- 🔧 Low-level client for custom queries
- 📝 Automatic response caching

## Quick Start

### 1. Install Dependencies

```bash
./setup-graphql-client.sh
```

Or manually:

```bash
npm install @apollo/client graphql node-fetch
```

### 2. Configure Authentication

1. Copy `.env.example` to `.env`
2. Get your cookies from GoDaddy:
   - Log into dashboard.godaddy.com
   - Open DevTools > Network tab
   - Find any GraphQL request to `pg.api.godaddy.com`
   - Right-click > Copy > Copy as cURL
   - Extract the cookie string after the `-b` flag
   - Paste it as `GODADDY_COOKIES` in your `.env` file

### 3. Use the Client

#### Simple Usage (High-Level API)

```typescript
import { GoDaddyAPI } from './src/core/testing/GoDaddyAPI';

const api = new GoDaddyAPI();

// Get all ventures
const ventures = await api.getVentures();

// Get specific venture
const venture = await api.getVentureById('venture-id-here');

// Get quick links data
const quickLinks = await api.getQuickLinksData('venture-id-here');

// Custom query
const result = await api.rawQuery(`
  query MyQuery {
    user {
      ventures {
        id
        profile {
          name
        }
      }
    }
  }
`);
```

#### Advanced Usage (Low-Level Client)

```typescript
import { GraphQLClient } from './src/core/testing/GraphQLClient';

const client = new GraphQLClient({
  cookieString: process.env.GODADDY_COOKIES,
  baselineDir: './my-baselines',
});

// Execute query and save baseline
const result = await client.query(
  `query GetVentures { ... }`,
  { variables },
  true, // save baseline
);

// Compare with baseline
const comparison = await client.compareWithBaseline(query, variables, newData);
```

#### Raw Request (Exact cURL Replication)

```typescript
const response = await client.rawRequest('operationName', 'query { ... }', { variables });
```

## API Reference

### GoDaddyAPI Class

High-level wrapper for common operations:

- `getVentures()` - Get all ventures
- `getVentureById(id)` - Get specific venture
- `updateVisitCounts(id, lastVisited, numVisits)` - Update visit counts
- `getQuickLinksData(id)` - Get quick links data
- `rawQuery(query, variables)` - Execute custom query
- `rawMutation(mutation, variables)` - Execute custom mutation
- `compareWithBaseline(query, variables)` - Compare with saved baseline

### GraphQLClient Class

Low-level client for full control:

- `query(query, variables, saveBaseline)` - Execute GraphQL query
- `mutate(mutation, variables, saveBaseline)` - Execute GraphQL mutation
- `rawRequest(operationName, query, variables)` - Raw HTTP request
- `loadBaseline(query, variables)` - Load saved baseline
- `compareWithBaseline(query, variables, data)` - Compare data with baseline

## Testing

Run the test suite:

```bash
npx tsx test-godaddy-api.ts
```

## Examples

See `example-godaddy-api-usage.ts` for more usage examples.

## Baseline Management

Baselines are automatically saved in the configured directory (default: `./baselines`). Each baseline is named with a hash of the query and variables for easy retrieval.

Baseline files contain:

- Timestamp
- Original query
- Variables used
- Response data

## Error Handling

The client provides comprehensive error handling:

- Network errors are caught and logged
- GraphQL errors are displayed but don't throw
- All errors include detailed messages for debugging

## Configuration

Configure via constructor options or environment variables:

```typescript
const client = new GraphQLClient({
  endpoint: 'https://custom-endpoint.com/graphql',
  cookieString: 'custom-cookies',
  appKey: 'custom-app-key',
  clientName: 'custom-client-name',
  baselineDir: './custom-baselines',
});
```

## Security Notes

- Never commit your `.env` file with real cookies
- Cookies expire - update them regularly
- Use environment-specific cookie values
- Consider using a secrets manager in production
