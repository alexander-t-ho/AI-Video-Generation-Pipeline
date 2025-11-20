/**
 * Test Upscaling Fix
 * 
 * Tests if the upscaler service can now properly access the Replicate API token
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { upscaleImage } from '../lib/services/image-upscaler';

// Load environment variables from .env.local
try {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fsSync.existsSync(envPath)) {
    const envContent = fsSync.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        if (key && value && !process.env[key]) {
          process.env[key] = value;
        }
      }
    });
    console.log('✅ Loaded environment variables from .env.local\n');
  }
} catch (error) {
  console.log('ℹ️  Could not load .env.local\n');
}

async function testUpscale() {
  console.log('🧪 Testing Upscale Service Fix\n');

  // Use one of the background-removed images from S3
  const testImageUrl = 'https://aaa-vid-gauntlet.s3.us-east-1.amazonaws.com/outputs/porsche-991-batch-processing-1763593071893/bg-removed-aerial.png';
  const projectId = 'test-upscale-' + Date.now();

  console.log(`📸 Test image: ${testImageUrl}`);
  console.log(`🏷️  Project ID: ${projectId}\n`);

  try {
    console.log('🔍 Starting upscale...');
    const upscaledUrl = await upscaleImage(testImageUrl, projectId);
    
    console.log('\n✅ SUCCESS! Upscaling worked!');
    console.log(`🎉 Upscaled image: ${upscaledUrl}`);
    
    return true;
  } catch (error) {
    console.error('\n❌ FAILED! Upscaling still has issues:');
    console.error(error);
    return false;
  }
}

testUpscale()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });


