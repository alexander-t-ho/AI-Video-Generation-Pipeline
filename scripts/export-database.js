#!/usr/bin/env node

/**
 * Database Export Script (Node.js version)
 * Exports PostgreSQL database to SQL dump file
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is not set');
  console.error('Please set it in .env.local');
  process.exit(1);
}

// Create export directory if it doesn't exist
const exportDir = path.join(process.cwd(), 'database', 'export');
if (!fs.existsSync(exportDir)) {
  fs.mkdirSync(exportDir, { recursive: true });
}

// Generate timestamp for filename
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dumpFile = path.join(exportDir, `dump_${timestamp}.sql`);
const schemaFile = path.join(exportDir, `schema_${timestamp}.sql`);
const dataFile = path.join(exportDir, `data_${timestamp}.sql`);

console.log('Exporting database...');
console.log(`Full dump: ${dumpFile}`);
console.log(`Schema only: ${schemaFile}`);
console.log(`Data only: ${dataFile}`);

try {
  // Export full database
  execSync(`pg_dump "${DATABASE_URL}" > "${dumpFile}"`, { stdio: 'inherit' });

  // Export schema only
  execSync(`pg_dump "${DATABASE_URL}" --schema-only > "${schemaFile}"`, { stdio: 'inherit' });

  // Export data only
  execSync(`pg_dump "${DATABASE_URL}" --data-only > "${dataFile}"`, { stdio: 'inherit' });

  console.log('');
  console.log('✅ Database export completed!');
  console.log('');
  console.log('Files created:');
  console.log(`  - Full dump: ${dumpFile}`);
  console.log(`  - Schema only: ${schemaFile}`);
  console.log(`  - Data only: ${dataFile}`);
  console.log('');
  console.log('To restore the database:');
  console.log(`  psql $DATABASE_URL < ${dumpFile}`);
  console.log('');
  console.log('Prisma schema is available at: prisma/schema.prisma');
} catch (error) {
  console.error('Error exporting database:', error.message);
  process.exit(1);
}

