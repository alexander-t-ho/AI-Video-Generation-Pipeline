/**
 * Quick Video Generation Test
 *
 * Generates a simple test video using Replicate API to verify your API key works.
 * Uses a placeholder image and basic prompt for fast testing.
 */

import dotenv from 'dotenv';
import { generateVideo } from '../lib/video/generator';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

async function main() {
  console.log('🚀 Quick Video Generation Test\n');

  // Check environment variables
  const apiToken = process.env.REPLICATE_API_TOKEN;
  console.log('Environment Variables:');
  console.log(`  REPLICATE_API_TOKEN: ${apiToken ? '✅ Set' : '❌ Not set'}\n`);

  if (!apiToken) {
    console.error('❌ REPLICATE_API_TOKEN not configured');
    console.log('\nPlease set the following environment variable:');
    console.log('  REPLICATE_API_TOKEN=your_replicate_api_token_here');
    console.log('\nYou can get your token from: https://replicate.com/account/api-tokens');
    process.exit(1);
  }

  // Validate API token format
  if (!apiToken.startsWith('r8_')) {
    console.warn('⚠️  API token format may be invalid. Expected format: r8_...');
    console.warn('   Make sure you copied the full token from Replicate.\n');
  }

  try {
    console.log('📹 Generating test video...\n');

    // Use a simple placeholder image URL for testing
    // This is a basic colored square - you can replace with any image URL
    const testImageUrl = 'https://picsum.photos/1024/576?random=1';

    // Simple test prompt
    const testPrompt = 'A red sports car driving smoothly on a scenic highway at sunset';

    console.log('Test Parameters:');
    console.log(`  Image: ${testImageUrl}`);
    console.log(`  Prompt: "${testPrompt}"`);
    console.log(`  Duration: 5 seconds`);
    console.log(`  Model: Default (WAN 2.2 i2v-fast)`);
    console.log('');

    // Generate the video
    const outputPath = await generateVideo(
      testImageUrl,
      testPrompt,
      undefined, // no seed frame
      'quick-test',
      0 // scene index
    );

    console.log('\n✅ SUCCESS! Video generated successfully!');
    console.log(`📁 Saved to: ${outputPath}`);

    // Get file size
    const fs = require('fs/promises');
    try {
      const stats = await fs.stat(outputPath);
      console.log(`📊 File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    } catch (error) {
      // Ignore file size check errors
    }

    console.log('\n🎉 Your Replicate API key is working correctly!');
    console.log('   You can now use it for video generation in your application.');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);

    if (error.message.includes('authentication') || error.message.includes('401')) {
      console.log('\n🔐 Authentication Error:');
      console.log('   - Check that your REPLICATE_API_TOKEN is correct');
      console.log('   - Make sure it starts with "r8_"');
      console.log('   - Verify the token hasn\'t expired');
      console.log('   - Get a new token from: https://replicate.com/account/api-tokens');
    } else if (error.message.includes('rate limit') || error.message.includes('429')) {
      console.log('\n⏱️  Rate Limit Error:');
      console.log('   - You\'ve exceeded your API quota');
      console.log('   - Check your Replicate account for usage limits');
      console.log('   - Try again later or upgrade your plan');
    } else {
      console.log('\n🔧 Other Error:');
      console.log('   - Check your internet connection');
      console.log('   - Verify the model is available');
      console.log('   - Try a different image URL if the current one fails');
    }

    process.exit(1);
  }
}

main().catch(console.error);
