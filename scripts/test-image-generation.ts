/**
 * Test script for image generation
 * 
 * Usage:
 *   npx tsx scripts/test-image-generation.ts
 * 
 * Or with ts-node:
 *   npx ts-node scripts/test-image-generation.ts
 * 
 * Tests:
 * 1. Direct function tests (createImagePrediction, pollReplicateStatus, etc.)
 * 2. API endpoint tests (POST /api/generate-image, GET /api/generate-image/[predictionId])
 * 3. Complete flow test (generateImage)
 */

import {
  createImagePredictionWithRetry,
  pollReplicateStatus,
  downloadAndSaveImageWithRetry,
  generateImage,
} from '../lib/ai/image-generator';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

// Load environment variables from .env.local if it exists (synchronous for top-level)
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
  } else {
    console.log('ℹ️  No .env.local file found (using system environment variables)\n');
  }
} catch (error) {
  // .env.local doesn't exist or can't be read, that's okay
  console.log('ℹ️  Could not load .env.local (using system environment variables)\n');
}

// Test configuration
const TEST_PROJECT_ID = 'test-project-' + Date.now();
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// Test prompts
const TEST_PROMPTS = [
  {
    name: 'Scene 0 - No Seed',
    prompt: 'Professional product photography of luxury watch, golden hour lighting, elegant composition, minimalist aesthetic, 16:9 aspect ratio, high-end commercial style',
    sceneIndex: 0,
    seedImage: undefined,
  },
  {
    name: 'Scene 1 - With Seed (if available)',
    prompt: 'Extreme close-up of luxury watch face, intricate details, golden hour lighting, shallow depth of field, premium materials visible, 16:9 aspect ratio',
    sceneIndex: 1,
    seedImage: undefined, // Will be set if Scene 0 succeeds
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getFileSize(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

// ============================================================================
// Test 1: Direct Function Tests
// ============================================================================

async function testDirectFunctions() {
  console.log('\n🧪 Test 1: Direct Function Tests');
  console.log('='.repeat(60));

  // Check for API key
  if (!process.env.REPLICATE_API_TOKEN) {
    console.error('❌ ERROR: REPLICATE_API_TOKEN environment variable is not set');
    console.error('   Please set it in .env.local file');
    return false;
  }

  console.log('✅ Replicate API token found\n');

  // Test 1.1: Create Image Prediction
  console.log('📝 Test 1.1: Create Image Prediction');
  console.log('-'.repeat(60));
  try {
    const testPrompt = TEST_PROMPTS[0].prompt;
    console.log(`   Prompt: "${testPrompt.substring(0, 60)}..."`);

    const startTime = Date.now();
    const predictionId = await createImagePredictionWithRetry(testPrompt);
    const duration = Date.now() - startTime;

    console.log(`✅ Success! Prediction created in ${duration}ms`);
    console.log(`   Prediction ID: ${predictionId}`);

    // Test 1.2: Poll Status
    console.log('\n📝 Test 1.2: Poll Prediction Status');
    console.log('-'.repeat(60));
    console.log(`   Polling prediction: ${predictionId}`);
    console.log('   (This may take 1-5 seconds...)');

    const pollStartTime = Date.now();
    const imageUrl = await pollReplicateStatus(predictionId);
    const pollDuration = Date.now() - pollStartTime;

    console.log(`✅ Success! Image generated in ${pollDuration}ms`);
    console.log(`   Image URL: ${imageUrl.substring(0, 80)}...`);

    // Test 1.3: Download and Save
    console.log('\n📝 Test 1.3: Download and Save Image');
    console.log('-'.repeat(60));
    console.log(`   Project ID: ${TEST_PROJECT_ID}`);
    console.log(`   Scene Index: 0`);

    const downloadStartTime = Date.now();
    const generatedImage = await downloadAndSaveImageWithRetry(
      imageUrl,
      TEST_PROJECT_ID,
      0
    );
    const downloadDuration = Date.now() - downloadStartTime;

    console.log(`✅ Success! Image downloaded in ${downloadDuration}ms`);
    console.log(`   Image ID: ${generatedImage.id}`);
    console.log(`   Local Path: ${generatedImage.localPath}`);

    // Verify file exists
    const fileExists = await checkFileExists(generatedImage.localPath);
    if (fileExists) {
      const fileSize = await getFileSize(generatedImage.localPath);
      console.log(`   File Size: ${(fileSize / 1024).toFixed(2)} KB`);
      console.log(`✅ File verified on disk`);
    } else {
      console.error(`❌ File not found at: ${generatedImage.localPath}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`❌ Failed:`, error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error('   Stack:', error.stack);
    }
    return false;
  }
}

// ============================================================================
// Test 2: Complete Flow Test
// ============================================================================

async function testCompleteFlow() {
  console.log('\n🧪 Test 2: Complete Flow Test (generateImage)');
  console.log('='.repeat(60));

  try {
    const testPrompt = TEST_PROMPTS[0].prompt;
    console.log(`   Prompt: "${testPrompt.substring(0, 60)}..."`);
    console.log(`   Project ID: ${TEST_PROJECT_ID}`);
    console.log(`   Scene Index: 0`);

    const startTime = Date.now();
    const generatedImage = await generateImage(
      testPrompt,
      TEST_PROJECT_ID,
      0
    );
    const duration = Date.now() - startTime;

    console.log(`✅ Success! Complete flow finished in ${duration}ms`);
    console.log(`   Image ID: ${generatedImage.id}`);
    console.log(`   Replicate ID: ${generatedImage.replicateId}`);
    console.log(`   Local Path: ${generatedImage.localPath}`);
    console.log(`   Created At: ${generatedImage.createdAt}`);

    // Verify file exists
    const fileExists = await checkFileExists(generatedImage.localPath);
    if (fileExists) {
      const fileSize = await getFileSize(generatedImage.localPath);
      console.log(`   File Size: ${(fileSize / 1024).toFixed(2)} KB`);
      console.log(`✅ File verified on disk`);
    } else {
      console.error(`❌ File not found at: ${generatedImage.localPath}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`❌ Failed:`, error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error('   Stack:', error.stack);
    }
    return false;
  }
}

// ============================================================================
// Test 3: API Endpoint Tests
// ============================================================================

async function testAPIEndpoints() {
  console.log('\n🧪 Test 3: API Endpoint Tests');
  console.log('='.repeat(60));
  console.log(`   Base URL: ${BASE_URL}`);
  console.log('   Note: This requires the Next.js dev server to be running');
  console.log('   Start it with: npm run dev\n');

  // Test 3.1: POST /api/generate-image
  console.log('📝 Test 3.1: POST /api/generate-image');
  console.log('-'.repeat(60));

  try {
    const testPrompt = TEST_PROMPTS[0].prompt;
    const requestBody = {
      prompt: testPrompt,
      projectId: TEST_PROJECT_ID,
      sceneIndex: 0,
    };

    console.log(`   Sending request...`);
    const startTime = Date.now();
    const response = await fetch(`${BASE_URL}/api/generate-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const duration = Date.now() - startTime;
    const data = await response.json();

    if (!response.ok) {
      console.error(`❌ API Error (${response.status}):`, data);
      return false;
    }

    if (!data.success || !data.predictionId) {
      console.error(`❌ Invalid response:`, data);
      return false;
    }

    console.log(`✅ Success! Prediction created in ${duration}ms`);
    console.log(`   Prediction ID: ${data.predictionId}`);
    console.log(`   Status: ${data.status}`);

    // Test 3.2: GET /api/generate-image/[predictionId]
    console.log('\n📝 Test 3.2: GET /api/generate-image/[predictionId]');
    console.log('-'.repeat(60));
    console.log(`   Polling prediction: ${data.predictionId}`);
    console.log('   (This may take 1-5 seconds...)');

    const predictionId = data.predictionId;
    let attempts = 0;
    const maxAttempts = 20; // 20 attempts * 2 seconds = 40 seconds max

    while (attempts < maxAttempts) {
      await sleep(2000); // Wait 2 seconds between polls

      const statusResponse = await fetch(
        `${BASE_URL}/api/generate-image/${predictionId}?projectId=${TEST_PROJECT_ID}&sceneIndex=0&prompt=${encodeURIComponent(testPrompt)}`
      );
      const statusData = await statusResponse.json();

      if (!statusResponse.ok) {
        console.error(`❌ Status check failed (${statusResponse.status}):`, statusData);
        return false;
      }

      attempts++;
      console.log(`   Attempt ${attempts}/${maxAttempts}: Status = ${statusData.status}`);

      if (statusData.status === 'succeeded') {
        if (statusData.image) {
          console.log(`✅ Success! Image generated and saved`);
          console.log(`   Image ID: ${statusData.image.id}`);
          console.log(`   Local Path: ${statusData.image.localPath}`);

          // Verify file exists
          const fileExists = await checkFileExists(statusData.image.localPath);
          if (fileExists) {
            const fileSize = await getFileSize(statusData.image.localPath);
            console.log(`   File Size: ${(fileSize / 1024).toFixed(2)} KB`);
            console.log(`✅ File verified on disk`);
          } else {
            console.error(`❌ File not found at: ${statusData.image.localPath}`);
            return false;
          }
        } else {
          console.log(`✅ Prediction succeeded but image not downloaded (no projectId/sceneIndex provided)`);
        }
        return true;
      } else if (statusData.status === 'failed') {
        console.error(`❌ Prediction failed:`, statusData.error);
        return false;
      } else if (statusData.status === 'canceled') {
        console.error(`❌ Prediction was canceled`);
        return false;
      }
      // Continue polling if status is 'starting' or 'processing'
    }

    console.error(`❌ Timeout: Prediction did not complete after ${maxAttempts} attempts`);
    return false;
  } catch (error) {
    if (error instanceof Error && error.message.includes('fetch')) {
      console.error(`❌ Failed to connect to API. Is the dev server running?`);
      console.error(`   Start it with: npm run dev`);
    } else {
      console.error(`❌ Failed:`, error instanceof Error ? error.message : error);
    }
    return false;
  }
}

// ============================================================================
// Test 4: Error Handling Tests
// ============================================================================

async function testErrorHandling() {
  console.log('\n🧪 Test 4: Error Handling Tests');
  console.log('='.repeat(60));

  // Test 4.1: Invalid prompt
  console.log('📝 Test 4.1: Invalid Prompt (empty string)');
  console.log('-'.repeat(60));
  try {
    await createImagePredictionWithRetry('');
    console.error('❌ Should have thrown an error for empty prompt');
    return false;
  } catch (error) {
    if (error instanceof Error && error.message.includes('required')) {
      console.log(`✅ Correctly rejected empty prompt`);
    } else {
      console.error(`❌ Unexpected error:`, error);
      return false;
    }
  }

  // Test 4.2: Invalid project ID
  console.log('\n📝 Test 4.2: Invalid Project ID');
  console.log('-'.repeat(60));
  try {
    await downloadAndSaveImageWithRetry('https://example.com/image.png', '', 0);
    console.error('❌ Should have thrown an error for empty project ID');
    return false;
  } catch (error) {
    if (error instanceof Error && error.message.includes('required')) {
      console.log(`✅ Correctly rejected empty project ID`);
    } else {
      console.error(`❌ Unexpected error:`, error);
      return false;
    }
  }

  // Test 4.3: Invalid scene index
  console.log('\n📝 Test 4.3: Invalid Scene Index');
  console.log('-'.repeat(60));
  try {
    await downloadAndSaveImageWithRetry('https://example.com/image.png', 'test', 10);
    console.error('❌ Should have thrown an error for invalid scene index');
    return false;
  } catch (error) {
    if (error instanceof Error && error.message.includes('between 0 and 4')) {
      console.log(`✅ Correctly rejected invalid scene index`);
    } else {
      console.error(`❌ Unexpected error:`, error);
      return false;
    }
  }

  return true;
}

// ============================================================================
// Main Test Runner
// ============================================================================


async function runAllTests() {
  console.log('🚀 Image Generation Test Suite');
  console.log('='.repeat(60));
  console.log(`Test Project ID: ${TEST_PROJECT_ID}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const results = {
    directFunctions: false,
    completeFlow: false,
    apiEndpoints: false,
    errorHandling: false,
  };

  // Run tests
  results.directFunctions = await testDirectFunctions();
  results.completeFlow = await testCompleteFlow();
  results.errorHandling = await testErrorHandling();

  // API endpoint test is optional (requires dev server)
  console.log('\n⚠️  API endpoint test requires dev server to be running');
  console.log('   Skip this test? (y/n) - or wait 5 seconds to continue...');
  
  // For automated testing, we'll skip the API test if server isn't available
  try {
    const testResponse = await fetch(`${BASE_URL}/api/generate-image`, {
      method: 'GET',
    });
    if (testResponse.ok) {
      results.apiEndpoints = await testAPIEndpoints();
    } else {
      console.log('   ⏭️  Skipping API endpoint tests (dev server not available)');
    }
  } catch {
    console.log('   ⏭️  Skipping API endpoint tests (dev server not available)');
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Results Summary');
  console.log('='.repeat(60));
  console.log(`Direct Functions:     ${results.directFunctions ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Complete Flow:        ${results.completeFlow ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`API Endpoints:        ${results.apiEndpoints ? '✅ PASS' : '⏭️  SKIP'}`);
  console.log(`Error Handling:       ${results.errorHandling ? '✅ PASS' : '❌ FAIL'}`);

  const allPassed = Object.values(results).every((result) => result !== false);
  const passedCount = Object.values(results).filter((r) => r === true).length;
  const totalCount = Object.keys(results).length;

  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log(`✅ All tests passed! (${passedCount}/${totalCount})`);
  } else {
    console.log(`⚠️  Some tests failed or were skipped (${passedCount}/${totalCount} passed)`);
  }
  console.log('='.repeat(60));

  // Cleanup (optional - comment out if you want to keep test files)
  // try {
  //   const testDir = path.join('/tmp', 'projects', TEST_PROJECT_ID);
  //   await fs.rm(testDir, { recursive: true, force: true });
  //   console.log(`\n🧹 Cleaned up test directory: ${testDir}`);
  // } catch (error) {
  //   console.log(`\n⚠️  Could not clean up test directory: ${error}`);
  // }
}

// Run tests
runAllTests().catch((error) => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});

