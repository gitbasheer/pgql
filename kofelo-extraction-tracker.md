# Kofelo's Extraction Support Tracker

## Problematic Query Patterns to Watch

### 1. Complex Template Literals

- [ ] Nested template expressions: `` `query { ${nested`expression`} }` ``
- [ ] Multi-line templates with interpolations
- [ ] Computed template tag names: `` obj[key]`query{}` ``
- [ ] Dynamic imports with template literals

### 2. Conditional Fragments

- [ ] Ternary operators in fragments: `${condition ? fragmentA : fragmentB}`
- [ ] Logical operators: `${hasFeature && fragment}`
- [ ] Switch-case pattern fragments
- [ ] Runtime fragment selection

### 3. Computed Properties

- [ ] Object bracket notation: `queries[computedName]`
- [ ] Dynamic query construction: `buildQuery(params)`
- [ ] Map/reduce generated queries
- [ ] Proxy-based query builders

### 4. Edge Cases Found

#### Identified from Test Analysis:

- **Nested template expressions**: `` `query { ${isAuth ? `email ${isAdmin ? "role" : ""}` : ""} }` ``
- **Dynamic query names with object property access**: `queryNames.byIdV1`, `queryNames.byIdV3Airo`
- **Function call interpolations**: `${getUserFields()}`, `${buildFieldSelection()}`
- **Complex ternary with GraphQL syntax**: `${detailed ? 'fullBio' : 'shortBio'}`
- **Mixed quote types in conditions**: `flag ? 'field1' : "field2"`
- **Runtime fragment selection**: `...${fragmentName}` where fragmentName is computed
- **Invalid/malformed GraphQL**: Missing closing braces, syntax errors in templates

## Extraction Failure Log

| File                | Pattern        | Issue                                                | Manual Extraction | Status      |
| ------------------- | -------------- | ---------------------------------------------------- | ----------------- | ----------- |
| integration.test.ts | File Discovery | UnifiedExtractor finding 0 files in test directories | Pending           | 🔴 Critical |

### Critical Issue Found:

**UnifiedExtractor File Discovery Failure**

- Tests creating temp directories with GraphQL files
- UnifiedExtractor.extract() returns 0 files processed
- Pattern: `**/*.{js,ts,tsx}` not finding files in temp directories
- All 5 integration tests failing due to this issue

## Common Field Mappings (For Beshi)

### Most Frequent Fields Needing Transformation

<!-- Will populate after analyzing extracted queries -->

1. **User fields**:
   - `fullName` → `name` (deprecated)
   - `isActive` → `status.active`
   - Count:

2. **Product fields**:
   - `isAvailable` → `availability.inStock`
   - `productTitle` → `title`
   - Count:

3. **Order fields**:
   - `orderStatus` → `status`
   - `totalAmount` → `pricing.total`
   - Count:

## Manual Extraction Stats

- Total queries extracted manually: 0
- Success rate improvement: 0%
- Most problematic file types: []
