#!/bin/bash

# Check Directories Script
# Verifies that all required directories exist for the application

set -e

echo "🔍 Checking required directories..."

# Define required directories
REQUIRED_DIRS=(
    "/tmp/projects"
    "/tmp/thumbnails"
    "/tmp/temp-downloads"
    "/tmp/s3-thumbnails"
    "/tmp/edge-cleanup"
    "/tmp/music-analysis"
    "./video testing"
    "./tmp"
)

MISSING_DIRS=()
EXISTING_DIRS=()

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        EXISTING_DIRS+=("$dir")
        echo "✅ $dir"
    else
        MISSING_DIRS+=("$dir")
        echo "❌ $dir (MISSING)"
    fi
done

echo ""
echo "📊 Summary:"
echo "   Existing: ${#EXISTING_DIRS[@]} directories"
echo "   Missing: ${#MISSING_DIRS[@]} directories"

if [ ${#MISSING_DIRS[@]} -gt 0 ]; then
    echo ""
    echo "⚠️  Missing directories detected!"
    echo "   Run the following to create them:"
    echo "   mkdir -p ${MISSING_DIRS[*]}"
    exit 1
else
    echo ""
    echo "🎉 All required directories exist!"
    exit 0
fi
