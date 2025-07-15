# UI Troubleshooting Guide

## Quick Start

### Option 1: Use the startup script (recommended)
```bash
cd ui/
./start-ui-full.sh
```

### Option 2: Manual startup
```bash
cd ui/

# Install dependencies if needed
pnpm install

# Start backend server (Terminal 1)
node server.mjs

# Start UI development server (Terminal 2)
pnpm dev
```

## Common Issues and Solutions

### 1. "No node_modules found" Error
**Problem**: UI dependencies not installed
```bash
# Solution
cd ui/
pnpm install
```

### 2. "vitest: command not found" Error
**Problem**: Trying to run UI tests without dependencies
```bash
# Solution
cd ui/
pnpm install
pnpm test
```

### 3. "Port already in use" Error
**Problem**: Servers already running on ports 3001 or 5173
```bash
# Solution - Kill existing processes
pkill -f "vite"
pkill -f "server.mjs"
# Or use different ports
pnpm dev --port 5174
```

### 4. React Peer Dependency Warning
**Problem**: react-diff-viewer-continued expects React 18, but we're using React 19
```
react-diff-viewer-continued 3.4.0
├── ✕ unmet peer react@"^15.3.0 || ^16.0.0 || ^17.0.0 || ^18.0.0": found 19.1.0
```
**Solution**: This is a warning, not an error. The component works fine with React 19.

### 5. TypeScript Compilation Errors
**Problem**: TypeScript errors in the UI
```bash
# Check for errors
npx tsc --noEmit

# If errors exist, check the files mentioned and fix them
```

### 6. API Connection Issues
**Problem**: UI can't connect to backend
```bash
# Check if backend is running
curl http://localhost:3001/api/status

# Should return:
{"stage":"idle","status":"ready","logs":[]}
```

### 7. Environment Variables Not Working
**Problem**: Authentication not working
```bash
# Check if environment variables are set
echo $REACT_APP_AUTH_IDP
echo $REACT_APP_CUST_IDP

# If not set, create .env file in ui/ directory:
REACT_APP_AUTH_IDP=your_auth_token
REACT_APP_CUST_IDP=your_cust_token
REACT_APP_INFO_CUST_IDP=your_info_cust_token
REACT_APP_INFO_IDP=your_info_token
```

### 8. WebSocket Connection Issues
**Problem**: Real-time updates not working
```bash
# Check if server.mjs is running and accessible
curl http://localhost:3001/api/status

# If not, restart the backend server
node server.mjs
```

## Available Endpoints

### Backend API (http://localhost:3001)
- `POST /api/extract` - Start UnifiedExtractor pipeline
- `GET /api/status` - Poll pipeline status  
- `POST /api/test-real-api` - Test vnext sample

### UI Development Server (http://localhost:5173)
- Main dashboard interface
- Real-time pipeline monitoring
- Query diff viewer
- PR generation interface

## Testing

### Run UI Tests
```bash
cd ui/
pnpm test
```

### Run UI Tests with Coverage
```bash
cd ui/
pnpm test:coverage
```

### Run E2E Tests
```bash
cd ui/
npx cypress run
```

## Build for Production

```bash
cd ui/
pnpm build
```

The built files will be in `ui/dist/` and can be served by any static file server.

## Development Tips

1. **Hot Reload**: The UI development server supports hot reload - changes are reflected immediately
2. **Network Access**: Use `pnpm dev --host` to expose the server on your network
3. **Debug Mode**: Check browser console for any runtime errors
4. **API Debugging**: Use browser Network tab to debug API calls

## Getting Help

If you're still having issues:
1. Check the browser console for error messages
2. Check the terminal where you started the servers for error logs
3. Verify all dependencies are installed with `pnpm install`
4. Try restarting both servers