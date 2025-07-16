# Developer Onboarding Guide

Welcome to the pg-migration-620 project! This guide will help you get up to speed quickly.

## 🎯 Project Overview

pg-migration-620 is a production-grade GraphQL migration tool that automatically transforms deprecated queries based on GraphQL schema deprecation directives. It's designed for enterprise environments with safety guarantees, rollback support, and progressive migration capabilities.

### Key Capabilities

- **Schema-aware transformations** - Reads deprecation directives from your schema
- **Safe progressive rollout** - Start at 1% traffic, monitor, and gradually increase
- **100% scriptable** - Works with Python, Bash, and other automation tools
- **Pattern-based migration** - Respects dynamic query naming patterns

## 🚀 Quick Start

### 1. Environment Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/pg-migration-620.git
cd pg-migration-620

# Install dependencies (we use pnpm)
pnpm install

# Build the project
pnpm build

# Run tests to verify setup
pnpm test
```

### 2. Your First Migration

```bash
# Extract queries from a sample project
pnpm extract data/sample_data

# Transform them based on schema deprecations
pnpm transform -i extracted-queries.json -s data/schema.graphql --dry-run

# If everything looks good, apply the changes
pnpm transform -i extracted-queries.json -s data/schema.graphql -o transformed
pnpm apply -i transformed/transformed-queries.json --backup
```

## 🏗️ Architecture Overview

### Module Structure

```
src/
├── core/                    # Core business logic
│   ├── extraction/         # Query extraction engine
│   ├── transformer/        # Transformation logic
│   ├── validator/          # Validation services
│   └── safety/            # Safety mechanisms
├── cli/                    # CLI commands
│   ├── main-cli.ts        # Main entry point
│   └── compatibility/      # Output adapters
└── types/                  # TypeScript definitions
```

### Key Concepts

#### 1. Unified Architecture

We're transitioning to a unified module system. When in doubt:

- Use `UnifiedExtractor` instead of older extractors
- Use `OptimizedSchemaTransformer` for transformations
- Check `DEPRECATED_MODULES_AUDIT.md` for module status

#### 2. Pattern-Based Migration

Instead of normalizing dynamic query names, we track patterns:

```typescript
// We preserve this:
const query = gql`query ${queryNames.byIdV1} { ... }`;

// And track the pattern metadata for safe migration
```

#### 3. Progressive Safety

Every migration goes through confidence scoring and gradual rollout:

- Automatic (>90% confidence): Apply immediately
- Semi-automatic (70-90%): Require review
- Manual (<70%): Always manual review

## 🧪 Development Workflow

### 1. Making Changes

```bash
# Create a feature branch
git checkout -b feature/your-feature

# Make your changes
# ... edit files ...

# Run affected tests
pnpm test path/to/affected/tests

# Run linting
pnpm lint

# Build to verify
pnpm build
```

### 2. Testing Your Changes

```bash
# Unit tests
pnpm test

# CLI compatibility tests (important!)
pnpm test:cli-compatibility

# Integration tests
pnpm test:integration
```

### 3. Debugging Tips

```bash
# Enable debug logging
LOG_LEVEL=debug pnpm extract ./src

# See extraction details
DEBUG=pg:extraction:* pnpm extract

# Profile performance
PROFILE=true pnpm transform
```

## 📋 Common Tasks

### Adding a New Extraction Strategy

1. Create strategy in `src/core/extraction/strategies/`
2. Implement `ExtractionStrategy` interface
3. Register in `UnifiedExtractor`
4. Add tests in `src/test/extraction/`

### Adding a New CLI Command

1. Add command in `src/cli/main-cli.ts`
2. Implement handler in appropriate CLI file
3. Update `CLI_OUTPUT_FORMATS.md` with output spec
4. Add compatibility tests

### Fixing a Bug

1. Write a failing test that reproduces the bug
2. Fix the bug
3. Verify test passes
4. Check for regression with full test suite

## ⚠️ Important Notes

### Current State (as of writing)

- **Test Coverage**: ~70% passing - some areas need work
- **Module Migration**: In progress - check deprecation warnings
- **Documentation**: Being updated - verify with actual code

### Gotchas to Avoid

1. **Don't use deprecated modules** - Check `DEPRECATED_MODULES_AUDIT.md`
2. **Preserve CLI compatibility** - Output formats are contracts
3. **Test with real schemas** - Unit tests use simplified schemas
4. **Handle async properly** - Most operations are async

### Where to Get Help

1. Check existing documentation in `docs/`
2. Look at test files for usage examples
3. Search codebase for similar patterns
4. Ask in team chat or create an issue

## 🎓 Learning Resources

### Essential Reading

1. [Architecture Overview](./UNIFIED_ARCHITECTURE.md)
2. [Pattern-Based Migration](../PATTERN-BASED-MIGRATION.md)
3. [CLI Output Formats](./CLI_OUTPUT_FORMATS.md)
4. [Contributing Guide](../CONTRIBUTING.md)

### Code Examples

- `examples/` directory has sample migrations
- Test files show API usage patterns
- CLI files demonstrate command structure

### Understanding the Domain

- GraphQL deprecation directives
- AST manipulation with Babel
- Progressive rollout strategies
- A/B testing for migrations

## 🔧 Tooling

### Development Tools

- **Vitest**: Test runner (not Jest!)
- **TypeScript**: Strict mode enabled
- **pnpm**: Package manager
- **ESLint**: Code linting
- **Prettier**: Code formatting

### Useful Scripts

```bash
# Development
pnpm dev              # Run in development mode
pnpm build            # Build for production
pnpm test             # Run all tests
pnpm lint             # Check code style
pnpm format           # Auto-format code

# Analysis
pnpm analyze          # Analyze bundle size
pnpm test:coverage    # Generate coverage report
```

## 🚦 Ready Checklist

Before you start contributing:

- [ ] Environment setup complete
- [ ] Tests passing locally
- [ ] Read CONTRIBUTING.md
- [ ] Understand module structure
- [ ] Know about deprecated modules
- [ ] Familiar with CLI compatibility requirements

## 🎉 Welcome Aboard!

You're now ready to contribute to pg-migration-620. Remember:

- Ask questions when unsure
- Write tests for new features
- Keep backward compatibility in mind
- Have fun and learn!

---

**Questions?** Check our documentation or reach out to the team!
