# 🚀 GraphQL Migration CLI

**One CLI to rule them all** - A unified command-line interface for all your GraphQL migration needs.

## 🎯 Quick Start

```bash
# Install and build
npm install
npm run build

# Check what you can do
npm run cli -- --help

# See current status
npm run cli status

# Get step-by-step guidance
npm run cli quick-start
```

## 📋 Command Overview

### 🔍 Analysis Commands

```bash
# Analyze your GraphQL operations
npm run cli analyze operations ./src -s ./schema.graphql

# Analyze query variants and dynamic fragments
npm run cli analyze variants ./src --advanced

# Run comprehensive production readiness check
npm run cli analyze production-readiness ./src -s ./schema.graphql
```

### 📤 Extraction Commands

```bash
# Extract GraphQL queries from your codebase
npm run cli extract queries ./src -o ./extracted-queries.json

# Extract with dynamic variants
npm run cli extract queries ./src --dynamic

# Extract query variants separately
npm run cli extract variants ./src --advanced

# Unified extraction with all features
npm run cli extract unified ./src -o ./extraction-results
```

### 🔄 Transformation Commands

```bash
# Transform queries based on schema deprecations
npm run cli transform queries -s ./schema.graphql --dry-run

# Transform with custom input/output
npm run cli transform queries -i ./my-queries.json -o ./transformed-queries
```

### ✅ Validation Commands

```bash
# Validate queries against schema
npm run cli validate schema --pipeline -s ./schema.graphql

# Validate response data integrity
npm run cli validate responses --queries ./queries.json --endpoint https://api.example.com/graphql

# Validate with GoDaddy configuration
npm run cli validate responses --godaddy --cookies "auth_idp=xxx; cust_idp=yyy"

# Validate extracted variants
npm run cli validate variants -i ./extracted-variants -s ./schema.graphql
```

### 🚀 Migration Commands

```bash
# Run complete migration pipeline (RECOMMENDED)
npm run cli migrate full --interactive --dry-run

# Full migration with response validation
npm run cli migrate full --validate-responses --endpoint https://api.example.com/graphql

# Pattern-based migration with centralized query naming
npm run cli migrate pattern-migrate --dry-run

# Apply transformations only
npm run cli migrate apply --dry-run
```

### 🎯 Pattern-Based Migration Commands

```bash
# Run pattern-aware migration
npm run cli pattern-migrate --directory ./src --schema ./schema.graphql

# Demo mode showing pattern detection
npm run cli pattern-migrate --demo

# Pattern migration with dry run
npm run cli pattern-migrate --directory ./src --dry-run
```

### 🔧 Utility Commands

```bash
# Generate GitHub PR after migration
npm run cli utils generate-pr -s ./schema.graphql --draft

# Run type-safe operations
npm run cli utils type-safe
```

### 📊 Monitoring Commands

```bash
# Monitor migration health
npm run cli monitor health --real-time
```

### 🎯 Helper Commands

```bash
# Check current migration status
npm run cli status

# Get quick start guide
npm run cli quick-start
```

## 🌟 Common Workflows

### 1. **First-time Setup**

```bash
# Get guidance
npm run cli quick-start

# Check current status
npm run cli status

# Analyze your codebase
npm run cli analyze operations ./src -s ./schema.graphql
```

### 2. **Development Workflow**

```bash
# Extract queries
npm run cli extract queries ./src

# Transform with preview
npm run cli transform queries -s ./schema.graphql --dry-run

# Validate everything
npm run cli validate schema --pipeline

# Check status
npm run cli status
```

### 3. **Production Migration**

```bash
# Run production readiness check
npm run cli analyze production-readiness ./src -s ./schema.graphql

# Full migration with all safety checks
npm run cli migrate full --interactive --validate-responses --create-pr

# Monitor after deployment
npm run cli monitor health --real-time
```

### 4. **Response Validation Workflow**

