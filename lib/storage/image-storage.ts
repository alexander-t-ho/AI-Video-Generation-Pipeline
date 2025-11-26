/**
 * Image Storage - Abstraction layer for local and S3 storage
 * 
 * Currently uses local storage. S3 support can be added in the future.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { uploadToS3, getS3Url } from './s3-uploader';
import { convertWebpIfNeeded } from '@/lib/utils/image-converter';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

// ============================================================================
// Types
// ============================================================================

export interface UploadedImage {
  id: string;
  url: string;              // Local file path or S3 URL
  localPath: string;        // Always local path for now
  s3Key?: string;           // S3 key if uploaded to S3
  originalName: string;
  size: number;
  mimeType: string;
  createdAt: string;
  isDuplicate?: boolean;    // Whether this is a duplicate of an existing image
  processedVersions?: ProcessedImage[]; // Background-removed versions
}

export interface ProcessedImage {
  id: string;               // Unique ID for this processed version
  iteration: number;        // Iteration number (1, 2, etc.)
  url: string;              // Local file path or S3 URL
  localPath: string;        // Local file path
  s3Key?: string;           // S3 key if uploaded to S3
  size: number;
  createdAt: string;
}

export interface StorageOptions {
  useS3?: boolean;           // Future: enable S3 storage
  projectId: string;
}

// ============================================================================
// Duplicate Detection Functions
// ============================================================================

/**
 * Calculate MD5 hash of image buffer for duplicate detection
 */
function calculateImageHash(buffer: Buffer): string {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/**
 * Check if an image with the given hash already exists in S3
 */
async function findExistingImageInS3(imageHash: string, projectId: string): Promise<UploadedImage | null> {
  const bucket = process.env.AWS_S3_BUCKET;

  if (!bucket) {
    console.warn('[ImageStorage] AWS_S3_BUCKET not configured, skipping duplicate check');
    return null;
  }

  try {
    // Create S3 client directly
    const region = process.env.AWS_REGION || 'us-east-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      console.warn('[ImageStorage] AWS credentials not configured for duplicate check');
      return null;
    }

    const s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    // List objects with the hash as prefix
    const prefix = `uploads/${projectId}/${imageHash}`;
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: 1, // We only need to know if at least one exists
    });

    const response = await s3Client.send(command);

    if (response.Contents && response.Contents.length > 0) {
      const s3Object = response.Contents[0];
      const s3Key = s3Object.Key!;

      // Extract filename from S3 key
      const filename = path.basename(s3Key);
      const url = getS3Url(s3Key);

      // Return existing image info
      return {
        id: imageHash,
        url,
        localPath: '', // Not stored locally
        s3Key,
        originalName: filename,
        size: s3Object.Size || 0,
        mimeType: 'image/jpeg', // Default, could be enhanced
        createdAt: s3Object.LastModified?.toISOString() || new Date().toISOString(),
        isDuplicate: true,
      };
    }

    return null;
  } catch (error) {
    console.warn('[ImageStorage] Failed to check for existing image in S3:', error);
    return null;
  }
}

// ============================================================================
// Local Storage Functions
// ============================================================================

/**
 * Save image to local storage
 */
async function saveImageLocally(
  buffer: Buffer,
  projectId: string,
  filename: string
): Promise<string> {
  const projectDir = path.join('/tmp', 'projects', projectId);
  const uploadsDir = path.join(projectDir, 'uploads');
  
  // Create directories if they don't exist
  await fs.mkdir(uploadsDir, { recursive: true });
  
  const filePath = path.join(uploadsDir, filename);
  await fs.writeFile(filePath, buffer);
  
  return filePath;
}

/**
 * Upload image to S3 (future support)
 */
async function uploadImageToS3(
  localPath: string,
  projectId: string,
  filename: string
): Promise<string> {
  // Create S3 key: uploads/{projectId}/{filename}
  const s3Key = `uploads/${projectId}/${filename}`;
  
  // Upload to S3
  await uploadToS3(localPath, projectId, {
    contentType: 'image/jpeg', // Will be determined from file
    metadata: {
      'upload-type': 'user-reference',
    },
  });
  
  return s3Key;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Save uploaded image (local storage for now, S3 optional)
 * 
 * @param buffer - Image file buffer
 * @param originalName - Original filename
 * @param mimeType - MIME type of the image
 * @param options - Storage options
 * @returns UploadedImage object
 */
export async function saveUploadedImage(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  options: StorageOptions
): Promise<UploadedImage> {
  const { projectId, useS3 = false } = options;

  // Validate image
  if (!buffer || buffer.length === 0) {
    throw new Error('Image buffer is empty');
  }

  // Validate MIME type
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(mimeType)) {
    throw new Error(`Unsupported image type: ${mimeType}. Allowed types: ${allowedTypes.join(', ')}`);
  }

  // Convert webp to PNG if needed
  const converted = await convertWebpIfNeeded(buffer, mimeType, originalName);
  
  // Use converted values for the rest of the process
  const finalBuffer = converted.buffer;
  const finalMimeType = converted.mimeType;
  const finalFilename = converted.filename;

  // Calculate image hash for duplicate detection (using converted buffer)
  const imageHash = calculateImageHash(finalBuffer);

  // Check for existing image in S3 if S3 is enabled
  if (useS3) {
    console.log(`[ImageStorage] Checking for duplicate image with hash: ${imageHash.substring(0, 8)}...`);
    const existingImage = await findExistingImageInS3(imageHash, projectId);

    if (existingImage) {
      console.log(`[ImageStorage] Found existing image in S3, returning duplicate info`);
      return {
        ...existingImage,
        originalName: finalFilename, // Keep the new filename for reference
      };
    }
  }
  
  // Generate filename using hash for consistent duplicate detection
  const ext = path.extname(finalFilename) || (finalMimeType.includes('png') ? '.png' : '.jpg');
  const filename = `${imageHash}${ext}`;
  
  // Save to local storage
  const localPath = await saveImageLocally(finalBuffer, projectId, filename);
  
  // Upload to S3 if enabled (future)
  let s3Key: string | undefined;
  let url = localPath; // Default to local path
  
  if (useS3) {
    try {
      s3Key = await uploadImageToS3(localPath, projectId, filename);
      url = getS3Url(s3Key);
      console.log('[ImageStorage] Successfully uploaded to S3:', { s3Key, url });
    } catch (error) {
      console.warn('[ImageStorage] S3 upload failed, using local storage:', error);
      // Continue with local storage if S3 fails
    }
  }
  
  return {
    id: imageHash,
    url,
    localPath,
    s3Key,
    originalName: finalFilename,
    size: finalBuffer.length,
    mimeType: finalMimeType,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Get image URL (local path or S3 URL)
 */
export function getImageUrl(image: UploadedImage): string {
  // If S3 key exists, return S3 URL, otherwise return local path
  if (image.s3Key) {
    return getS3Url(image.s3Key);
  }
  return image.localPath;
}

/**
 * Delete uploaded image
 */
export async function deleteUploadedImage(image: UploadedImage): Promise<void> {
  // Delete local file
  try {
    await fs.unlink(image.localPath);
  } catch (error) {
    console.warn(`[ImageStorage] Failed to delete local file ${image.localPath}:`, error);
  }
  
  // Future: Delete from S3 if s3Key exists
  // if (image.s3Key) {
  //   await deleteFromS3(image.s3Key);
  // }
}


