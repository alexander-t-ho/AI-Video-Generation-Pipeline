/**
 * Test AWS S3 Setup
 * 
 * Verifies that AWS S3 client is configured correctly and can connect to S3.
 * This script tests S3 connectivity and permissions.
 */

import { S3Client, ListBucketsCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs/promises';
import path from 'path';

// ============================================================================
// S3 Client Setup
// ============================================================================

function createS3Client(): S3Client {
  const region = process.env.AWS_REGION || 'us-east-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS credentials not found. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.');
  }

  return new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

// ============================================================================
// Test Functions
// ============================================================================

async function testS3Connection(client: S3Client): Promise<boolean> {
  try {
    const command = new ListBucketsCommand({});
    const response = await client.send(command);
    console.log('✅ S3 connection successful');
    console.log(`   Found ${response.Buckets?.length || 0} buckets`);
    return true;
  } catch (error: any) {
    console.error('❌ S3 connection failed:', error.message);
    return false;
  }
}

async function testS3Bucket(client: S3Client, bucketName: string): Promise<boolean> {
  try {
    // Try to list objects in the bucket (this tests bucket access)
    const testKey = 'test-connection.txt';
    const testContent = `Test file created at ${new Date().toISOString()}`;

    // Test PUT
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: testKey,
      Body: testContent,
      ContentType: 'text/plain',
    });
    await client.send(putCommand);
    console.log('✅ S3 bucket write access works');

    // Test GET
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: testKey,
    });
    const getResponse = await client.send(getCommand);
    const body = await getResponse.Body?.transformToString();
    if (body === testContent) {
      console.log('✅ S3 bucket read access works');
    }

    // Clean up test file
    const deleteCommand = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: testKey,
    });
    await client.send(deleteCommand);
    console.log('✅ S3 bucket delete access works');

    return true;
  } catch (error: any) {
    if (error.name === 'NoSuchBucket') {
      console.error(`❌ Bucket "${bucketName}" does not exist`);
      console.log(`   Please create the bucket: aws s3 mb s3://${bucketName}`);
    } else if (error.name === 'AccessDenied') {
      console.error(`❌ Access denied to bucket "${bucketName}"`);
      console.log('   Please check IAM permissions');
    } else {
      console.error('❌ S3 bucket test failed:', error.message);
    }
    return false;
  }
}

async function main() {
  console.log('🧪 Testing AWS S3 Setup...\n');

  // Check environment variables
  const region = process.env.AWS_REGION || 'us-east-1';
  const bucketName = process.env.AWS_S3_BUCKET || 'ai-video-pipeline-outputs';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  console.log('Environment Variables:');
  console.log(`  AWS_REGION: ${region}`);
  console.log(`  AWS_S3_BUCKET: ${bucketName}`);
  console.log(`  AWS_ACCESS_KEY_ID: ${accessKeyId ? '✅ Set' : '❌ Not set'}`);
  console.log(`  AWS_SECRET_ACCESS_KEY: ${secretAccessKey ? '✅ Set' : '❌ Not set'}\n`);

  if (!accessKeyId || !secretAccessKey) {
    console.error('❌ AWS credentials not configured');
    console.log('\nPlease set the following environment variables:');
    console.log('  AWS_ACCESS_KEY_ID');
    console.log('  AWS_SECRET_ACCESS_KEY');
    console.log('  AWS_REGION (optional, defaults to us-east-1)');
    console.log('  AWS_S3_BUCKET (optional, defaults to ai-video-pipeline-outputs)');
    process.exit(1);
  }

  try {
    const client = createS3Client();

    const connectionOk = await testS3Connection(client);
    const bucketOk = await testS3Bucket(client, bucketName);

    console.log('\n📊 Test Results:');
    console.log(`  S3 Connection: ${connectionOk ? '✅' : '❌'}`);
    console.log(`  Bucket Access: ${bucketOk ? '✅' : '❌'}`);

    if (connectionOk && bucketOk) {
      console.log('\n✅ AWS S3 is ready for video storage!');
      process.exit(0);
    } else {
      console.log('\n❌ AWS S3 setup incomplete. Please check configuration.');
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);