```bash
# Capture baseline responses
npm run cli validate responses --capture-baseline --queries ./queries.json --endpoint https://api.example.com/graphql

# Compare after transformation
npm run cli validate responses --compare --queries ./transformed-queries.json --endpoint https://api.example.com/graphql
```

### 5. **Pattern-Based Migration Workflow**

```bash
# Start with demo mode to understand pattern detection
npm run cli pattern-migrate --demo

# Analyze patterns in your codebase
npm run cli pattern-migrate --directory ./src --dry-run

# Apply pattern-based migration
npm run cli pattern-migrate --directory ./src --schema ./schema.graphql

# Validate results
npm run cli validate schema --pipeline
```

## 🛠️ Advanced Usage

### Custom Configuration

```bash
# Use custom config file
npm run cli migrate full -c ./my-config.yaml

# Use custom patterns
npm run cli extract queries ./src -p "**/*.tsx" -p "**/*.ts"
```

### GoDaddy Integration

```bash
# With individual cookies
npm run cli validate responses --godaddy --auth-idp xxx --cust-idp yyy

# With cookie string
npm run cli validate responses --godaddy --cookies "auth_idp=xxx; cust_idp=yyy; info_cust_idp=zzz"

# With SSO credentials
npm run cli validate responses --godaddy --sso-username user --sso-password pass
```

### Progressive Rollout

```bash
# Start with 1% rollout
npm run cli migrate full --rollout 1

# Monitor and increase gradually
npm run cli monitor health
```

## 🎨 Features

### ✨ **User Experience**

- 🎯 **Intuitive Commands** - Logical grouping and clear naming
- 🌈 **Colored Output** - Beautiful, readable terminal output
- 📊 **Progress Indicators** - Spinners and progress bars
- 💡 **Helpful Guidance** - Built-in help and examples
- 🔄 **Interactive Mode** - Step-by-step confirmations

### 🛡️ **Safety Features**

- 🧪 **Dry Run Mode** - Preview changes before applying
- 📋 **Status Tracking** - Know where you are in the process
- 🚨 **Validation** - Multiple validation layers
- 🔄 **Progressive Rollout** - Gradual deployment with safety checks
- 📊 **Response Validation** - Ensure data integrity

### 🚀 **Production Ready**

- 🏭 **Enterprise Features** - GoDaddy integration, SSO, etc.
- 📈 **Monitoring** - Real-time health monitoring
- 🔧 **GitHub Integration** - Automatic PR generation
- 📊 **Comprehensive Reporting** - Detailed analysis and reports

## 📚 Help & Documentation

```bash
# General help
npm run cli --help

# Help for specific command
npm run cli analyze --help
npm run cli extract --help
npm run cli migrate --help

# Help for subcommands
npm run cli analyze operations --help
npm run cli validate responses --help
```

## 🔧 Development

```bash
# Run in development mode
npm run cli:dev -- status

# Build for production
npm run cli:build

# Use built version
./dist/cli/main-cli.js status
```

## 📖 Examples

### Basic Migration

```bash
# 1. Check status
npm run cli status

# 2. Extract queries
npm run cli extract queries ./src

# 3. Transform (dry run first)
npm run cli transform queries -s ./schema.graphql --dry-run

# 4. Apply transformations
npm run cli migrate apply

# 5. Validate
npm run cli validate schema --pipeline
```

### Production Migration with Safety

```bash
# Complete migration with all safety features
npm run cli migrate full \
  --interactive \
  --validate-responses \
  --endpoint https://api.example.com/graphql \
  --create-pr \
  --rollout 1
```

## 🎯 Pro Tips

1. **Always start with `status`** to see where you are
2. **Use `--dry-run`** to preview changes before applying
3. **Run `quick-start`** if you're new to the tool
4. **Use `--interactive`** for step-by-step guidance
5. **Check `--help`** for any command to see all options

---

**🚀 Happy Migrating!** This CLI consolidates all your GraphQL migration needs into one clean, intuitive interface.
