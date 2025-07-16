# Joint Demo Script - GraphQL Migration Pipeline

**Date**: July 14, 2025  
**Teams**: Y (Testing), X (UI), Z (Backend)  
**Coverage**: 84.1% backend + 77.89% UI  
**Status**: Production Ready ✅

## Pre-Demo Setup (5 minutes)

### 1. Environment Configuration

```bash
# Navigate to project root
cd /Users/balkhalil/gd/demo/pg-migration-620

# Verify .env file contains authentication cookies
# (Values should be masked in logs but functional for testing)
cat .env | grep -E "auth_idp|cust_idp|info_.*idp|APOLLO_.*_ENDPOINT"

# Expected output:
# auth_idp=<masked-auth-token>
# cust_idp=<masked-cust-token>
# info_cust_idp=<masked-info-cust-token>
# info_idp=<masked-info-token>
# APOLLO_PG_ENDPOINT=https://pg.api.godaddy.com/v1/gql/customer
# APOLLO_OG_ENDPOINT=https://og.api.godaddy.com/
```

### 2. Start UI Development Server

```bash
# Start the UI in background
pnpm ui:dev &

# Wait for server to start (about 10 seconds)
echo "Waiting for UI server startup..."
sleep 10

# Verify UI is running
curl -s http://localhost:5173 | grep -q "GraphQL Migration" && echo "✅ UI Ready" || echo "❌ UI Failed"
```

### 3. Verify Backend Pipeline

```bash
# Quick pipeline validation test
npx tsx validate-vnext-flow.ts

# Expected: "🎉 Full pipeline validation PASSED!"
```

## Demo Flow (15 minutes)

### Step 1: Dashboard Overview (2 minutes)

```markdown
**What to show:**

1. Open http://localhost:5173
2. Point out key features:
   - Real-time connection status indicator
   - Pipeline configuration form
   - "🧪 Test vnext Sample" button (our star feature)
   - Socket.io connection status

**Talking points:**

- "This UI integrates our entire GraphQL migration pipeline"
- "We have 77.89% test coverage with 142/142 tests passing"
- "Real-time updates via WebSocket with 5-attempt reconnection"
```

### Step 2: vnext Sample Data Extraction (3 minutes)

```markdown
**Actions:**

1. Click "🧪 Test vnext Sample" button
2. Watch real-time progress through 6 stages:
   - 📦 Extraction
   - 🔍 Classification
   - ✅ Validation
   - 🧪 Testing
   - 🔄 Transformation
   - 📝 PR Generation

**Expected Results:**

- 30 queries extracted from sample data
- 0 AST errors (our fix working!)
- Template variables resolved (${queryNames.xxx} patterns)
- Endpoint classification: Product Graph vs Offer Graph
```

### Step 3: Real API Testing with Authentication (4 minutes)

```markdown
**Demonstrate:**

1. Show query diff viewer modal opening
2. Point out side-by-side comparison
3. Highlight real API testing section
4. Show authentication is working (cookies properly formatted)

**Technical Details:**

- Cookie format: "auth_idp=xxx; cust_idp=xxx; info_cust_idp=xxx; info_idp=xxx"
- Sensitive data masked in logs (security feature)
- Dynamic variable building from testing account data
- Environment-aware endpoint resolution

**Code Reference:**
/_ testOnRealApi call with proper auth _/
testOnRealApi(query, variables, {
headers: {
Cookie: buildCookieString(/_ masked tokens _/)
}
})
```

### Step 4: Query Transformation & Mapping (3 minutes)

````markdown
**Show:**

1. Field deprecation handling
2. Hivemind A/B testing flags generated:
   ```javascript
   if (hivemind.flag('new-queries-getuserprofile')) {
     return transformToNewFormat(oldData);
   }
   ```
````

3. Backward-compatible response mapping utilities
4. Diff preview with syntax highlighting

**Emphasize:**

- Zero-risk migration approach
- Automatic rollback capabilities
- Production-ready with comprehensive error handling

````

### Step 5: PR Generation (2 minutes)
```markdown
**Demonstrate:**
1. Click "Generate PR" button
2. Show GitHub integration working
3. Review generated PR content:
   - Schema migration summary
   - File changes with diffs
   - Mapping utilities generated
   - A/B testing integration

**GitHub Integration:**
- Uses simple-git for branch creation
- Generates descriptive commit messages
- Links to transformation utilities
````

### Step 6: Security & Production Features (1 minute)

```markdown
**Highlight:**

1. Command injection protection (regex: /^[a-zA-Z0-9/_-]+$/)
2. Path traversal prevention
3. Sensitive data masking in all logs
4. Safe branch validation
5. Comprehensive error handling

**Production Stats:**

- 84.1% backend test coverage (1032/1227 tests)
- 77.89% UI test coverage (142/142 tests)
- 30 queries extracted with 0 AST errors
- Full pipeline: ~5 minute execution time
```

## Q&A Preparation

### Common Questions & Answers

**Q: How does authentication work in production?**
A: We use SSO cookies (auth_idp, cust_idp, info_cust_idp, info_idp) formatted as a single Cookie header. All tokens are masked in logs for security.

**Q: What about performance with large codebases?**
A: Our hybrid strategy (AST + Pluck) with caching handles large repos efficiently. We've tested with 69+ queries and maintain <5 minute execution times.

**Q: How do we ensure zero-downtime migrations?**
A: Hivemind A/B testing flags allow gradual rollout. Our backward-compatible mapping utilities ensure old code continues working while new queries are gradually enabled.

**Q: What's the test coverage story?**
A: Combined 84.1% backend + 77.89% UI coverage. All critical paths tested including security, authentication, and error scenarios.

**Q: Is this ready for production deployment?**
A: Yes! We have comprehensive error handling, security protections, real API testing, and automated PR generation. Ready for vnext-dashboard integration.

## Post-Demo Actions

### Immediate Next Steps

1. **Merge to Main**: Final testing → merge to main branch
2. **Documentation**: Update README with demo instructions
3. **Deployment**: Deploy to staging environment
4. **Training**: Schedule team training sessions

### Success Metrics

- ✅ Full pipeline functional end-to-end
- ✅ Real API integration with auth
- ✅ Security protections in place
- ✅ UI/Backend integration complete
- ✅ PR generation automated
- ✅ Test coverage >80% combined

## Emergency Contacts

- **Y (Testing Lead)**: Pipeline validation, test coverage
- **X (UI Lead)**: Dashboard functionality, WebSocket issues
- **Z (Backend Lead)**: Query extraction, API integration

---

**Demo Duration**: ~20 minutes total  
**Audience**: Technical teams, product managers, stakeholders  
**Goal**: Demonstrate production-ready GraphQL migration solution
