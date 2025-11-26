import { NextRequest, NextResponse } from 'next/server';
import { uploadToS3, getS3Url } from '@/lib/storage/s3-uploader';
import { getStorageService } from '@/lib/storage/storage-service';
import { convertWebpIfNeeded } from '@/lib/utils/image-converter';
import path from 'path';
import fs from 'fs/promises';

/**
 * POST /api/upload-image-s3
 * Uploads a local image file to S3 and returns the S3 URL
 *
 * Request Body:
 * {
 *   imagePath: string;    // Required: Local file path to the image
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
  try {
    const body = await request.json();
    const { imagePath, projectId } = body;

    // Validate required fields
    if (!imagePath || typeof imagePath !== 'string') {
      return NextResponse.json(
        { success: false, error: 'imagePath is required and must be a string' },
        { status: 400 }
      );
    }

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'projectId is required and must be a string' },
        { status: 400 }
      );
    }

    // Convert relative path to absolute if needed
    let absolutePath = imagePath;
    if (!path.isAbsolute(imagePath)) {
      absolutePath = path.join(process.cwd(), imagePath);
    }

    // Check if file exists
    try {
      await fs.access(absolutePath);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Image file not found' },
        { status: 404 }
      );
    }

    // Read file and convert webp if needed
    const fileBuffer = await fs.readFile(absolutePath);
    const filename = path.basename(absolutePath);
    const ext = path.extname(filename).toLowerCase();
    
    // Determine mime type from extension
    let mimeType = 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.webp') mimeType = 'image/webp';
    
    const converted = await convertWebpIfNeeded(fileBuffer, mimeType, filename);
    
    // If webp was converted, write the converted PNG to a temp file
    let uploadPath = absolutePath;
    if (converted.mimeType === 'image/png' && mimeType === 'image/webp') {
      const tempPath = absolutePath.replace(/\.webp$/i, '-converted.png');
      await fs.writeFile(tempPath, converted.buffer);
      uploadPath = tempPath;
    }

    // Try to upload to S3, fallback to ngrok/public URL if S3 not configured
    try {
      const s3Key = await uploadToS3(uploadPath, projectId, {
        contentType: converted.mimeType,
      });
      const s3Url = getS3Url(s3Key);

      // Generate pre-signed URL for external API access (2 hour expiry)
      const storageService = getStorageService();
      const preSignedUrl = await storageService.getPreSignedUrl(s3Key, 7200); // 2 hours
      
      // Clean up temp file if we created one
      if (uploadPath !== absolutePath) {
        try {
          await fs.unlink(uploadPath);
        } catch {}
      }

      return NextResponse.json({
        success: true,
        data: {
          s3Url,
          s3Key,
          preSignedUrl, // Use this for Replicate and other external APIs
        },
      });
    } catch (s3Error: any) {
      // Clean up temp file if we created one
      if (uploadPath !== absolutePath) {
        try {
          await fs.unlink(uploadPath);
        } catch {}
      }
      
      // If S3 upload fails due to missing credentials, use ngrok/public URL
      if (s3Error.message?.includes('AWS credentials') || s3Error.message?.includes('credentials not found')) {
        const ngrokUrl = process.env.NGROK_URL || 'http://localhost:3000';
        const publicUrl = `${ngrokUrl}/api/serve-image?path=${encodeURIComponent(imagePath)}`;

        console.warn('[API] S3 not configured, using public URL instead:', publicUrl);

        return NextResponse.json({
          success: true,
          data: {
            s3Url: publicUrl,
            s3Key: null, // No S3 key when using public URL
            preSignedUrl: publicUrl, // Use same URL when S3 not configured
          },
        });
      }
      // Re-throw other S3 errors
      throw s3Error;
    }
  } catch (error: any) {
    console.error('[API] Image S3 upload error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Image upload to S3 failed',
      },
      { status: 500 }
    );
  }
}

