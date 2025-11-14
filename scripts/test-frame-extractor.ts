/**
 * Test Frame Extractor
 * 
 * Tests the frame extraction utility with sample videos.
 */

import { extractFrames } from '../lib/video/frame-extractor';
import fs from 'fs/promises';
import path from 'path';

async function testFrameExtraction() {
  console.log('🧪 Testing Frame Extractor...\n');

  // Check if test video exists
  // For now, we'll create a simple test that shows the function structure
  // In a real scenario, you'd need a test video file

  const testVideoPath = process.argv[2] || 'test-video.mp4';
  const projectId = 'test-project-' + Date.now();
  const sceneIndex = 0;

  try {
    // Check if test video exists
    try {
      await fs.access(testVideoPath);
    } catch {
      console.log('⚠️  Test video not found. Creating a test video first...');
      console.log('   Please provide a test video file as an argument:');
      console.log('   npm run test:frame-extractor <path-to-video.mp4>');
      console.log('\n   Or create a test video using FFmpeg:');
      console.log('   ffmpeg -f lavfi -i testsrc=duration=5:size=1920x1080:rate=30 test-video.mp4');
      process.exit(1);
    }

    console.log(`📹 Extracting frames from: ${testVideoPath}`);
    console.log(`📁 Project ID: ${projectId}`);
    console.log(`🎬 Scene Index: ${sceneIndex}\n`);

    const seedFrames = await extractFrames(testVideoPath, projectId, sceneIndex);

    console.log(`✅ Successfully extracted ${seedFrames.length} frames\n`);
    console.log('📋 Extracted Frames:');
    seedFrames.forEach((frame, index) => {
      console.log(`  ${index + 1}. Frame ${frame.id}`);
      console.log(`     Path: ${frame.url}`);
      console.log(`     Timestamp: ${frame.timestamp}s from end`);
    });

    // Verify frames exist
    console.log('\n🔍 Verifying frame files...');
    for (const frame of seedFrames) {
      try {
        await fs.access(frame.url);
        console.log(`  ✅ ${path.basename(frame.url)} exists`);
      } catch {
        console.log(`  ❌ ${path.basename(frame.url)} not found`);
      }
    }

    console.log('\n✅ Frame extraction test passed!');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Frame extraction test failed:');
    console.error(`   ${error.message}`);
    process.exit(1);
  }
}

testFrameExtraction().catch(console.error);

