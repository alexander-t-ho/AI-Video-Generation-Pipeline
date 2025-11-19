/**
 * Image Upload API Route
 * 
 * POST /api/upload-images
 * 
 * Uploads user-provided reference images for use in storyboard and image generation.
 * Currently saves to local storage. S3 support can be enabled in the future.
 */

import { NextRequest, NextResponse } from 'next/server';
import { saveUploadedImage, ProcessedImage } from '@/lib/storage/image-storage';
import { removeBackgroundIterative } from '@/lib/ai/background-remover';
import { cleanupImageEdgesIterative } from '@/lib/ai/edge-cleanup';
import { findBackgroundRemovedVersion, getS3Url } from '@/lib/storage/s3-uploader';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_RUNTIME_CONFIG, getRuntimeConfig } from '@/lib/config/model-runtime';

// Force dynamic rendering since we use form data and file uploads
export const dynamic = 'force-dynamic';

// ============================================================================
// Request Validation
// ============================================================================

/**
 * Validates the upload request
 */
function validateRequest(formData: FormData): string | null {
  const projectId = formData.get('projectId');
  if (!projectId || typeof projectId !== 'string' || projectId.trim() === '') {
    return 'Missing required field: projectId';
  }

  const images = formData.getAll('images');
  if (!images || images.length === 0) {
    return 'Missing required field: images (at least one image required)';
  }

  // Validate each file
  for (let i = 0; i < images.length; i++) {
    const file = images[i];
    if (!(file instanceof File)) {
      return `Invalid file at index ${i}: must be a File object`;
    }

    // Check file size (max 10MB per file)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return `File "${file.name}" exceeds maximum size of 10MB`;
    }

    // Check MIME type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return `File "${file.name}" has unsupported type: ${file.type}. Allowed types: ${allowedTypes.join(', ')}`;
    }
  }

  return null;
}

// ============================================================================
// API Route Handler
// ============================================================================

