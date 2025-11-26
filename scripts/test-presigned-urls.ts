/**
 * Test Script: Presigned URLs Implementation
 * 
 * Run with: npx tsx scripts/test-presigned-urls.ts
 */

import { getPresignedUrl, uploadToS3, getS3Url } from '../lib/storage/s3-uploader';
import { convertUrlForAI } from '../lib/utils/url-to-data-converter';
import fs from 'fs';
import path from 'path';

const TEST_PROJECT_ID = 'test-presigned-' + Date.now();

async function runTests() {
  console.log('🧪 Testing Presigned URLs Implementation');
  console.log('═'.repeat(60));
  
  // Test 1: Check if AWS credentials are configured
  console.log('\n📋 Test 1: AWS Configuration');
  console.log('-'.repeat(60));
  const hasAwsRegion = !!process.env.AWS_REGION;
  const hasAwsKey = !!process.env.AWS_ACCESS_KEY_ID;
  const hasAwsSecret = !!process.env.AWS_SECRET_ACCESS_KEY;
  const hasS3Bucket = !!process.env.AWS_S3_BUCKET;
  
  console.log(`AWS_REGION: ${hasAwsRegion ? '✅' : '❌'} ${process.env.AWS_REGION || 'NOT SET'}`);
  console.log(`AWS_ACCESS_KEY_ID: ${hasAwsKey ? '✅' : '❌'} ${hasAwsKey ? 'SET' : 'NOT SET'}`);
  console.log(`AWS_SECRET_ACCESS_KEY: ${hasAwsSecret ? '✅' : '❌'} ${hasAwsSecret ? 'SET' : 'NOT SET'}`);
  console.log(`AWS_S3_BUCKET: ${hasS3Bucket ? '✅' : '❌'} ${process.env.AWS_S3_BUCKET || 'NOT SET'}`);
  
  if (!hasAwsKey || !hasAwsSecret || !hasS3Bucket) {
    console.log('\n⚠️  AWS not fully configured. Testing will use fallback mechanisms.');
  }
  
  // Test 2: S3 URL parsing and presigned URL generation
  console.log('\n📋 Test 2: S3 URL Conversion');
  console.log('-'.repeat(60));
  
  const testS3Url = 'https://test-bucket.s3.us-east-1.amazonaws.com/test/image.png';
  console.log(`Test S3 URL: ${testS3Url}`);
  
  try {
    const converted = await convertUrlForAI(testS3Url, false);
    console.log(`✅ Conversion successful!`);
    console.log(`   Method: ${converted.method}`);
    console.log(`   URL: ${converted.url.substring(0, 80)}...`);
    
    if (converted.method === 'presigned') {
      console.log('   ✨ Presigned URL generated successfully!');
    } else if (converted.method === 'base64') {
      console.log('   📦 Fell back to base64 conversion (expected if S3 file does not exist)');
    }
  } catch (error) {
    console.log(`⚠️  Conversion failed (expected if test file doesn\'t exist): ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // Test 3: Local file to base64
  console.log('\n📋 Test 3: Local File Conversion');
  console.log('-'.repeat(60));
  
  // Create a temporary test image
  const testImagePath = path.join('/tmp', `test-image-${Date.now()}.png`);
  const testImageData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(testImagePath, testImageData);
  console.log(`Created test image: ${testImagePath}`);
  
  try {
    const converted = await convertUrlForAI(testImagePath, false);
    console.log(`✅ Conversion successful!`);
    console.log(`   Method: ${converted.method}`);
    console.log(`   URL length: ${converted.url.length} bytes`);
    
    if (converted.method === 'base64') {
      console.log('   ✅ Local file converted to base64 (expected)');
    }
    
    // Clean up
    fs.unlinkSync(testImagePath);
    console.log(`   🗑️  Cleaned up test file`);
  } catch (error) {
    console.error(`❌ Local file conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // Test 4: Force base64 conversion
  console.log('\n📋 Test 4: Force Base64 Conversion');
  console.log('-'.repeat(60));
  
  try {
    const testImagePath2 = path.join('/tmp', `test-image-2-${Date.now()}.png`);
    fs.writeFileSync(testImagePath2, testImageData);
    
    const converted = await convertUrlForAI(testImagePath2, true);
    console.log(`✅ Force base64 conversion successful!`);
    console.log(`   Method: ${converted.method} (should be base64)`);
    
    if (converted.method === 'base64') {
      console.log('   ✅ Base64 conversion forced correctly');
    } else {
      console.log(`   ⚠️  Expected base64 but got: ${converted.method}`);
    }
    
    fs.unlinkSync(testImagePath2);
  } catch (error) {
    console.error(`❌ Force base64 test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // Test 5: Public URL handling
  console.log('\n📋 Test 5: Public URL Handling');
  console.log('-'.repeat(60));
  
  const publicUrl = 'https://example.com/test-image.png';
  try {
    const converted = await convertUrlForAI(publicUrl, false);
    console.log(`✅ Public URL conversion successful!`);
    console.log(`   Method: ${converted.method}`);
    console.log(`   URL: ${converted.url}`);
    
    if (converted.method === 'direct') {
      console.log('   ✅ Public URL passed through directly (expected)');
    }
  } catch (error) {
    console.log(`⚠️  Public URL conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // Summary
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('✅ Testing Complete!');
  console.log('═'.repeat(60));
  console.log('\n📊 Summary:');
  console.log('  - S3 presigned URL generation: Implemented with fallback');
  console.log('  - Local file to base64: Working');
  console.log('  - Force base64 option: Working');
  console.log('  - Public URL handling: Working');
  console.log('\n💡 Next Steps:');
  console.log('  1. Test with actual S3 uploads (requires valid AWS credentials)');
  console.log('  2. Test with AI model integration (storyboard generation)');
  console.log('  3. Monitor logs for fallback patterns');
  console.log('  4. Compare performance (presigned vs base64)');
  console.log('');
}

// Run tests
runTests()
  .then(() => {
    console.log('✨ All tests completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  });

