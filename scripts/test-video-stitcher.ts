/**
 * Test Video Stitcher
 * 
 * Tests the video stitching utility with sample videos.
 */

import { stitchVideos } from '../lib/video/stitcher';
import fs from 'fs/promises';

async function testVideoStitching() {
  console.log('🧪 Testing Video Stitcher...\n');

  // Get video paths from command line arguments
  const videoPaths = process.argv.slice(2);

  if (videoPaths.length === 0) {
    console.log('⚠️  No video files provided.');
    console.log('   Usage: npm run test:video-stitcher <video1.mp4> <video2.mp4> ...');
    console.log('\n   Example:');
    console.log('   npm run test:video-stitcher scene-0.mp4 scene-1.mp4 scene-2.mp4');
    process.exit(1);
  }

  const projectId = 'test-project-' + Date.now();

  try {
    // Verify all video files exist
    console.log('🔍 Verifying video files...');
    for (const videoPath of videoPaths) {
      try {
        await fs.access(videoPath);
        console.log(`  ✅ ${videoPath} exists`);
      } catch {
        console.error(`  ❌ ${videoPath} not found`);
        process.exit(1);
      }
    }

    console.log(`\n📹 Stitching ${videoPaths.length} videos...`);
    console.log(`📁 Project ID: ${projectId}\n`);

    const outputPath = await stitchVideos(videoPaths, projectId);

    console.log(`✅ Successfully stitched videos!`);
    console.log(`📁 Output: ${outputPath}`);

    // Verify output file exists
    try {
      await fs.access(outputPath);
      const stats = await fs.stat(outputPath);
      console.log(`📊 File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      console.log('\n✅ Video stitching test passed!');
      process.exit(0);
    } catch {
      console.error('\n❌ Output file not found');
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ Video stitching test failed:');
    console.error(`   ${error.message}`);
    process.exit(1);
  }
}

testVideoStitching().catch(console.error);

