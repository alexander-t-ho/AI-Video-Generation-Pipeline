import { NextRequest, NextResponse } from 'next/server';
import { uploadToS3, getS3Url } from '@/lib/storage/s3-uploader';
import { getStorageService } from '@/lib/storage/storage-service';
import { convertWebpIfNeeded } from '@/lib/utils/image-converter';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/upload-blob-s3
 * Uploads a base64-encoded image blob to S3 and returns the S3 URL
 *
 * Request Body:
 * {
 *   imageData: string;    // Required: Base64-encoded image data
 *   projectId: string;    // Required: Project ID
 * }
 *
 * Response:
 * {
 *   success: boolean;
 *   data?: {
 *     s3Url: string;           // Standard S3 URL (for storage reference)
 *     s3Key: string;           // S3 object key
 *     preSignedUrl: string;    // Pre-signed URL for external API access (expires in 2 hours)
 *   };
 *   error?: string;
 * }
 */
export async function POST(request: NextRequest) {
  let tempFilePath: string | null = null;

  try {
    const body = await request.json();
    const { imageData, projectId } = body;

    // Validate required fields
    if (!imageData || typeof imageData !== 'string') {
      return NextResponse.json(
        { success: false, error: 'imageData is required and must be a base64 string' },
        { status: 400 }
      );
    }

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'projectId is required and must be a string' },
        { status: 400 }
      );
    }

    // Create temporary directory for the upload
    const tempDir = path.join('/tmp', 'projects', projectId, 'captures');
    await fs.mkdir(tempDir, { recursive: true });

    // Convert base64 to buffer
    const buffer = Buffer.from(imageData, 'base64');
    
    // Check if this is a webp image and convert if needed
    // Note: Base64 images are typically PNG, but check mime type if available
    const converted = await convertWebpIfNeeded(buffer, 'image/png', 'frame.png');
    
    // Generate unique filename with correct extension
    const filename = `frame-${uuidv4()}.${converted.extension}`;
    tempFilePath = path.join(tempDir, filename);

    // Write converted buffer to temporary file
    await fs.writeFile(tempFilePath, converted.buffer);

    console.log('[API] Temporary frame file created:', tempFilePath);

    // Try to upload to S3, fallback to ngrok/public URL if S3 not configured
    try {
      const s3Key = await uploadToS3(tempFilePath, projectId, {
        contentType: converted.mimeType,
        metadata: {
          'upload-type': 'video-frame-capture',
        },
      });
      const s3Url = getS3Url(s3Key);

      // Generate pre-signed URL for external API access (2 hour expiry)
      const storageService = getStorageService();
      const preSignedUrl = await storageService.getPreSignedUrl(s3Key, 7200); // 2 hours

      console.log('[API] Frame uploaded to S3:', { s3Key, s3Url });

      // Clean up temporary file after successful upload
      try {
        await fs.unlink(tempFilePath);
        tempFilePath = null;
      } catch (cleanupError) {
        console.warn('[API] Failed to clean up temp file:', cleanupError);
      }

      return NextResponse.json({
        success: true,
        data: {
          s3Url,
          s3Key,
          preSignedUrl,
        },
      });
    } catch (s3Error: any) {
      // If S3 upload fails due to missing credentials, use ngrok/public URL
      if (s3Error.message?.includes('AWS credentials') || s3Error.message?.includes('credentials not found')) {
        const ngrokUrl = process.env.NGROK_URL || 'http://localhost:3000';
        const publicUrl = `${ngrokUrl}/api/serve-image?path=${encodeURIComponent(tempFilePath)}`;

        console.warn('[API] S3 not configured, using public URL for frame:', publicUrl);

        return NextResponse.json({
          success: true,
          data: {
            s3Url: publicUrl,
            s3Key: null,
            preSignedUrl: publicUrl,
          },
        });
      }
      // Re-throw other S3 errors
      throw s3Error;
    }
  } catch (error: any) {
    console.error('[API] Blob S3 upload error:', error);

    // Clean up temporary file on error
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
      } catch (cleanupError) {
        console.warn('[API] Failed to clean up temp file on error:', cleanupError);
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Blob upload to S3 failed',
      },
      { status: 500 }
    );
  }
}

