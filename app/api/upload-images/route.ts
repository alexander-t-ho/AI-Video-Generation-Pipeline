/**
 * Image Upload API Route
 * 
 * POST /api/upload-images
 * 
 * Uploads user-provided reference images for use in storyboard and image generation.
 * Currently saves to local storage. S3 support can be enabled in the future.
 */

import { NextRequest, NextResponse } from 'next/server';
import { saveUploadedImage } from '@/lib/storage/image-storage';

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

    console.log('[Upload Images API] Request received:', {
      projectId,
      imageCount: imageFiles.length,
    });

    // Process each image
    const uploadedImages = [];
    const errors: string[] = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      try {
        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Save image
        const uploadedImage = await saveUploadedImage(
          buffer,
          file.name,
          file.type,
          {
            projectId,
            useS3: false, // TODO: Enable S3 when ready
          }
        );

        uploadedImages.push(uploadedImage);
        console.log(`[Upload Images API] Successfully uploaded image ${i + 1}/${imageFiles.length}: ${uploadedImage.id}`);
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
      storage: 'local', // TODO: Return 's3' when S3 is enabled
    },
    { status: 200 }
  );
}

