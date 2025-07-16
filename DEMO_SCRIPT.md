# Demo Script: vnext-dashboard GraphQL Migration Pipeline

**Target Audience**: Engineering teams, stakeholders, product managers  
**Duration**: 15-20 minutes  
**Prerequisites**: pgql v0.1.0, Node.js 18+, vnext-dashboard repository access

## Overview

This demo showcases the pgql migration system running against the vnext-dashboard codebase, demonstrating the complete pipeline from query extraction to automated PR generation.

## Setup

### 1. Environment Preparation
```bash
# Clone and setup pgql (if not already done)
git clone https://github.com/your-org/pgql
cd pgql
pnpm install
pnpm build

# Clone vnext-dashboard (demo target)
git clone https://github.com/your-org/vnext-dashboard
cd vnext-dashboard
pnpm install
```

### 2. Configuration
```bash
# Create migration configuration
cat > migration.config.yaml << EOF
source:
  include: ["src/**/*.{ts,tsx,js,jsx}"]
  exclude: ["**/*.test.*", "**/node_modules/**"]

confidence:
  automatic: 90
  semiAutomatic: 70
  manual: 0

rollout:
  initial: 1
  increment: 10
  interval: "1h"
  maxErrors: 5

safety:
  requireApproval: false
  autoRollback: true
  healthCheckInterval: 60
EOF
```

## Demo Script

### Phase 1: Analysis & Discovery (3-4 minutes)

#### 1.1 Query Extraction
```bash
# Extract all GraphQL operations from vnext-dashboard
pg-cli analyze operations --source ./src --verbose

# Expected output:
# ✅ Discovered 847 GraphQL operations
# ├── Queries: 623 (73.6%)
# ├── Mutations: 189 (22.3%)
# └── Subscriptions: 35 (4.1%)
# 
# 📊 Distribution:
# ├── Product Graph: 756 operations (89.3%)
# ├── Offer Graph: 91 operations (10.7%)
# 
# 🔍 Patterns detected:
# ├── Hook usage: 623 operations
# ├── Component usage: 224 operations
# └── Template literals: 534 operations
```

**Key talking points:**
- Automatic endpoint classification (productGraph vs offerGraph)
- Pattern-based query naming
- Source AST preservation for transformations

#### 1.2 Schema Analysis
```bash
# Analyze deprecations against production schemas
pg-cli analyze deprecations --schema ./schema/product-graph.graphql

# Expected output:
# 🚨 Found 23 deprecated fields affecting 156 operations:
# 
# High Impact (requires immediate action):
# ├── User.email → User.emailAddress (89 operations)
# ├── Venture.customerId → Venture.customer.id (34 operations)
# 
# Medium Impact (plan for next quarter):
# ├── Domain.registrantContact → Domain.contacts.registrant (18 operations)
# 
# Low Impact (future deprecation):
# ├── Product.legacyStatus → Product.status (15 operations)
```

**Key talking points:**
- Real schema validation against production endpoints
- Impact analysis and prioritization
- Breaking vs non-breaking changes

### Phase 2: Transformation Planning (4-5 minutes)

#### 2.1 Confidence Scoring
```bash
# Generate transformation confidence scores
pg-cli transform queries --source ./src --dry-run --min-confidence 70

# Expected output:
# 🎯 Transformation Analysis Complete
# 
# Automatic (95+ confidence): 134 operations
# ├── Simple field renames: 89 operations
# ├── Enum value updates: 23 operations
# ├── Non-breaking additions: 22 operations
# 
# Semi-Automatic (70-94 confidence): 78 operations
# ├── Complex field mappings: 45 operations
# ├── Nested object changes: 33 operations
# 
# Manual Review Required (<70 confidence): 44 operations
# ├── Breaking type changes: 12 operations
# ├── Schema restructuring: 18 operations
# ├── Business logic changes: 14 operations
```

**Key talking points:**
- ML-powered confidence scoring
- Risk assessment and categorization
- Human oversight for complex changes

#### 2.2 Generated Mapping Utils
```bash
# Preview generated utility functions
pg-cli transform queries --source ./src --preview-utils

# Expected output shows generated files:
# 📁 Generated utilities in ./src/utils/migration/:
# ├── userFieldMappers.ts (89 operations)
# ├── ventureFieldMappers.ts (34 operations)
# ├── domainFieldMappers.ts (18 operations)
```

**Sample generated utility:**
```typescript
// src/utils/migration/userFieldMappers.ts
export const mapUserEmailField = (response: any) => {
  if (response?.user?.email) {
    response.user.emailAddress = response.user.email;
    delete response.user.email;
  }
  return response;
};
```

### Phase 3: Progressive Rollout (3-4 minutes)

#### 3.1 Feature Flag Generation
```bash
# Apply transformations with progressive rollout
pg-cli apply --rollout-percentage 1 --enable-safety

# Expected output:
# 🚀 Progressive Rollout Initiated
# 
# Created feature flags:
# ├── migration.user.email_to_emailAddress (1% traffic)
# ├── migration.venture.customerId_to_customer_id (1% traffic)
# 
# Rollback plan created: rollback-plan-20250716.json
# Health monitoring enabled: 60s intervals
```

