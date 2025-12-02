#!/bin/sh
set -e

echo "Starting deployment script..."
echo "Current directory: $(pwd)"

# Ensure required directories exist
echo "📁 Setting up required directories..."
mkdir -p /tmp/projects /tmp/thumbnails /tmp/temp-downloads /tmp/s3-thumbnails /tmp/edge-cleanup /tmp/music-analysis ./video\ testing ./tmp

if [ $? -eq 0 ]; then
    echo "✅ Directory setup complete!"
    echo "   Created: /tmp/projects, /tmp/thumbnails, /tmp/temp-downloads,"
    echo "           /tmp/s3-thumbnails, /tmp/edge-cleanup, /tmp/music-analysis,"
    echo "           ./video testing, ./tmp"
else
    echo "❌ Directory setup failed!"
    exit 1
fi

# Run migrations
echo "🔄 Running database migrations..."
if npx prisma migrate deploy; then
    echo "✅ Migrations complete!"
else
    echo "❌ Migrations failed!"
    exit 1
fi

echo "🚀 Preparing application..."

export HOSTNAME="0.0.0.0"
export PORT=${PORT:-3000}

# Check for standalone build
if [ -f ".next/standalone/server.js" ]; then
    echo "✅ Found standalone build at .next/standalone/server.js"
    
    # In a single-stage build with standalone output, we typically run the standalone server
    # We need to ensure static assets are in the right place for the standalone server if it expects them there
    # However, since we are running in place, we can try running it directly.
    
    # To be safe with standalone mode, we often need to ensure 'public' and '.next/static' are accessible 
    # to the standalone server if we were to 'cd' into it. 
    # But let's try running from root first.
    
    echo "Starting standalone server with node..."
    exec node .next/standalone/server.js
else
    echo "⚠️ Standalone build not found, falling back to 'npm start'..."
    exec npm start
fi
