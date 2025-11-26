/**
 * Directory Setup Utility
 *
 * Ensures all required directories exist for the application to function properly.
 * This is called during application startup to prevent runtime errors.
 */

import fs from 'fs';
import path from 'path';

const REQUIRED_DIRECTORIES = [
  // Core temp directories used by media serving routes
  '/tmp/projects',
  '/tmp/thumbnails',
  '/tmp/temp-downloads',
  '/tmp/s3-thumbnails',

  // AI service temp directories
  '/tmp/edge-cleanup',
  '/tmp/music-analysis',

  // Relative directories (resolved from cwd)
  path.join(process.cwd(), 'video testing'),
  path.join(process.cwd(), 'tmp'),
];

export async function ensureDirectoriesExist(): Promise<void> {
  console.log('🔧 Ensuring required directories exist...');

  const created: string[] = [];
  const errors: string[] = [];

  for (const dirPath of REQUIRED_DIRECTORIES) {
    try {
      // Check if directory exists
      await fs.promises.access(dirPath);
      console.log(`✅ Directory exists: ${dirPath}`);
    } catch {
      // Directory doesn't exist, create it
      try {
        await fs.promises.mkdir(dirPath, { recursive: true });
        created.push(dirPath);
        console.log(`📁 Created directory: ${dirPath}`);
      } catch (error) {
        const errorMsg = `Failed to create ${dirPath}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }
  }

  if (created.length > 0) {
    console.log(`✅ Created ${created.length} directories successfully`);
  }

  if (errors.length > 0) {
    console.error(`❌ Failed to create ${errors.length} directories:`);
    errors.forEach(error => console.error(`   - ${error}`));
    throw new Error(`Directory setup failed: ${errors.length} directories could not be created`);
  }

  console.log('🎉 Directory setup complete!');
}

// Synchronous version for use in startup scripts where async/await might not be available
export function ensureDirectoriesExistSync(): void {
  console.log('🔧 Ensuring required directories exist (sync)...');

  const created: string[] = [];
  const errors: string[] = [];

  for (const dirPath of REQUIRED_DIRECTORIES) {
    try {
      // Check if directory exists
      fs.accessSync(dirPath);
      console.log(`✅ Directory exists: ${dirPath}`);
    } catch {
      // Directory doesn't exist, create it
      try {
        fs.mkdirSync(dirPath, { recursive: true });
        created.push(dirPath);
        console.log(`📁 Created directory: ${dirPath}`);
      } catch (error) {
        const errorMsg = `Failed to create ${dirPath}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }
  }

  if (created.length > 0) {
    console.log(`✅ Created ${created.length} directories successfully`);
  }

  if (errors.length > 0) {
    console.error(`❌ Failed to create ${errors.length} directories:`);
    errors.forEach(error => console.error(`   - ${error}`));
    throw new Error(`Directory setup failed: ${errors.length} directories could not be created`);
  }

  console.log('🎉 Directory setup complete!');
}
