/**
 * S3 Uploader - AWS S3 Integration
 * 
 * This module handles uploading files to AWS S3 with retry logic and error handling.
 * Supports uploading final video files to S3 for sharing and storage.
 */

import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs/promises';
import path from 'path';

// ============================================================================
// Constants
// ============================================================================

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 4000; // 4 seconds

// ============================================================================
// Types
// ============================================================================

interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

// ============================================================================
// S3 Client Setup
// ============================================================================

/**
 * Creates and configures an S3 client
 */
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

/**
 * Get S3 bucket name from environment
 */
function getBucketName(): string {
  const bucket = process.env.AWS_S3_BUCKET || 'ai-video-pipeline-outputs';
  return bucket;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function calculateRetryDelay(attempt: number): number {
  const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
  return Math.min(delay, MAX_RETRY_DELAY);
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: any): boolean {
  // Retry on network errors, timeouts, and 5xx server errors
  if (error.name === 'NetworkError' || error.name === 'TimeoutError') {
    return true;
  }

  // Retry on 5xx server errors
  if (error.$metadata?.httpStatusCode) {
    const statusCode = error.$metadata.httpStatusCode;
    if (statusCode >= 500 && statusCode < 600) {
      return true;
    }
  }

  // Don't retry on 4xx client errors (except 429 rate limit)
  if (error.$metadata?.httpStatusCode === 429) {
    return true; // Rate limit is retryable
  }

  return false;
}

/**
 * Upload file to S3 with retry logic
 */
async function uploadToS3WithRetry(
  client: S3Client,
  bucket: string,
  key: string,
  filePath: string,
  options: UploadOptions = {}
): Promise<void> {
  let lastError: Error | null = null;

  // Read file content
  let fileContent: Buffer;
  try {
    fileContent = await fs.readFile(filePath);
  } catch (error: any) {
    throw new Error(`Failed to read file ${filePath}: ${error.message}`);
  }

  // Get file stats for metadata
  const stats = await fs.stat(filePath);
  const fileSize = stats.size;

  // Determine content type
  const contentType = options.contentType || getContentType(filePath);

  // Upload with retry logic
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
        Metadata: {
          ...options.metadata,
          'file-size': fileSize.toString(),
          'uploaded-at': new Date().toISOString(),
        },
      });

      await client.send(command);
      return; // Success
    } catch (error: any) {
      lastError = error;

      // Don't retry on non-retryable errors
      if (!isRetryableError(error)) {
        throw error;
      }

      // If this is the last attempt, throw the error
      if (attempt === MAX_RETRIES) {
        break;
      }

      // Wait before retry with exponential backoff
      const delay = calculateRetryDelay(attempt);
      console.warn(`[S3Uploader] Upload attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  // All retries exhausted
  throw lastError || new Error('Upload failed after retries');
}

/**
 * Get content type from file extension
 */
function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.json': 'application/json',
    '.txt': 'text/plain',
  };
  return contentTypes[ext] || 'application/octet-stream';
}

/**
 * Verify file exists in S3
 */
async function verifyUpload(
  client: S3Client,
  bucket: string,
  key: string
): Promise<boolean> {
  try {
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    await client.send(command);
    return true;
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Upload a file to S3
 * 
 * @param filePath - Local path to the file to upload
 * @param projectId - Project ID for organizing S3 keys
 * @param options - Optional upload options (contentType, metadata)
 * @returns S3 key of the uploaded file
 * 
 * @throws Error if file doesn't exist, upload fails, or S3 is not configured
 */
export async function uploadToS3(
  filePath: string,
  projectId: string,
  options: UploadOptions = {}
): Promise<string> {
  // Validate input
  if (!filePath) {
    throw new Error('File path is required');
  }

  if (!projectId) {
    throw new Error('Project ID is required');
  }

  // Check if file exists
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`File not found: ${filePath}`);
  }

  // Get file name
  const fileName = path.basename(filePath);
  
  // Create S3 key: outputs/{projectId}/final.mp4 or outputs/{projectId}/{fileName}
  const s3Key = `outputs/${projectId}/${fileName}`;

  // Create S3 client
  const client = createS3Client();
  const bucket = getBucketName();

  // Upload file with retry logic
  try {
    await uploadToS3WithRetry(client, bucket, s3Key, filePath, options);

    // Verify upload
    const verified = await verifyUpload(client, bucket, s3Key);
    if (!verified) {
      throw new Error('Upload verification failed: file not found in S3');
    }

    return s3Key;
  } catch (error: any) {
    if (error.name === 'NoSuchBucket') {
      throw new Error(`S3 bucket "${bucket}" does not exist. Please create it first.`);
    } else if (error.name === 'AccessDenied') {
      throw new Error(`Access denied to S3 bucket "${bucket}". Please check IAM permissions.`);
    }
    throw error;
  }
}

/**
 * Upload a buffer directly to S3
 *
 * @param buffer - Buffer containing file data
 * @param s3Key - Full S3 key for the file
 * @param contentType - MIME type of the file
 * @param metadata - Optional metadata
 * @returns S3 key of the uploaded file
 */
export async function uploadBufferToS3(
  buffer: Buffer,
  s3Key: string,
  contentType: string,
  metadata?: Record<string, string>
): Promise<string> {
  if (!buffer || buffer.length === 0) {
    throw new Error('Buffer is required and cannot be empty');
  }

  if (!s3Key) {
    throw new Error('S3 key is required');
  }

  const client = createS3Client();
  const bucket = getBucketName();

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: buffer,
        ContentType: contentType,
        Metadata: {
          ...metadata,
          'file-size': buffer.length.toString(),
          'uploaded-at': new Date().toISOString(),
        },
      });

      await client.send(command);

      // Verify upload
      const verified = await verifyUpload(client, bucket, s3Key);
      if (!verified) {
        throw new Error('Upload verification failed: file not found in S3');
      }

      return s3Key;
    } catch (error: any) {
      lastError = error;

      if (!isRetryableError(error)) {
        throw error;
      }

      if (attempt === MAX_RETRIES) {
        break;
      }

      const delay = calculateRetryDelay(attempt);
      console.warn(`[S3Uploader] Buffer upload attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  throw lastError || new Error('Buffer upload failed after retries');
}

/**
 * Get S3 URL for an uploaded file
 *
 * @param s3Key - S3 key of the file
 * @returns Full S3 URL
 */
export function getS3Url(s3Key: string): string {
  const region = process.env.AWS_REGION || 'us-east-1';
  const bucket = getBucketName();
  return `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;
}

// ============================================================================
// Background-Removed Image Caching
// ============================================================================

/**
 * Check if a background-removed version of an image exists in S3
 * @param originalS3Key - The S3 key of the original image
 * @returns The S3 key of the background-removed version if it exists, null otherwise
 */
export async function findBackgroundRemovedVersion(
  originalS3Key: string
): Promise<string | null> {
  const bucket = process.env.AWS_S3_BUCKET;
  
  if (!bucket) {
    console.warn('[S3] AWS_S3_BUCKET not configured');
    return null;
  }

  try {
    const region = process.env.AWS_REGION || 'us-east-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      console.warn('[S3] AWS credentials not configured');
      return null;
    }

    const s3Client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });

    // Generate the expected key for background-removed version
    // Pattern: uploads/{projectId}/{hash}-nobg.png
    const backgroundRemovedKey = originalS3Key.replace(
      /(\.[^.]+)$/, 
      '-nobg.png' // Always use PNG for background-removed images (transparency)
    );

    // Check if the object exists
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: backgroundRemovedKey,
    });

    const response = await s3Client.send(command);
    
    // If no error thrown, the object exists
    console.log(`[S3] Found existing background-removed image: ${backgroundRemovedKey}`);
    return backgroundRemovedKey;
    
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      // Object doesn't exist, which is fine
      return null;
    }
    // Log other errors but don't throw
    console.warn('[S3] Error checking for background-removed version:', error);
    return null;
  }
}

/**
 * Upload a processed (background-removed) image to S3
 * @param processedImageUrl - URL of the processed image (from Replicate)
 * @param originalS3Key - S3 key of the original image
 * @returns S3 key of the uploaded processed image
 */
export async function uploadProcessedImageToS3(
  processedImageUrl: string,
  originalS3Key: string
): Promise<string> {
  const logPrefix = '[S3]';
  const bucket = process.env.AWS_S3_BUCKET;
  
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET not configured');
  }

  try {
    // Download the processed image
    console.log(`${logPrefix} Downloading processed image from Replicate...`);
    const response = await fetch(processedImageUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to download processed image: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate the S3 key for the processed version
    const processedKey = originalS3Key.replace(/(\.[^.]+)$/, '-nobg.png');

    // Create S3 client
    const region = process.env.AWS_REGION || 'us-east-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials not configured');
    }

    const s3Client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });

    // Upload to S3
    console.log(`${logPrefix} Uploading processed image to S3: ${processedKey}`);
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: processedKey,
      Body: buffer,
      ContentType: 'image/png', // Background-removed images are typically PNG
      Metadata: {
        'processing-type': 'background-removed',
        'original-key': originalS3Key,
        'uploaded-at': new Date().toISOString(),
      },
    });

    await s3Client.send(command);
    console.log(`${logPrefix} Successfully uploaded processed image to S3`);

    return processedKey;
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`${logPrefix} Failed to upload processed image:`, errorMessage);
    throw new Error(`Failed to upload processed image to S3: ${errorMessage}`);
  }
}

/**
 * Generate a presigned URL for an S3 object
 * @param s3Key - The S3 key of the file
 * @param expiresIn - Expiration time in seconds (default: 1 hour)
 * @returns Presigned URL that provides temporary access to the file
 */
export async function getPresignedUrl(s3Key: string, expiresIn: number = 3600): Promise<string> {
  if (!s3Key) {
    throw new Error('S3 key is required');
  }

  try {
    const client = createS3Client();
    const bucket = getBucketName();

    // Use GetObjectCommand for downloading (not HeadObjectCommand)
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    });

    // Generate presigned URL
    const presignedUrl = await getSignedUrl(client, command, { expiresIn });
    return presignedUrl;
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[S3] Failed to generate presigned URL for ${s3Key}:`, errorMessage);
    throw new Error(`Failed to generate presigned URL: ${errorMessage}`);
  }
}

/**
 * Delete a file from S3
 * @param s3Key - The S3 key of the file to delete
 * @returns Promise that resolves when deletion is complete
 */
export async function deleteFromS3(s3Key: string): Promise<void> {
  if (!s3Key) {
    throw new Error('S3 key is required');
  }

  const client = createS3Client();
  const bucket = getBucketName();

  try {
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    });

    await client.send(command);
    console.log(`[S3] Successfully deleted file: ${s3Key}`);
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[S3] Failed to delete file ${s3Key}:`, errorMessage);
    throw new Error(`Failed to delete file from S3: ${errorMessage}`);
  }
}

// ============================================================================
// Export
// ============================================================================

export default {
  uploadToS3,
  getS3Url,
  getPresignedUrl,
  findBackgroundRemovedVersion,
  uploadProcessedImageToS3,
  deleteFromS3,
};

