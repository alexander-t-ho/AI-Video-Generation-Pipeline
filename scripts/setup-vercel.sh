#!/bin/bash

# Quick Vercel setup script
# Run this once to configure Vercel project

echo "🚀 Setting up Vercel deployment..."

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
  echo "📦 Installing Vercel CLI..."
  npm install -g vercel
fi

# Link to Vercel project (or create new)
echo "🔗 Linking to Vercel project..."
vercel link

# Pull environment variables template
echo "📥 Pulling environment variables..."
vercel env pull .env.local

echo ""
echo "✅ Vercel setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Review .env.local and add missing values"
echo "   2. Set environment variables in Vercel dashboard:"
echo "      https://vercel.com/[your-team]/[your-project]/settings/environment-variables"
echo "   3. Run 'npm run test:deployment' to verify setup"
echo "   4. Run 'vercel' to deploy to preview"

