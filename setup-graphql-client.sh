#!/bin/bash

echo "🔧 Setting up GraphQL Client dependencies..."

# Install required packages
npm install --save @apollo/client graphql node-fetch

echo "✅ Dependencies installed!"
echo ""
echo "📝 Next steps:"
echo "1. Copy .env.example to .env"
echo "2. Add your GODADDY_COOKIES to the .env file"
echo "3. Run: npx tsx test-godaddy-api.ts"
echo ""
echo "✨ Setup complete!"