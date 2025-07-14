# UI Dashboard Implementation

## Overview
This is the Phase 3 implementation of the GraphQL Migration Dashboard UI. It provides real-time monitoring, query diff viewing, and GitHub integration for the migration pipeline.

## Key Components

### Dashboard (`src/components/Dashboard.tsx`)
- Main component that orchestrates the entire UI
- Manages pipeline configuration form
- Handles socket connections and real-time updates
- Integrates all sub-components

### PipelineProgress (`src/components/PipelineProgress.tsx`)
- Visual pipeline stage tracker
- Shows 6 stages: Extraction → Classification → Validation → Testing → Transformation → PR Generation
- Real-time status updates via Socket.io

### LogViewer (`src/components/LogViewer.tsx`)
- Real-time log streaming with auto-scroll
- Color-coded log levels (info, warn, error, success)
- Terminal-like appearance with timestamps

### QueryDiffViewer (`src/components/QueryDiffViewer.tsx`)
- Side-by-side diff viewer using react-diff-viewer-continued
- Modal popup for detailed query transformations
- Shows warnings and mapping code

### GitHubIntegration (`src/components/GitHubIntegration.tsx`)
- Clone repositories from GitHub URLs
- Integrates with backend GitHub CLI wrapper

### PRPreview (`src/components/PRPreview.tsx`)
- Generate and preview pull requests
- Shows Git diff before PR creation
- Links to created PRs on GitHub

## Real-time Architecture

- **Socket.io** for WebSocket connections
- **TanStack Query** for data fetching and caching
- **Apollo Client** for GraphQL operations
- Custom hooks for socket management

## Integration Points

1. **Backend API** (`/api/*`)
   - `/api/pipeline/start` - Start pipeline
   - `/api/pipeline/:id/queries` - Get extracted queries
   - `/api/pipeline/:id/generate-pr` - Generate PR
   - `/api/github/clone` - Clone repository

2. **Socket Events**
   - `log` / `pipeline:log` - Real-time logs
   - `pipeline:stage` - Pipeline stage updates
   - `connect` / `disconnect` - Connection status

3. **GraphQL** (`/api/graphql`)
   - Apollo Client configured for future GraphQL operations

## Testing

- Vitest with React Testing Library
- Tests cover main components and interactions
- Mock Socket.io and fetch for isolated testing
- 100% test pass rate achieved

## Development Commands

```bash
# From root directory
pnpm ui:dev      # Start development server
pnpm ui:build    # Build for production
pnpm ui:test     # Run tests
pnpm ui:install  # Install dependencies

# From ui directory
pnpm dev         # Start development server
pnpm build       # Build for production
pnpm test        # Run tests
pnpm lint        # Run ESLint
pnpm format      # Format with Prettier
```

## Production Build

The UI builds to `dist/ui/` and can be served by the backend server or a separate static host.

## Next Steps

1. Integrate with Y's Phase 2 backend fixes
2. Add E2E tests with Cypress
3. Implement authentication if needed
4. Add performance monitoring
5. Enhance error recovery mechanisms