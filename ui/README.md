# GraphQL Migration Dashboard UI

Real-time monitoring dashboard for the GraphQL migration pipeline.

## Features

- **Real-time Pipeline Monitoring**: Track extraction, classification, validation, testing, transformation, and PR generation stages
- **Live Logs Streaming**: View real-time logs with different severity levels
- **Query Diff Viewer**: Side-by-side comparison of original and transformed queries
- **GitHub Integration**: Clone repositories directly from the dashboard
- **PR Preview**: Generate and preview pull requests before submission

## 🚀 Quick Start

### Option 1: One-Click Setup (Recommended)
```bash
cd ui/
./start-ui-full.sh
```

### Option 2: Manual Setup
```bash
cd ui/

# Install dependencies
pnpm install

# Start backend server (Terminal 1)
pnpm start

# Start UI development server (Terminal 2)
pnpm dev
```

**Access the dashboard at**: http://localhost:5173  
**Backend API available at**: http://localhost:3001

## 📋 Available Scripts

### Development
- `pnpm dev` - Start development server (port 5173)
- `pnpm dev:host` - Start development server with network access
- `pnpm start` - Start backend server only (port 3001)
- `pnpm start:full` - Start both servers with one command

### Build & Deploy
- `pnpm build` - Build for production
- `pnpm preview` - Preview production build
- `pnpm typecheck` - Run TypeScript type checking

### Testing & Quality
- `pnpm test` - Run tests in watch mode
- `pnpm test:coverage` - Run tests with coverage report
- `pnpm lint` - Run ESLint
- `pnpm format` - Format code with Prettier

### Utilities
- `pnpm clean` - Clean node_modules and dist directories

## 🔧 Troubleshooting

If you encounter issues, check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for solutions to common problems.

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