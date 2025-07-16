# Vnext Sample Testing System

## Overview

The vnext sample testing system automatically extracts and tests all GraphQL queries from the `data/sample_data/` directory, treating it as if it were a real repository with the two schemas (`schema.graphql` and `billing-schema.graphql`) provided.

## Features

### 🔍 Automatic Query Extraction

- **36 queries extracted** from 7 sample data files
- **Query name resolution** using queryNames.js mapping
- **Fragment dependency detection**
- **Variable pattern analysis**
- **Endpoint classification** (productGraph vs offerGraph)

### 📊 Schema Integration

- **Product Graph Schema** (`schema.graphql`) - Main dashboard queries
- **Offer Graph Schema** (`billing-schema.graphql`) - Billing and commerce queries
- **Automatic endpoint detection** based on query content

### 🎯 Test Scenarios

1. **Dashboard Queries** - Core venture/user queries (Product Graph)
2. **Billing Queries** - Commerce/subscription queries (Offer Graph)
3. **Fragment Resolution** - Complex queries with fragments
4. **Variable Pattern** - Queries with different variable types

## API Endpoint

### `POST /api/test-vnext-sample`

Tests all queries from `data/sample_data/` directory.

**Request:**

```json
{
  "scenario": "Dashboard Queries (Product Graph)",
  "endpoint": "https://api.godaddy.com/v1/product-graph",
  "authHeaders": {
    "Authorization": "Bearer token",
    "Cookie": "auth_idp=...; cust_idp=..."
  }
}
```

**Response:**

```json
{
  "testId": "vnext-test-1752559123456",
  "message": "Vnext sample testing completed",
  "extraction": {
    "totalQueries": 36,
    "totalFragments": 0,
    "schemas": ["productGraph", "offerGraph"],
    "testScenarios": [
      "Dashboard Queries (Product Graph)",
      "Billing Queries (Offer Graph)",
      "Fragment Resolution Test",
      "Variable Pattern Test"
    ]
  },
  "results": [
    {
      "queryName": "getVentureHomeDataAllDashboard",
      "queryType": "query",
      "endpoint": "productGraph",
      "fragmentCount": 1,
      "variableCount": 0,
      "status": "success",
      "responseTime": 245,
      "file": "shared-graph-queries-v1.js"
    }
  ],
  "summary": {
    "total": 5,
    "passed": 5,
    "failed": 0,
    "productGraphQueries": 4,
    "offerGraphQueries": 1
  }
}
```

## File Structure

```
data/
├── schema.graphql              # Product Graph schema
├── billing-schema.graphql      # Offer Graph schema
└── sample_data/
    ├── queryNames.js           # Query name mappings
    ├── fragments.js            # Core fragments
    ├── profileFragments.js     # Profile-specific fragments
    ├── offer-graph-queries.js  # Billing/commerce queries
    ├── quicklinks.js           # Quick links queries
    ├── shared-graph-queries-v1.js  # V1 dashboard queries
    ├── shared-graph-queries-v2.js  # V2 dashboard queries
    └── shared-graph-queries-v3.js  # V3 dashboard queries
```

## Extracted Queries

### Product Graph Queries (34 queries)

- **Dashboard Queries**: Venture home data, user data, client-side data
- **Venture Queries**: By ID, by domain, with/without profile data
- **User Queries**: Account info, preferences, venture lists
- **Project Queries**: Project counts, groups, entitlements
- **Website Queries**: Website data, domain info, quicklinks

### Offer Graph Queries (2 queries)

- **FindUnifiedBillDetails**: Subscription and billing details
- **ModifyBasketWithOptions**: Basket modification mutations

## Query Patterns Detected

### Variable Patterns

- `$ventureId: UUID!` - Primary venture identifier
- `$domainName: String!` - Domain name lookup
- `$subscriptionId: String` - Billing subscription ID
- `$enableOptimizationFlow: Boolean` - Feature flags

### Fragment Dependencies

- `ventureFragment` - Full venture data with profile
- `userFragmentProjectCounts` - Project counts by group
- `websitesFragment` - Website product data
- `profileInfinityStoneFragment` - AI-enhanced profile data

### Conditional Logic

- **Infinity Stone Experiments**: AI-enhanced data based on flags
- **Version Selection**: V1, V2, V3 query variants
- **Profile Data**: With/without profile based on options
- **AIRO Market**: Special handling for AIRO markets

## Test Scenarios

### 1. Dashboard Queries (Product Graph)

Tests core dashboard functionality with venture and user queries.

**Sample Queries:**

- `getVentureHomeDataAllDashboard`
- `getVentureHomeDataByVentureIdDashboard`
- `getUserDataDashboardV3`
- `getClientSideDataDashboardV3`
- `getVentureSkeleton`

### 2. Billing Queries (Offer Graph)

Tests billing and commerce functionality.

**Sample Queries:**

- `FindUnifiedBillDetails`
- `ModifyBasketWithOptions`

### 3. Fragment Resolution Test

Tests queries with complex fragment dependencies.

**Features:**

- Fragment interpolation validation
- Nested fragment resolution
- Fragment-based conditional logic

### 4. Variable Pattern Test

Tests queries with different variable types and patterns.

**Features:**

- Required vs optional variables
- Complex variable types
- Variable validation

## Usage

### Start the Server

```bash
cd ui/
./start-ui-full.sh
```

### Test via API

```bash
curl -X POST http://localhost:3001/api/test-vnext-sample \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Test via UI

1. Open http://localhost:5173
2. Click "Test Vnext Sample" button
3. View real-time logs and results

## Benefits

1. **Comprehensive Testing**: All 36 queries from sample data tested
2. **Schema Validation**: Validates against both productGraph and offerGraph schemas
3. **Pattern Detection**: Identifies and tests different query patterns
4. **Realistic Scenarios**: Tests actual vnext dashboard query patterns
5. **Fragment Support**: Handles complex fragment dependencies
6. **Variable Validation**: Tests different variable patterns and types

This system provides a comprehensive test suite for the vnext dashboard migration by testing all actual queries against the provided schemas, ensuring complete coverage of the migration scenarios.
