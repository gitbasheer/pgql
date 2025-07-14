#!/bin/bash

echo "🚀 Starting PG Migration UI Server..."
echo ""

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Ensure logger file exists for AuthHelper
echo "📦 Preparing dependencies..."
mkdir -p dist/utils
cat > dist/utils/logger.js << 'EOF'
export const logger = {
  info: (message, ...args) => console.log(`[INFO] ${message}`, ...args),
  warn: (message, ...args) => console.warn(`[WARN] ${message}`, ...args),
  error: (message, ...args) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message, ...args) => console.debug(`[DEBUG] ${message}`, ...args)
};
export default logger;
EOF

echo ""
echo "🌐 Starting UI server on port 3456..."
echo ""

# Start the server
node ui-server.js &
SERVER_PID=$!

# Wait a moment for server to start
sleep 2

# Open browser
echo "🌏 Opening browser..."
if command -v open &> /dev/null; then
    open http://localhost:3456/pg-migration-ui.html
elif command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:3456/pg-migration-ui.html
else
    echo "📋 Please open http://localhost:3456/pg-migration-ui.html in your browser"
fi

echo ""
echo "✅ UI Server is running (PID: $SERVER_PID)"
echo ""
echo "📌 Quick Guide:"
echo "   1. Test Auth - Verify SSO/Apollo configuration"
echo "   2. Extract Queries - Find all GraphQL queries in your codebase"
echo "   3. Transform - Apply schema-based transformations"
echo "   4. Validate - Check queries against GraphQL schema"
echo "   5. View Queries - See before/after transformations"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Wait for the server process
wait $SERVER_PID