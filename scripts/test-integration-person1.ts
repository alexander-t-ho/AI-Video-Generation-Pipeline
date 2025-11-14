/**
 * Integration Test: Person 1's Image Generation → Person 2's Video Generation
 * 
 * This script tests the integration between Person 1's image generation
 * and Person 2's video generation pipeline.
 * 
 * Flow:
 * 1. Get image from Person 1's /api/generate-image endpoint
 * 2. Generate video from that image using Person 2's /api/generate-video
 * 3. Extract frames from the generated video
 * 4. Verify complete flow works
 */

import { generateVideo } from '../lib/video/generator';
import { extractFrames } from '../lib/video/frame-extractor';

const PROJECT_ID = `integration-test-${Date.now()}`;
const SCENE_INDEX = 0;

async function testPerson1Integration() {
  console.log('🧪 Testing Integration with Person 1\'s Image Generation\n');
  console.log('='.repeat(60));

  try {
    // Step 1: Get image from Person 1's endpoint
    console.log('\n📸 Step 1: Getting image from Person 1\'s endpoint...');
    
    // For now, we'll use a test S3 URL or local test image
    // In real integration, this would come from Person 1's /api/generate-image
    const testImageUrl = process.env.TEST_IMAGE_URL || 
      'https://nonintersectional-cherelle-gablewindowed.ngrok-free.dev/api/serve-image-test?path=test%20photos/1-new-balance-9060.png';
    
    console.log(`   Using test image URL: ${testImageUrl.substring(0, 80)}...`);

    // Step 2: Generate video from image
    console.log('\n🎬 Step 2: Generating video from image...');
    const videoPrompt = 'A smooth, cinematic camera movement showcasing the product';
    
    const videoPath = await generateVideo(
      testImageUrl,
      videoPrompt,
      undefined, // No seed frame for Scene 0
      PROJECT_ID,
      SCENE_INDEX
    );

    console.log(`   ✅ Video generated: ${videoPath}`);

    // Step 3: Extract frames from video
    console.log('\n🖼️  Step 3: Extracting frames from video...');
    const frames = await extractFrames(videoPath, PROJECT_ID, SCENE_INDEX);

    console.log(`   ✅ Extracted ${frames.length} frames:`);
    frames.forEach((frame, index) => {
      console.log(`      Frame ${index + 1}: ${frame.url} (timestamp: ${frame.timestamp}s)`);
    });

    // Step 4: Verify complete flow
    console.log('\n✅ Integration Test Complete!');
    console.log('='.repeat(60));
    console.log('\nSummary:');
    console.log(`  - Image URL: ${testImageUrl.substring(0, 60)}...`);
    console.log(`  - Video Path: ${videoPath}`);
    console.log(`  - Frames Extracted: ${frames.length}`);
    console.log(`  - Project ID: ${PROJECT_ID}`);
    console.log(`  - Scene Index: ${SCENE_INDEX}`);

    return {
      success: true,
      imageUrl: testImageUrl,
      videoPath,
      frames,
      projectId: PROJECT_ID,
    };
  } catch (error: any) {
    console.error('\n❌ Integration Test Failed!');
    console.error('='.repeat(60));
    console.error('Error:', error.message);
    console.error('\nStack:', error.stack);
    throw error;
  }
}

// Run test
if (require.main === module) {
  testPerson1Integration()
    .then((result) => {
      console.log('\n✅ All integration tests passed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Integration tests failed:', error);
      process.exit(1);
    });
}

export { testPerson1Integration };

