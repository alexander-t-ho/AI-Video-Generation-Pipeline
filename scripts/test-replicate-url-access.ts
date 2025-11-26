/**
 * Test Script: Replicate API URL Access
 * 
 * Tests if Replicate can access images via:
 * 1. Presigned S3 URLs
 * 2. Base64 data URLs (fallback)
 * 
 * Run with: npx tsx scripts/test-replicate-url-access.ts
 */

import Replicate from 'replicate';
import { uploadToS3, getS3Url, getPresignedUrl } from '../lib/storage/s3-uploader';
import { convertUrlForAI } from '../lib/utils/url-to-data-converter';
import fs from 'fs';
import path from 'path';

// Load environment variables from .env.local
try {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
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

// Use background removal as a simple test (doesn't cost much)
const TEST_MODEL = 'cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003';
const TEST_PROJECT_ID = 'test-url-' + Date.now();

async function createTestImage(): Promise<string> {
  // Create a small 1x1 pixel PNG (smallest valid image)
  const testImagePath = path.join('/tmp', `test-replicate-${Date.now()}.png`);
  const pngData = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  fs.writeFileSync(testImagePath, pngData);
  return testImagePath;
}

async function testReplicateWithUrl(
  replicate: Replicate,
  imageUrl: string,
  testName: string
): Promise<boolean> {
  console.log(`\n📸 Testing: ${testName}`);
  console.log('-'.repeat(60));
  console.log(`Image URL: ${imageUrl.substring(0, 100)}${imageUrl.length > 100 ? '...' : ''}`);
  
  try {
    console.log('Creating Replicate prediction...');
    const startTime = Date.now();
    
    const prediction = await replicate.predictions.create({
      version: TEST_MODEL,
      input: {
        image: imageUrl,
      },
    });
    
    if (!prediction.id) {
      throw new Error('No prediction ID returned');
    }
    
    console.log(`✅ Prediction created: ${prediction.id}`);
    console.log(`   Status: ${prediction.status}`);
    console.log(`   Time to create: ${Date.now() - startTime}ms`);
    
    // Poll for completion (max 30 seconds)
    let attempts = 0;
    const maxAttempts = 15;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const status = await replicate.predictions.get(prediction.id);
      console.log(`   Polling (${attempts + 1}/${maxAttempts}): ${status.status}`);
      
      if (status.status === 'succeeded') {
        console.log(`✅ Prediction succeeded!`);
        console.log(`   Total time: ${Date.now() - startTime}ms`);
        return true;
      } else if (status.status === 'failed') {
        console.log(`❌ Prediction failed: ${status.error}`);
        return false;
      } else if (status.status === 'canceled') {
        console.log(`❌ Prediction canceled`);
        return false;
      }
      
      attempts++;
    }
    
    console.log(`⚠️  Prediction timed out after ${maxAttempts * 2} seconds`);
    return false;
    
  } catch (error) {
    console.log(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
}

async function runTests() {
  console.log('🧪 Testing Replicate API URL Access');
  console.log('═'.repeat(60));
  
  // Check for Replicate API token
  if (!process.env.REPLICATE_API_TOKEN) {
    console.log('❌ REPLICATE_API_TOKEN not set!');
    console.log('   Please set it in .env.local:');
    console.log('   REPLICATE_API_TOKEN=r8_your_token_here');
    console.log('');
    console.log('   Note: This is the same as your Replicate API key');
    console.log('   Get it from: https://replicate.com/account/api-tokens');
    process.exit(1);
  }
  
  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });
  
  console.log('✅ Replicate client initialized');
  
  // Create test image
  console.log('\n📋 Step 1: Creating Test Image');
  console.log('-'.repeat(60));
  const testImagePath = await createTestImage();
  console.log(`✅ Created test image: ${testImagePath}`);
  console.log(`   Size: ${fs.statSync(testImagePath).size} bytes`);
  
  const results: { [key: string]: boolean } = {};
  
  // Test 1: Base64 Data URL (baseline)
  console.log('\n📋 Test 1: Base64 Data URL (Baseline)');
  console.log('═'.repeat(60));
  try {
    const base64Data = fs.readFileSync(testImagePath).toString('base64');
    const base64Url = `data:image/png;base64,${base64Data}`;
    results['base64'] = await testReplicateWithUrl(replicate, base64Url, 'Base64 Data URL');
  } catch (error) {
    console.log(`❌ Base64 test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    results['base64'] = false;
  }
  
  // Test 2: S3 URL with Presigned URL (if AWS configured)
  const hasAwsConfig = !!process.env.AWS_ACCESS_KEY_ID && 
                       !!process.env.AWS_SECRET_ACCESS_KEY && 
                       !!process.env.AWS_S3_BUCKET;
  
  if (hasAwsConfig) {
    console.log('\n📋 Test 2: S3 Presigned URL');
    console.log('═'.repeat(60));
    
    try {
      // Upload to S3
      console.log('Uploading test image to S3...');
      const s3Key = await uploadToS3(testImagePath, TEST_PROJECT_ID, {
        contentType: 'image/png',
        metadata: {
          'test-type': 'replicate-url-test',
        },
      });
      console.log(`✅ Uploaded to S3: ${s3Key}`);
      
      // Generate presigned URL
      console.log('Generating presigned URL...');
      const presignedUrl = await getPresignedUrl(s3Key, 3600);
      console.log(`✅ Presigned URL generated`);
      console.log(`   URL length: ${presignedUrl.length} characters`);
      
      // Test with Replicate
      results['presigned'] = await testReplicateWithUrl(
        replicate,
        presignedUrl,
        'S3 Presigned URL'
      );
      
    } catch (error) {
      console.log(`❌ Presigned URL test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      results['presigned'] = false;
    }
    
    // Test 3: Using convertUrlForAI (automatic strategy)
    console.log('\n📋 Test 3: Auto Conversion (convertUrlForAI)');
    console.log('═'.repeat(60));
    
    try {
      const s3Url = getS3Url(await uploadToS3(testImagePath, TEST_PROJECT_ID + '-auto'));
      console.log(`S3 URL: ${s3Url.substring(0, 80)}...`);
      
      const converted = await convertUrlForAI(s3Url);
      console.log(`✅ Converted using method: ${converted.method}`);
      
      results['auto'] = await testReplicateWithUrl(
        replicate,
        converted.url,
        `Auto Conversion (${converted.method})`
      );
      
    } catch (error) {
      console.log(`❌ Auto conversion test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      results['auto'] = false;
    }
    
  } else {
    console.log('\n⚠️  Skipping S3 tests - AWS not configured');
    console.log('   Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET to test S3');
  }
  
  // Test 4: Local file with convertUrlForAI
  console.log('\n📋 Test 4: Local File Conversion');
  console.log('═'.repeat(60));
  
  try {
    const converted = await convertUrlForAI(testImagePath);
    console.log(`✅ Converted local file using method: ${converted.method}`);
    
    results['local'] = await testReplicateWithUrl(
      replicate,
      converted.url,
      `Local File (${converted.method})`
    );
    
  } catch (error) {
    console.log(`❌ Local file test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    results['local'] = false;
  }
  
  // Cleanup
  console.log('\n🗑️  Cleaning up test files...');
  try {
    fs.unlinkSync(testImagePath);
    console.log('✅ Test files cleaned up');
  } catch (error) {
    console.log('⚠️  Failed to clean up test files');
  }
  
  // Summary
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('═'.repeat(60));
  
  Object.entries(results).forEach(([test, passed]) => {
    const icon = passed ? '✅' : '❌';
    const status = passed ? 'PASSED' : 'FAILED';
    console.log(`${icon} ${test.padEnd(20)} ${status}`);
  });
  
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(r => r).length;
  
  console.log('\n');
  console.log(`Tests Passed: ${passedTests}/${totalTests}`);
  
  if (passedTests === totalTests) {
    console.log('\n🎉 All tests passed!');
  } else {
    console.log('\n⚠️  Some tests failed. Check logs above for details.');
  }
  
  console.log('\n💡 Key Findings:');
  if (results.presigned) {
    console.log('  ✅ Presigned URLs work with Replicate!');
    console.log('  ✅ This should significantly reduce latency vs base64');
  }
  if (results.base64) {
    console.log('  ✅ Base64 fallback works reliably');
  }
  if (results.auto) {
    console.log('  ✅ Automatic conversion strategy works correctly');
  }
  
  console.log('');
  
  return passedTests === totalTests;
}

// Run tests
runTests()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('💥 Test suite crashed:', error);
    process.exit(1);
  });