/**
 * POST /api/upload-images
 * 
 * Uploads one or more images for use as reference in storyboard/image generation.
 * 
 * Request (FormData):
 * - projectId: string (required)
 * - images: File[] (required, at least one)
 * 
 * Response:
 * {
 *   success: true;
 *   images: UploadedImage[];
 * }
 * 
 * Error Responses:
 * - 400: Invalid request
 * - 500: Upload failed
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (parseError) {
      console.error('[Upload Images API] Failed to parse form data:', parseError);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid form data',
          code: 'INVALID_REQUEST',
        },
        { status: 400 }
      );
    }

    // Validate request
    const validationError = validateRequest(formData);
    if (validationError) {
      console.error('[Upload Images API] Validation error:', validationError);
      return NextResponse.json(
        {
          success: false,
          error: validationError,
          code: 'INVALID_REQUEST',
        },
        { status: 400 }
      );
    }

    // Extract parameters
    const projectId = formData.get('projectId') as string;
    const imageFiles = formData.getAll('images') as File[];
    
    // Check if background removal is enabled (from form data or default to true)
    const enableBgRemovalParam = formData.get('enableBackgroundRemoval');
    const enableBackgroundRemoval = enableBgRemovalParam === null 
      ? DEFAULT_RUNTIME_CONFIG.enableBackgroundRemoval !== false // Default to true if not specified
      : enableBgRemovalParam === 'true' || enableBgRemovalParam === '1';
    
    // Get edge cleanup iterations from runtime config (default: 1)
    // Note: This is server-side, so we need to get config from a way that works server-side
    // For now, we'll check form data first, then fall back to default
    const edgeCleanupParam = formData.get('edgeCleanupIterations');
    const edgeCleanupIterations = edgeCleanupParam !== null
      ? Math.max(0, Math.min(3, parseInt(edgeCleanupParam as string, 10) || 1)) // Clamp between 0-3
      : (DEFAULT_RUNTIME_CONFIG.edgeCleanupIterations ?? 1);

    console.log('[Upload Images API] Request received:', {
      projectId,
      imageCount: imageFiles.length,
      enableBackgroundRemoval,
      edgeCleanupIterations,
    });

    // Process each image
    const uploadedImages: import('@/lib/storage/image-storage').UploadedImage[] = [];
    const errors: string[] = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      try {
        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Save image (upload to S3 for public access)
        const uploadedImage = await saveUploadedImage(
          buffer,
          file.name,
          file.type,
          {
            projectId,
            useS3: true, // Enable S3 for public URLs needed by Replicate
          }
        );

        if (uploadedImage.isDuplicate) {
          console.log(`[Upload Images API] Duplicate image detected ${i + 1}/${imageFiles.length}: ${uploadedImage.id} - using existing S3 copy`);
        } else {
          console.log(`[Upload Images API] Successfully uploaded image ${i + 1}/${imageFiles.length}: ${uploadedImage.id}`);
        }

        // Process image through background removal (2 iterations) if enabled
        // Skip background removal for duplicates since they already have processed versions
        if (enableBackgroundRemoval && !uploadedImage.isDuplicate) {
          try {
            // Check if a background-removed version already exists in S3
            let cachedS3Key: string | null = null;
            if (uploadedImage.s3Key) {
              console.log(`[Upload Images API] Checking for cached background-removed version for image ${i + 1}...`);
              cachedS3Key = await findBackgroundRemovedVersion(uploadedImage.s3Key);
            }

            if (cachedS3Key) {
              // Use cached version from S3 - instant!
              console.log(`[Upload Images API] Found cached background-removed version for image ${i + 1}, skipping processing`);
              const cachedUrl = getS3Url(cachedS3Key);
              
              // Create a single processed version using the cached image
              const processedImage: ProcessedImage = {
                id: uuidv4(),
                iteration: 1,
                url: cachedUrl,
                localPath: '', // Not stored locally
                s3Key: cachedS3Key,
                size: 0, // Size unknown but not critical
                createdAt: new Date().toISOString(),
              };

              uploadedImage.processedVersions = [processedImage];
              console.log(`[Upload Images API] Using cached background-removed image from S3 (instant)`);
            } else {
              // No cached version - process the image
              console.log(`[Upload Images API] No cached version found, processing image ${i + 1}...`);
              const processedPaths = await removeBackgroundIterative(
                uploadedImage.localPath,
                1 // Fast single pass for initial upload (was 2)
              );

              // Create ProcessedImage objects for each iteration
              const processedVersions: ProcessedImage[] = [];
              for (let iter = 0; iter < processedPaths.length; iter++) {
                const processedPath = processedPaths[iter];

                // Get file stats
                const stats = await fs.stat(processedPath);

                // Upload processed image to S3 using existing upload-image-s3 API
                let processedUrl = processedPath; // Default to local path
                let processedS3Key: string | undefined;

                try {
                  // Use existing upload-image-s3 API which handles S3 upload with fallback
                  const s3Response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/upload-image-s3`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      imagePath: processedPath,
                      projectId: projectId,
                    }),
                  });

                  const s3Data = await s3Response.json();
                  if (s3Data.success && s3Data.data?.s3Url) {
                    processedUrl = s3Data.data.s3Url;
                    processedS3Key = s3Data.data.s3Key;
                    console.log(`[Upload Images API] Uploaded processed image ${iter + 1} to S3`);
                  } else {
                    console.warn(`[Upload Images API] S3 upload failed for processed image ${iter + 1}, using local path`);
                  }
                } catch (s3Error: any) {
                  console.warn(`[Upload Images API] S3 upload error for processed image ${iter + 1}:`, s3Error.message);
                  // Continue with local path if S3 fails
                }

                const processedImage: ProcessedImage = {
                  id: uuidv4(),
                  iteration: iter + 1,
                  url: processedUrl, // S3 URL or local path
                  localPath: processedPath,
                  s3Key: processedS3Key,
                  size: stats.size,
                  createdAt: new Date().toISOString(),
                };

                processedVersions.push(processedImage);
                console.log(`[Upload Images API] Created processed version ${iter + 1}/${processedPaths.length} for image ${i + 1} (background removal)`);
              }

              // Enable edge cleanup for brand identity assets
              const skipEdgeCleanup = false;
              if (!skipEdgeCleanup && edgeCleanupIterations > 0 && processedPaths.length > 0) {
                try {
                  const lastBgRemovedPath = processedPaths[processedPaths.length - 1];
                  console.log(`[Upload Images API] Applying ${edgeCleanupIterations} edge cleanup iteration(s) to processed image...`);
                  const cleanedPaths = await cleanupImageEdgesIterative(lastBgRemovedPath, edgeCleanupIterations);
                  
                  // Add all edge cleanup iterations as separate processed versions
                  // The last one will be the most refined
                  for (let cleanupIter = 0; cleanupIter < cleanedPaths.length; cleanupIter++) {
                    const cleanedPath = cleanedPaths[cleanupIter];
                    const stats = await fs.stat(cleanedPath);
                    
                    // Upload cleaned image to S3
                    let cleanedUrl = cleanedPath;
                    let cleanedS3Key: string | undefined;
                  
                    try {
                      const s3Response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/upload-image-s3`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          imagePath: cleanedPath,
                          projectId: projectId,
                        }),
                      });
                      
                      const s3Data = await s3Response.json();
                      if (s3Data.success && s3Data.data?.s3Url) {
                        cleanedUrl = s3Data.data.s3Url;
                        cleanedS3Key = s3Data.data.s3Key;
                      }
                    } catch (s3Error: any) {
                      console.warn(`[Upload Images API] S3 upload failed for edge-cleaned image ${cleanupIter + 1}, using local path`);
                    }
                    
                    const edgeCleanedImage: ProcessedImage = {
                      id: uuidv4(),
                      iteration: processedVersions.length + cleanupIter + 1, // Continue numbering from background removal iterations
                      url: cleanedUrl,
                      localPath: cleanedPath,
                      s3Key: cleanedS3Key,
                      size: stats.size,
                      createdAt: new Date().toISOString(),
                    };
                    
                    processedVersions.push(edgeCleanedImage);
                    console.log(`[Upload Images API] Created edge-cleaned version ${cleanupIter + 1}/${edgeCleanupIterations} for image ${i + 1}`);
                  }
                  
                  console.log(`[Upload Images API] Edge cleanup completed for image ${i + 1} (${edgeCleanupIterations} iteration(s))`);
                } catch (edgeError: any) {
                  const edgeErrorMessage = edgeError.message || 'Unknown error';
                  console.warn(`[Upload Images API] Edge cleanup failed for image ${i + 1}, using un-cleaned version: ${edgeErrorMessage}`);
                  // Continue with un-cleaned version if edge cleanup fails
                  errors.push(`Image "${file.name}" edge cleanup: ${edgeErrorMessage}`);
                }
              } else {
                console.log(`[Upload Images API] Skipping edge cleanup for faster initial upload`);
              }

              // Attach processed versions to uploaded image
              uploadedImage.processedVersions = processedVersions;
              console.log(`[Upload Images API] Background removal completed for image ${i + 1} (${processedVersions.length} versions${skipEdgeCleanup ? '' : ', last with edge cleanup'})`);
            } // End of else block (no cached version found)
          } catch (bgError: any) {
            const bgErrorMessage = bgError.message || 'Unknown error';
            console.error(`[Upload Images API] Background removal failed for image ${i + 1}:`, bgErrorMessage);
            // Don't fail the upload if background removal fails - just log it
            // The original image will still be available
            errors.push(`Image "${file.name}" background removal: ${bgErrorMessage}`);
          }
        } else {
          console.log(`[Upload Images API] Background removal disabled, skipping for image ${i + 1}`);
        }

        uploadedImages.push(uploadedImage);
      } catch (error: any) {
        const errorMessage = error.message || 'Unknown error';
        console.error(`[Upload Images API] Failed to upload image ${i + 1} (${file.name}):`, errorMessage);
        errors.push(`Image "${file.name}": ${errorMessage}`);
      }
    }

    // If all images failed, return error
    if (uploadedImages.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to upload all images: ${errors.join('; ')}`,
          code: 'UPLOAD_FAILED',
        },
        { status: 500 }
      );
    }

    // If some images failed, return partial success
    if (errors.length > 0) {
      console.warn(`[Upload Images API] Partial success: ${uploadedImages.length}/${imageFiles.length} images uploaded`);
    }

    const duration = Date.now() - startTime;
    console.log(`[Upload Images API] Successfully uploaded ${uploadedImages.length} image(s) in ${duration}ms`);

    // Return success response
    return NextResponse.json(
      {
        success: true,
        images: uploadedImages,
        errors: errors.length > 0 ? errors : undefined,
      },
      { status: 200 }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Upload Images API] Error after ${duration}ms:`, error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        success: false,
        error: `Upload failed: ${errorMessage}`,
        code: 'UPLOAD_FAILED',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Health Check
// ============================================================================

/**
 * GET /api/upload-images
 * 
 * Health check endpoint.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'image-upload',
      storage: 's3',
    },
    { status: 200 }
  );
}


