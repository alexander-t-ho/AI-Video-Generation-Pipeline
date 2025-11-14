/**
 * Test S3 Uploader
 * 
 * Tests the S3 upload utility with a test file.
 */

import { uploadToS3, getS3Url } from '../lib/storage/s3-uploader';
import fs from 'fs/promises';
import path from 'path';

async function testS3Upload() {
  console.log('🧪 Testing S3 Uploader...\n');

  const testFilePath = process.argv[2];

  if (!testFilePath) {
    console.log('⚠️  No file provided.');
    console.log('   Usage: npm run test:s3-uploader <path-to-file>');
    console.log('\n   Example:');
    console.log('   npm run test:s3-uploader test-video.mp4');
    process.exit(1);
  }

  const projectId = 'test-project-' + Date.now();

  try {
    // Check if test file exists
    try {
      await fs.access(testFilePath);
    } catch {
      console.error(`❌ File not found: ${testFilePath}`);
      process.exit(1);
    }

    const stats = await fs.stat(testFilePath);
    console.log(`📁 File: ${testFilePath}`);
    console.log(`📊 Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📁 Project ID: ${projectId}\n`);

    console.log('☁️  Uploading to S3...');
    const s3Key = await uploadToS3(testFilePath, projectId, {
      contentType: 'video/mp4',
      metadata: {
        'test-upload': 'true',
        'uploaded-by': 'test-script',
      },
    });

    console.log(`✅ Successfully uploaded to S3!`);
    console.log(`🔑 S3 Key: ${s3Key}`);

    const s3Url = getS3Url(s3Key);
    console.log(`🔗 S3 URL: ${s3Url}`);

    console.log('\n✅ S3 upload test passed!');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ S3 upload test failed:');
    console.error(`   ${error.message}`);
    
    if (error.message?.includes('credentials')) {
      console.error('\n   Please check your AWS credentials:');
      console.error('   - AWS_ACCESS_KEY_ID');
      console.error('   - AWS_SECRET_ACCESS_KEY');
      console.error('   - AWS_REGION');
      console.error('   - AWS_S3_BUCKET');
    }
    
    process.exit(1);
  }
}

testS3Upload().catch(console.error);

