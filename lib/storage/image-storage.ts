/**
 * Image Storage - Abstraction layer for local and S3 storage
 * 
 * Currently uses local storage. S3 support can be added in the future.
 */

import fs from 'fs/promises';
import path from 'path';
import { uploadToS3, getS3Url } from './s3-uploader';

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
}

export interface StorageOptions {
  useS3?: boolean;           // Future: enable S3 storage
  projectId: string;
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
  
  // Generate unique filename
  const ext = path.extname(originalName) || (mimeType.includes('png') ? '.png' : '.jpg');
  const imageId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const filename = `${imageId}${ext}`;
  
  // Save to local storage
  const localPath = await saveImageLocally(buffer, projectId, filename);
  
  // Upload to S3 if enabled (future)
  let s3Key: string | undefined;
  let url = localPath; // Default to local path
  
  if (useS3) {
    try {
      s3Key = await uploadImageToS3(localPath, projectId, filename);
      url = getS3Url(s3Key);
    } catch (error) {
      console.warn('[ImageStorage] S3 upload failed, using local storage:', error);
      // Continue with local storage if S3 fails
    }
  }
  
  return {
    id: imageId,
    url,
    localPath,
    s3Key,
    originalName,
    size: buffer.length,
    mimeType,
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

