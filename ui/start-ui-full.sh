#!/bin/bash

# GraphQL Migration Dashboard - Full UI Startup Script
# This script starts both the UI development server and the backend API server

set -e

echo "🚀 Starting GraphQL Migration Dashboard..."
echo ""

# Check if we're in the UI directory
if [ ! -f "package.json" ] || [ ! -f "server.mjs" ]; then
    echo "❌ Error: Please run this script from the ui/ directory"
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    pnpm install
fi

# Kill any existing servers on these ports
echo "🧹 Cleaning up existing servers..."
pkill -f "vite" || true
pkill -f "server.mjs" || true

# Wait a moment for processes to clean up
sleep 1

# Start the backend server
echo "🖥️  Starting backend server (port 3001)..."
node server.mjs &
BACKEND_PID=$!

# Wait for backend to start and verify it's running
sleep 3
if ! curl -s http://localhost:3001/api/status > /dev/null; then
    echo "❌ Backend server failed to start"
    exit 1
fi

# Start the UI development server
echo "🎨 Starting UI development server (port 5173)..."
pnpm dev &
UI_PID=$!

# Wait for UI to start
sleep 3

echo ""
echo "✅ Dashboard is ready!"
echo ""
echo "🔗 Access the dashboard at: http://localhost:5173"
echo "🔗 Backend API available at: http://localhost:3001"
echo ""
echo "📊 Available endpoints:"
echo "  POST /api/extract - Start UnifiedExtractor pipeline"
echo "  GET  /api/status  - Poll pipeline status"
echo "  POST /api/test-vnext-sample - Test vnext sample queries"
echo ""
echo "Press Ctrl+C to stop both servers"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping servers..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $UI_PID 2>/dev/null || true
    pkill -f "vite" || true
    pkill -f "server.mjs" || true
    echo "👋 Servers stopped"
}

# Set up trap to cleanup on script exit
trap cleanup EXIT

# Wait for user to stop
wait