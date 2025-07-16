# PG Migration UI - Quick Start Guide

## 🚀 Starting the UI

```bash
# Start the UI server
./start-ui.sh

# Or manually:
npm run build
node ui-server.js
# Then open http://localhost:3456/pg-migration-ui.html
```

## 🎯 Key Features

### 1. **Authentication Testing**

- Click "Test Auth Config" button
- Verifies SSO cookies and Apollo token
- Shows status: ✅ Auth OK or ❌ Auth Missing

### 2. **Core Pipeline Operations**

#### Extract Queries

- Finds all GraphQL queries in your codebase
- Uses hybrid extraction (AST + Pluck strategies)
- Resolves fragments and normalizes names
- Default input: `data/sample_data`

#### Transform

- Applies schema-based transformations
- Updates deprecated fields automatically
- Creates transformed queries in `transformed/` directory

#### Validate

- Checks queries against GraphQL schema
- Reports syntax errors and invalid fields
- Shows validation success rate

#### Apply Changes

- Writes transformed queries back to source files
- Optional backup creation
- Dry-run mode by default

### 3. **Query Viewer**

- **Query List**: Shows all extracted queries with types (query/mutation/subscription)
- **Before/After Views**: Toggle between original and transformed versions
- **Error Display**: Shows validation errors for each query
- **Copy Button**: Quick copy query to clipboard
- **Metadata**: Shows source file, line numbers, and query ID

### 4. **Configuration Options**

- **Input Directory**: Source files location (default: `data/sample_data`)
- **Schema File**: GraphQL schema path (default: `schema.graphql`)
- **Output File**: Extraction output (default: `extracted-queries.json`)
- **Dry Run**: Test without making changes
- **Skip Invalid**: Continue on validation errors
- **Create Backup**: Backup files before changes

### 5. **Real-time Output**

- Live command execution output
- Color-coded messages (success/error/warning)
- Performance metrics and timing
- Detailed error messages

## 📊 Pipeline Workflow

1. **Test Auth** → Ensure credentials are configured
2. **Extract** → Find all GraphQL operations
3. **Validate** → Check against schema
4. **Transform** → Apply deprecation fixes
5. **Review** → Check before/after in query viewer
6. **Apply** → Write changes (with dry-run first)

## 🔍 Viewing Query Transformations

1. Click on "Queries" tab
2. Click "Refresh" to load extracted queries
3. Select any query from the list
4. Toggle between "Before" and "After" views
5. Red errors show validation issues

## ⚡ Quick Actions

- **Full Pipeline**: Runs extract → validate → transform → analyze
- **Clear Output**: Cleans the terminal view
- **Stop**: Halts running operations

## 🛠️ Troubleshooting

### Server Not Running

```bash
Error: Server not running. Start it with: node ui-server.js
```

**Solution**: Run `./start-ui.sh` or `node ui-server.js`

### Auth Missing

```
❌ Auth not configured. Set SSO_AUTH_IDP or APOLLO_AUTH_TOKEN in .env
```

**Solution**: Add auth tokens to `.env` file:

```env
APOLLO_AUTH_TOKEN=your_token_here
# OR
SSO_AUTH_IDP=your_sso_cookie
SSO_CUST_IDP=your_cust_cookie
SSO_INFO_CUST_IDP=your_info_cust_cookie
SSO_INFO_IDP=your_info_cookie
```

### No Queries Found

```
No queries found. Run "Extract Queries" first.
```

**Solution**: Click "Extract Queries" button with correct input path

## 📌 Tips

1. Always run in dry-run mode first
2. Review transformations before applying
3. Create backups for production code
4. Check validation errors in query viewer
5. Use full pipeline for complete migration check

## 🎯 Production Launch Readiness

The UI helps verify:

- ✅ All queries extracted (35+ expected)
- ✅ Schema validation passing
- ✅ Transformations reviewed
- ✅ Auth configuration working
- ✅ No blocking errors

When all checks pass, the system is ready for production deployment!