**Key talking points:**
- Minimal blast radius (1% initial rollout)
- Automatic rollback triggers
- Real-time health monitoring

#### 3.2 Health Monitoring Dashboard
```bash
# Launch monitoring UI
pg-cli monitor --dashboard --port 3001

# Open http://localhost:3001
```

**Dashboard shows:**
- Real-time traffic split metrics
- Error rate comparison (control vs variant)
- Performance impact analysis
- GraphQL operation success rates

### Phase 4: Automated PR Generation (2-3 minutes)

#### 4.1 PR Creation
```bash
# Generate migration PR with full documentation
pg-cli migrate full --create-pr --branch migration/user-email-field

# Expected output:
# 📝 Migration PR Generated
# 
# Branch: migration/user-email-field
# Files changed: 23
# Operations updated: 89
# 
# 🔗 PR URL: https://github.com/your-org/vnext-dashboard/pull/1234
```

**Generated PR includes:**
- **Summary**: Migration overview with confidence scores
- **Files Changed**: Complete diff with explanations
- **Testing**: Automated test updates
- **Rollback Plan**: Step-by-step rollback instructions
- **Monitoring**: Links to health dashboards

#### 4.2 PR Content Preview
The generated PR contains:

```markdown
## GraphQL Migration: User.email → User.emailAddress

### Summary
- **Operations affected**: 89 queries across 23 files
- **Confidence score**: 96% (automatic)
- **Risk assessment**: Low
- **Estimated completion**: 2-3 hours

### Changes
- Added backward-compatible mapping utilities
- Updated GraphQL queries with new field names
- Generated A/B testing configuration
- Created rollback procedures

### Testing Plan
- [x] Unit tests updated (89 test files)
- [x] Integration tests passing
- [x] A/B test configuration validated
- [ ] Manual QA on staging environment

### Rollout Strategy
1. Deploy with 1% traffic split
2. Monitor for 24 hours
3. Gradual rollout: 1% → 10% → 50% → 100%
4. Automatic rollback if error rate > 0.1%
```

### Phase 5: Production Monitoring (2-3 minutes)

#### 5.1 Real-time Metrics
```bash
# Monitor migration in production
pg-cli monitor --operation migration.user.email_to_emailAddress --live

# Expected output:
# 📊 Live Migration Metrics (Last 5 minutes)
# 
# Traffic Split:
# ├── Control (old field): 99% (847 requests)
# ├── Variant (new field): 1% (8 requests)
# 
# Performance:
# ├── Control avg latency: 245ms
# ├── Variant avg latency: 251ms (+2.4%)
# ├── Error rate delta: 0.0%
# 
# Status: ✅ HEALTHY - Continuing rollout
```

#### 5.2 Automatic Rollout Progression
```bash
# Simulate successful rollout progression
# (In real scenario, this happens automatically)

pg-cli rollout --operation migration.user.email_to_emailAddress --increase-to 10

# Expected output:
# 🎯 Rollout Updated: 1% → 10%
# 
# ✅ Health checks passed
# ✅ Error rate within bounds (0.05% < 0.1%)
# ✅ Performance impact acceptable (+2.4% < +10%)
# 
# Next progression: 10% → 50% in 1 hour
```

## Expected Outcomes

### Success Metrics
- **Zero downtime** during migration
- **< 0.1% error rate** increase
- **< 10% performance** impact
- **Automated rollback** if thresholds exceeded
- **Complete audit trail** for compliance

### Generated Artifacts
1. **Migration PR** with full documentation
2. **Mapping utilities** for backward compatibility
3. **A/B test configuration** for safe rollout
4. **Rollback plan** with automated procedures
5. **Health monitoring** dashboards
6. **Compliance reports** for audit trails

## Troubleshooting Common Issues

### Issue: High confidence operation marked as manual
**Solution**: Check for complex nested transformations or business logic changes

### Issue: PR generation fails
**Solution**: Ensure proper Git configuration and repository permissions

### Issue: Health monitoring shows degraded performance
**Solution**: Automatic rollback will trigger; review mapping utilities for optimization

### Issue: Authentication errors during real API testing
**Solution**: Verify environment variables for API credentials

## Next Steps After Demo

1. **Pilot Program**: Start with low-risk operations (read-only queries)
2. **Team Training**: Onboard engineers on pgql CLI and workflows
3. **Integration**: Add pgql to CI/CD pipelines
4. **Monitoring**: Set up production dashboards and alerting
5. **Scale**: Gradually increase automation confidence thresholds

## Questions & Discussion

Typical questions and answers:

**Q: How does this compare to manual migration efforts?**
A: Reduces migration time from weeks to hours, eliminates human error, provides automatic rollback

**Q: What happens if something goes wrong?**
A: Automatic rollback within 30 seconds, complete audit trail, zero data loss

**Q: Can we customize the confidence thresholds?**
A: Yes, fully configurable per team/project requirements

**Q: How does this integrate with our existing CI/CD?**
A: Native GitHub Actions support, webhooks for custom integrations

---

**Demo complete!** This showcases pgql's ability to safely migrate large-scale GraphQL codebases with minimal risk and maximum automation.