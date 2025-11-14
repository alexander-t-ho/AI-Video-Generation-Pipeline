#!/bin/bash

# Quick deployment test script
# Run this before deploying to catch common issues

echo "🔍 Testing deployment readiness..."

# Check Node version
echo "✓ Checking Node version..."
node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$node_version" -lt 18 ]; then
  echo "❌ Node version must be 18+ (current: $(node -v))"
  exit 1
fi

# Check if .env.local exists
echo "✓ Checking environment variables..."
if [ ! -f ".env.local" ]; then
  echo "⚠️  Warning: .env.local not found. Make sure to set env vars in Vercel dashboard."
fi

# Check required env vars (if .env.local exists)
if [ -f ".env.local" ]; then
  source .env.local
  required_vars=("REPLICATE_API_TOKEN" "OPENROUTER_API_KEY" "AWS_ACCESS_KEY_ID" "AWS_SECRET_ACCESS_KEY")
  for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
      echo "⚠️  Warning: $var not set in .env.local"
    else
      echo "✓ $var is set"
    fi
  done
fi

# Test build
echo "✓ Testing build..."
if npm run build > /dev/null 2>&1; then
  echo "✓ Build successful"
else
  echo "❌ Build failed. Run 'npm run build' to see errors."
  exit 1
fi

# Check for TypeScript errors
echo "✓ Checking TypeScript..."
if npx tsc --noEmit > /dev/null 2>&1; then
  echo "✓ No TypeScript errors"
else
  echo "⚠️  Warning: TypeScript errors found. Run 'npx tsc --noEmit' to see them."
fi

# Check if FFmpeg package is installed
echo "✓ Checking FFmpeg dependency..."
if npm list @ffmpeg-installer/ffmpeg > /dev/null 2>&1; then
  echo "✓ FFmpeg package installed"
else
  echo "⚠️  Warning: @ffmpeg-installer/ffmpeg not found. Run 'npm install @ffmpeg-installer/ffmpeg'"
fi

echo ""
echo "✅ Deployment readiness check complete!"
echo "📝 Next steps:"
echo "   1. Set environment variables in Vercel dashboard"
echo "   2. Run 'vercel' to deploy to preview"
echo "   3. Test all endpoints on preview"
echo "   4. Run 'vercel --prod' for production"

