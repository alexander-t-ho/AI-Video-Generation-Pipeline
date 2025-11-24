#!/bin/bash

# Database Export Script
# Exports PostgreSQL database to SQL dump file

set -e

# Load environment variables
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '^#' | xargs)
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL environment variable is not set"
  echo "Please set it in .env.local or export it in your shell"
  exit 1
fi

# Create export directory if it doesn't exist
EXPORT_DIR="database/export"
mkdir -p "$EXPORT_DIR"

# Generate timestamp for filename
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
DUMP_FILE="$EXPORT_DIR/dump_$TIMESTAMP.sql"
SCHEMA_FILE="$EXPORT_DIR/schema_$TIMESTAMP.sql"
DATA_FILE="$EXPORT_DIR/data_$TIMESTAMP.sql"

echo "Exporting database..."
echo "Full dump: $DUMP_FILE"
echo "Schema only: $SCHEMA_FILE"
echo "Data only: $DATA_FILE"

# Export full database
pg_dump "$DATABASE_URL" > "$DUMP_FILE"

# Export schema only
pg_dump "$DATABASE_URL" --schema-only > "$SCHEMA_FILE"

# Export data only
pg_dump "$DATABASE_URL" --data-only > "$DATA_FILE"

echo ""
echo "✅ Database export completed!"
echo ""
echo "Files created:"
echo "  - Full dump: $DUMP_FILE"
echo "  - Schema only: $SCHEMA_FILE"
echo "  - Data only: $DATA_FILE"
echo ""
echo "To restore the database:"
echo "  psql \$DATABASE_URL < $DUMP_FILE"
echo ""
echo "Prisma schema is available at: prisma/schema.prisma"

