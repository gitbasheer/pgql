# pgql GraphQL Migration Tool - Demo Script
Version: 1.0
Date: July 16, 2025
Author: O (Operational Head Engineer)

## Overview
This demo script walks through the complete pgql pipeline for migrating GraphQL queries from vnext-dashboard, showcasing both UI and CLI capabilities.

## Prerequisites
- Node.js 18+ installed
- pnpm package manager
- Access to vnext-dashboard repository
- Valid authentication credentials (SSO/API keys)

## Demo Flow

### 1. Environment Setup (2 minutes)
```bash
# Clone and setup pgql
git clone <repo-url> pgql
cd pgql
pnpm install
pnpm build

# Start the UI dashboard
cd ui
pnpm dev
# UI available at http://localhost:5173
```

### 2. CLI Pipeline Demo (5 minutes)

#### a. Extract Queries from vnext-dashboard
```bash
# Extract all GraphQL queries
pg-cli extract --repo ../vnext-dashboard \
  --output extracted-queries.json \
  --strategies hybrid \
  --resolve-fragments \
  --parallel

# Expected output:
# ✅ Extracted 1,247 queries from 156 files
# ✅ Resolved 89 fragments
# ✅ Identified 23 dynamic query patterns
# Time: 12.3s
```

#### b. Validate Against Current Schema
```bash
# Validate extracted queries
pg-cli validate --queries extracted-queries.json \
  --schema ./data/schema.graphql \
  --endpoint productGraph \
  --real-api

# Expected output:
# ✅ 1,189 queries validated successfully
# ⚠️  58 queries have deprecation warnings
# ❌ 0 queries failed validation
```

#### c. Transform Queries
```bash
# Transform to new schema
pg-cli transform --queries extracted-queries.json \
  --target-schema ./data/billing-schema.graphql \
  --output transformed-queries.json \
  --generate-utils

# Expected output:
# ✅ Transformed 1,247 queries
# ✅ Generated 15 utility functions
# ✅ Created backward compatibility mappers
# ⚠️  12 queries require manual review
```

#### d. Generate Pull Request
```bash
# Create PR with changes
pg-cli generate-pr --queries transformed-queries.json \
  --branch feature/graphql-migration \
  --title "Migrate GraphQL queries to new schema" \
  --draft

# Expected output:
# ✅ Created branch: feature/graphql-migration
# ✅ Updated 156 files
# ✅ Generated utils/graphql-mappers.ts
# ✅ PR created: https://github.com/org/repo/pull/1234
```

### 3. UI Dashboard Demo (5 minutes)

#### a. Real-time Monitoring
1. Navigate to http://localhost:5173
2. Click "Start New Migration"
3. Select vnext-dashboard repository
4. Watch real-time progress:
   - File processing progress bar
   - Live query extraction count
   - Fragment resolution status
   - Error logs streaming

#### b. Query Analysis View
1. Click on "Extracted Queries" tab
2. Demonstrate:
   - Search/filter by operation name
   - View query details and dependencies
   - See endpoint classification (productGraph vs offerGraph)
   - Identify deprecated field usage

#### c. Transformation Preview
1. Click "Transform" button
2. Show side-by-side diff view:
   - Original query
   - Transformed query
   - Generated utility functions
   - Confidence scores

#### d. Real API Testing
1. Click "Test with Real API" 
2. Enter test credentials
3. Run sample queries:
   - Show response validation
   - Performance metrics
   - A/B testing setup

### 4. Progressive Rollout Demo (3 minutes)

```bash
# Start progressive migration
pg-cli rollout --pr 1234 \
  --initial-percentage 5 \
  --increment 10 \
  --health-check-interval 300

# Monitor in UI:
# - Rollout percentage gauge
# - Error rate graphs
# - Automatic rollback triggers
# - Health check status
```

### 5. Key Features Showcase (2 minutes)

#### a. Error Recovery
```bash
# Simulate failure and rollback
pg-cli rollout --rollback --pr 1234 --reason "High error rate detected"
```

#### b. Performance Monitoring
- Show performance dashboard in UI
- Highlight query execution times
- Display cache hit rates

#### c. Configuration Options
```bash
# Show config file
cat migration.config.yaml

# Key options:
# - parallel processing
# - custom fragment paths  
# - endpoint mappings
# - validation rules
```

## Expected Questions & Answers

**Q: How long does migration take for large repos?**
A: vnext-dashboard (1,200+ queries) takes ~15 seconds with parallel processing.

**Q: Can we customize the transformation rules?**
A: Yes, via migration.config.yaml and custom transformer plugins.

**Q: What about breaking changes?**
A: The tool generates backward compatibility utils and highlights breaking changes for manual review.

**Q: How does progressive rollout work?**
A: Uses Hivemind A/B testing to gradually increase traffic, with automatic rollback on errors.

## Demo Wrap-up (1 minute)

1. Summarize benefits:
   - 95% automation of GraphQL migration
   - Real-time monitoring and control
   - Safety-first with progressive rollout
   - Full audit trail

2. Next steps:
   - Schedule team training
   - Plan production rollout
   - Customize for specific needs

## Troubleshooting Tips

If extraction fails:
```bash
# Check file permissions
# Verify GraphQL client library support
# Review logs: ./logs/extraction.log
```

If UI doesn't load:
```bash
# Check port 5173 availability
# Verify backend is running (port 8080)
# Clear browser cache
```

## Resources
- Documentation: ./docs/USER_GUIDE.md
- API Reference: ./docs/TECHNICAL-OVERVIEW.md
- Support: #pgql-support channel