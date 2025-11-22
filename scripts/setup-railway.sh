#!/bin/bash

# Quick Railway setup script
# Run this once to configure Railway project

echo "🚂 Setting up Railway deployment..."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
  echo "📦 Installing Railway CLI..."
  npm install -g @railway/cli
fi

# Login to Railway
echo "🔑 Logging in to Railway..."
railway login

# Link to Railway project (or create new)
echo "🔗 Linking to Railway project..."
railway link

# Add PostgreSQL database
echo "🗄️  Adding PostgreSQL database..."
railway add postgresql

# Pull environment variables (if any exist)
echo "📥 Pulling environment variables..."
railway variables

echo ""
echo "✅ Railway setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Review environment variables in Railway dashboard:"
echo "      https://railway.app/dashboard"
echo "   2. Set required environment variables:"
echo "      - NEXTAUTH_SECRET (generate a random string)"
echo "      - NEXTAUTH_URL (your Railway URL)"
echo "      - REPLICATE_API_TOKEN"
echo "      - OPENROUTER_API_KEY"
echo "      - AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (if using S3)"
echo "   3. Push to main branch to deploy"
echo "   4. Monitor deployment in Railway dashboard"







