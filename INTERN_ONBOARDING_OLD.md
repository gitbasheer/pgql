# GraphQL Migration Tool - Intern Onboarding Guide

Welcome to the GraphQL Migration Tool project! This guide will walk you through everything you need to know about our codebase, architecture, and how to test every feature.

## Table of Contents
1. [Project Overview](#project-overview)
2. [System Requirements](#system-requirements)
3. [Environment Setup](#environment-setup)
4. [Architecture Overview](#architecture-overview)
5. [Core Components](#core-components)
6. [Manual Testing Guide](#manual-testing-guide)
7. [Troubleshooting](#troubleshooting)

---

## Project Overview

### What is this project?
An automated pipeline that migrates GraphQL queries from deprecated schema fields to new ones. It turns weeks of manual work into a 5-minute automated process.

### Problem it solves
- GraphQL APIs deprecate fields over time
- Manual migration is error-prone and time-consuming
- Our queries use complex templates making them hard to find
- Need zero breaking changes in production

### Key Features
- Automatic query discovery from JavaScript/TypeScript files
- Schema-driven field transformation
- Response compatibility layer
- Real-time UI dashboard
- Multi-schema support (billing + customer APIs)

---

## System Requirements

### Required Software
```bash
# Check these are installed:
node --version          # Need v18+ (we use v24.2.0)
npm --version          # Need v8+
git --version          # Any recent version
```

### Install if missing:
- **Node.js**: Download from https://nodejs.org/
- **Git**: Download from https://git-scm.com/
- **Code Editor**: VS Code recommended (https://code.visualstudio.com/)

---

## Environment Setup

### Step 1: Clone the Repository
```bash
git clone <repository-url>
cd pg-migration-620
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Build the Project
```bash
npm run build
```

### Step 4: Create Environment File
```bash
cp .env.example .env
```

### Step 5: Configure Authentication
Edit `.env` and add your SSO cookies:
```env
# These are required for API access
auth_idp=<your-auth-cookie>
cust_idp=<your-cust-cookie>
info_cust_idp=<your-info-cust-cookie>
info_idp=<your-info-idp-cookie>
```

**How to get cookies:**
1. Log into the production app
2. Open DevTools → Application → Cookies
3. Copy the 4 cookie values

---

## Architecture Overview

### Stack Layers

```
┌─────────────────────────────────────┐
│          UI Dashboard               │  ← Browser-based monitoring
├─────────────────────────────────────┤
│          UI Server                  │  ← Node.js API server
├─────────────────────────────────────┤
│          CLI Commands               │  ← npm scripts
├─────────────────────────────────────┤
│      Core Pipeline Engine           │  ← TypeScript modules
├─────────────────────────────────────┤
│   Extraction │ Transform │ Validate │  ← Pipeline stages
├─────────────────────────────────────┤
│      GraphQL Schema Files           │  ← API definitions
└─────────────────────────────────────┘
```

### Directory Structure
```
pg-migration-620/
├── src/                    # Source code
│   ├── cli/               # Command-line interfaces
│   ├── core/              # Core business logic
│   │   ├── extraction/    # Query finding logic
│   │   ├── transformation/# Query modification
│   │   ├── validator/     # Schema validation
│   │   └── mapping/       # Response mapping
│   └── utils/             # Helper functions
├── data/                  # Test data and schemas
│   ├── sample_data/       # Example JS files
│   └── schema.graphql     # GraphQL schemas
├── dist/                  # Compiled JavaScript
├── tests/                 # Test files
└── docs/                  # Documentation
```

---

## Core Components

### 1. Query Extraction (`src/core/extraction/`)
**Purpose**: Find all GraphQL queries in your codebase

**Key Classes**:
- `UnifiedExtractor`: Main extraction engine
- `TemplateResolver`: Resolves template variables
- `FragmentResolver`: Handles GraphQL fragments

**How it works**:
1. Scans JS/TS files for GraphQL queries
2. Resolves template literals like `${queryNames.userDetails}`
3. Substitutes fragment references
4. Outputs complete query definitions

### 2. Query Transformation (`src/core/transformation/`)
**Purpose**: Update queries to use new schema fields

**Key Classes**:
- `QueryTransformer`: Applies field transformations
- `MigrationEngine`: Orchestrates transformations
- `TransformationRules`: Defines field mappings

**Transformations**:
- `displayName` → `name`
- `ventures` → `ventures(first: 10)`
- Adds `__typename` fields
- Handles nested field changes

### 3. Schema Validation (`src/core/validator/`)
**Purpose**: Ensure queries work with GraphQL schemas

**Key Classes**:
- `SchemaValidator`: Single schema validation
- `MultiSchemaValidator`: Routes to correct schema
- `QuerySchemaClassifier`: Detects which API a query uses

**Features**:
- Validates against multiple schemas
- Provides detailed error messages
- Suggests fixes for common issues

### 4. Response Mapping (`src/core/mapping/`)
**Purpose**: Transform new API responses to old format

**Key Classes**:
- `ResponseMapper`: Field-level transformations
- `ResponseComparator`: Detects differences
- `AlignmentGenerator`: Creates transform functions

**Ensures**:
- Zero breaking changes
- Backward compatibility
- Seamless migration

### 5. UI Dashboard (`pg-migration-ui.html`)
**Purpose**: Visual monitoring and control

**Features**:
- Real-time pipeline output
- Auth testing
- Query viewer (before/after)
- One-click operations

---

## Manual Testing Guide

### Prerequisites Check
```bash
# Verify installation
npm run doctor

# If any issues, fix with:
npm install
npm run build
```

### Test 1: Basic Pipeline Test
**Purpose**: Verify core functionality works

```bash
# 1. Extract queries from sample data
npm run extract -- --input data/sample_data

# Expected output:
# ✓ Found 35 queries in 8 files
# ✓ Extracted queries saved to extracted-queries.json

# 2. Transform queries
npm run transform

# Expected output:
# ✓ Transformed 35 queries
# ✓ Applied deprecation fixes
# ✓ Saved to transformed/

# 3. Validate queries
npm run validate

# Expected output:
# ✓ 3/33 queries valid (known issue - need schemas)
# ✓ Validation report saved
```

### Test 2: UI Dashboard Test
**Purpose**: Verify UI monitoring works

```bash
# 1. Start UI server
./start-ui.sh

# Browser opens automatically
# If not, go to: http://localhost:3456

# 2. Test Auth Configuration
# Click "Test Auth Config" button
# Expected: ✅ SSO authentication configured

# 3. Test Query Extraction
# Click "Extract Queries"
# Expected: Real-time output showing extraction

# 4. View Queries
# After extraction, click any query name
# Toggle "Show Transformed" to see changes
```

### Test 3: Multi-Schema Validation Test
**Purpose**: Verify billing vs customer schema routing

```bash
# 1. Run schema classification
npx tsx classify-queries.ts

# Expected output:
# Customer Schema: 31 queries
# Billing Schema: 2 queries

# 2. Run multi-schema validation
npx tsx validate-multi-schema.ts

# Expected output:
# Billing: 2/2 valid (100%)
# Customer: 1/31 valid (3%)
```

### Test 4: PR Generation Test
**Purpose**: Verify production-ready output

```bash
# 1. Generate PR files (two options)
node generate-realistic-pr.js  # Sample PR with realistic data
# OR
npm run generate-pr -- --input data/sample_data  # Full PR from CLI

# Expected output:
# ✓ Created pr-first/original/
# ✓ Created pr-first/migrated/
# ✓ Created pr-first/response-transformers.js

# 2. Review generated files
ls -la pr-first/

# 3. Check diff is minimal
diff pr-first/original/queries.js pr-first/migrated/queries.js
```

### Test 5: Fragment Resolution Test
**Purpose**: Verify fragment handling

```bash
# 1. Extract with fragments
npx tsx extract-with-fragments.ts

# Expected output:
# ✓ Found 9 fragments
# ✓ Resolved in 35 queries

# 2. Check fragment usage
cat extracted-queries-with-fragments.json | grep "fragment ventureFields"
```

### Test 6: Response Mapping Test
**Purpose**: Verify backward compatibility

```bash
# 1. Test response transformer
node -e "
const transformer = require('./pr-first/response-transformers.js');
const oldResponse = { data: { ventures: [{displayName: 'Test'}] }};
const newResponse = transformer.transformVentureResponse(oldResponse);
console.log(JSON.stringify(newResponse, null, 2));
"

# Expected: displayName field restored in output
```

### Test 7: Performance Test
**Purpose**: Verify speed and efficiency

```bash
# 1. Time full pipeline
time npm run pipeline

# Expected: < 30 seconds for sample data

# 2. Check memory usage
npm run extract -- --debug

# Watch for memory warnings
```

### Test 8: Error Handling Test
**Purpose**: Verify graceful failures

```bash
# 1. Test with missing input
npm run extract -- --input /nonexistent

# Expected: Clear error message

# 2. Test with invalid schema
npm run validate -- --schema /invalid.graphql

# Expected: Schema loading error

# 3. Test with no auth
mv .env .env.backup
npm run extract
mv .env.backup .env

# Expected: Auth configuration warning
```

### Test 9: End-to-End Flow Test
**Purpose**: Complete production simulation

```bash
# 1. Clean start
rm -rf extracted-queries.json transformed/ pr-first/

# 2. Run full pipeline
npm run pipeline

# 3. Start UI and verify
./start-ui.sh

# 4. In UI, click through:
#    - Test Auth ✓
#    - Extract ✓  
#    - Transform ✓
#    - Validate ✓

# 5. Generate PR (choose one)
node generate-realistic-pr.js  # Sample PR
# OR  
npm run generate-pr           # CLI PR generator

# 6. Review output
cat pr-first/MIGRATION_SUMMARY.md
```

---

## Troubleshooting

### Common Issues

#### 1. "Module not found" errors
```bash
# Solution:
npm install
npm run build
```

#### 2. "Auth not configured" 
```bash
# Check .env file has all 4 cookies:
cat .env | grep idp

# Test auth:
curl -X POST http://localhost:3456/api/test-auth
```

#### 3. "Cannot find schema"
```bash
# Verify schema files exist:
ls -la data/*.graphql

# If missing, ask team for schemas
```

#### 4. UI server won't start
```bash
# Kill existing process:
pkill -f "node ui-server"

# Check port 3456 is free:
lsof -i :3456

# Restart:
./start-ui.sh
```

#### 5. Validation failures
```bash
# This is expected! We need production schemas
# For now, check multi-schema validation:
npx tsx validate-multi-schema.ts
```

### Debug Mode
```bash
# Run any command with debug output:
DEBUG=* npm run extract

# Check logs:
tail -f *.log
```

### Getting Help

1. **Check existing docs**:
   - `README.md` - Project overview
   - `ARCHITECTURE.md` - Technical design
   - `status710.md` - Current status

2. **Ask the team**:
   - UI issues → Fernando
   - Validation → Jade  
   - Response mapping → Beshi
   - Performance → Morgan
   - General → Senior Engineer

3. **File an issue**:
   - Use GitHub issues for bugs
   - Include error messages
   - Provide reproduction steps

---

## Next Steps

1. **Run all tests** in order above
2. **Break something** on purpose to understand error handling
3. **Read the code** starting with `src/cli/`
4. **Make a small fix** (typo, comment, etc.)
5. **Shadow a team member** during their work

## Key Commands Reference
```bash
# Development
npm install              # Install dependencies
npm run build           # Compile TypeScript
npm run dev             # Watch mode
npm test                # Run tests

# Pipeline
npm run extract         # Find queries
npm run transform       # Update queries
npm run validate        # Check schemas
npm run pipeline        # Run all steps

# UI
./start-ui.sh           # Launch dashboard
npm run ui              # Alternative launch

# Analysis
npx tsx classify-queries.ts      # Schema detection
npx tsx validate-multi-schema.ts # Multi validation

# Production
node generate-realistic-pr.js    # Create PR
```

Welcome to the team! 🚀