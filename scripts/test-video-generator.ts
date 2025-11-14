/**
 * Test Video Generator
 * 
 * Tests the video generation utility with sample images.
 */

import { generateVideo } from '../lib/video/generator';
import fs from 'fs/promises';
import path from 'path';

async function testVideoGeneration() {
  console.log('🧪 Testing Video Generator...\n');

  // Get arguments
  const imageUrl = process.argv[2];
  const prompt = process.argv[3] || 'A smooth, cinematic camera movement';
  const seedFrame = process.argv[4]; // Optional
  const projectId = 'test-project-' + Date.now();
  const sceneIndex = parseInt(process.argv[5] || '0', 10);

  if (!imageUrl) {
    console.log('⚠️  No image URL provided.');
    console.log('   Usage: npm run test:video-generator <image-url> [prompt] [seed-frame] [scene-index]');
    console.log('\n   Example (Scene 0 - no seed):');
    console.log('   npm run test:video-generator https://example.com/image.png "A smooth camera movement"');
    console.log('\n   Example (Scene 1-4 - with seed):');
    console.log('   npm run test:video-generator https://example.com/image.png "A smooth camera movement" /path/to/seed-frame.png 1');
    console.log('\n   Example (local file):');
    console.log('   npm run test:video-generator /path/to/image.png "A smooth camera movement"');
    process.exit(1);
  }

  try {
    // Check if image URL is a local file
    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      try {
        await fs.access(imageUrl);
        console.log(`✅ Image file exists: ${imageUrl}`);
      } catch {
        console.error(`❌ Image file not found: ${imageUrl}`);
        process.exit(1);
      }
    }

    // Check seed frame if provided
    if (seedFrame && !seedFrame.startsWith('http://') && !seedFrame.startsWith('https://')) {
      try {
        await fs.access(seedFrame);
        console.log(`✅ Seed frame file exists: ${seedFrame}`);
      } catch {
        console.error(`❌ Seed frame file not found: ${seedFrame}`);
        process.exit(1);
      }
    }

    console.log(`📹 Generating video from image...`);
    console.log(`   Image URL: ${imageUrl}`);
    console.log(`   Prompt: "${prompt}"`);
    if (seedFrame) {
      console.log(`   Seed Frame: ${seedFrame}`);
      console.log(`   Mode: Scene ${sceneIndex} (with seed frame)`);
    } else {
      console.log(`   Mode: Scene ${sceneIndex} (no seed frame)`);
    }
    console.log(`   Project ID: ${projectId}\n`);

    const startTime = Date.now();
    const videoPath = await generateVideo(
      imageUrl,
      prompt,
      seedFrame,
      projectId,
      sceneIndex
    );
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n✅ Video generation completed in ${duration}s!`);
    console.log(`📁 Video path: ${videoPath}`);

    // Verify video file exists
    try {
      await fs.access(videoPath);
      const stats = await fs.stat(videoPath);
      console.log(`📊 File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      console.log('\n✅ Video generation test passed!');
      process.exit(0);
    } catch {
      console.error('\n❌ Video file not found');
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ Video generation test failed:');
    console.error(`   ${error.message}`);
    
    if (error.message?.includes('REPLICATE_API_TOKEN')) {
      console.error('\n   Please check your Replicate API token:');
      console.error('   - REPLICATE_API_TOKEN environment variable');
    }
    
    if (error.message?.includes('authentication')) {
      console.error('\n   Authentication failed. Please check your REPLICATE_API_TOKEN.');
    }
    
    if (error.message?.includes('rate limit')) {
      console.error('\n   Rate limit exceeded. Please try again later.');
    }
    
    process.exit(1);
  }
}

testVideoGeneration().catch(console.error);

