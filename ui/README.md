# GraphQL Migration Dashboard UI

Real-time monitoring dashboard for the GraphQL migration pipeline.

## Features

- **Real-time Pipeline Monitoring**: Track extraction, classification, validation, testing, transformation, and PR generation stages
- **Live Logs Streaming**: View real-time logs with different severity levels
- **Query Diff Viewer**: Side-by-side comparison of original and transformed queries
- **GitHub Integration**: Clone repositories directly from the dashboard
- **PR Preview**: Generate and preview pull requests before submission

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build

# Format code
pnpm format

# Lint code
pnpm lint
```

## Architecture

- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite
- **State Management**: TanStack Query for server state, local state with React hooks
- **Real-time**: Socket.io for WebSocket connections
- **GraphQL**: Apollo Client for GraphQL operations
- **UI Components**: Custom components with CSS modules
- **Testing**: Vitest with React Testing Library

## Project Structure

```
ui/
├── src/
│   ├── components/     # React components
│   ├── hooks/         # Custom React hooks
│   ├── services/      # API and socket services
│   └── styles/        # CSS files
├── test/              # Test files
└── dist/              # Production build output
```

## Integration

The UI integrates with the backend API through:
- REST endpoints at `/api/*`
- WebSocket connections for real-time updates
- GraphQL endpoint at `/api/graphql`

## Environment

The UI runs on port 5173 in development mode and proxies API requests to the backend server on port 3000.