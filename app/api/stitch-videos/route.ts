import { NextRequest, NextResponse } from 'next/server';
import { stitchVideos } from '@/lib/video/stitcher';
import { uploadToS3, getS3Url } from '@/lib/storage/s3-uploader';
import path from 'path';
import fs from 'fs/promises';

/**
 * POST /api/stitch-videos
 * Stitches multiple video clips into a single video and optionally uploads to S3
 * 
 * Request Body:
 * {
 *   videoPaths: string[];   // Required: Array of local video file paths (should be 5 videos)
 *   projectId: string;      // Required: Project ID
 *   uploadToS3?: boolean;   // Optional: Whether to upload to S3 (default: false)
 * }
 * 
 * Response:
 * {
 *   success: boolean;
 *   data?: {
 *     finalVideoPath: string;
 *     s3Url?: string;
 *     s3Key?: string;
 *   };
 *   error?: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoPaths, projectId, uploadToS3: shouldUploadToS3 = false } = body;

    // Validate required fields
    if (!Array.isArray(videoPaths) || videoPaths.length === 0) {
      return NextResponse.json(
        { success: false, error: 'videoPaths is required and must be a non-empty array' },
        { status: 400 }
      );
    }

    // Allow stitching any number of videos (at least 1)
    // Note: PRD mentions 5 scenes, but allow flexibility for partial stitching

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'projectId is required and must be a string' },
        { status: 400 }
      );
    }

    // Convert relative paths to absolute and verify all videos exist
    const projectRoot = process.cwd();
    const absoluteVideoPaths: string[] = [];

    for (const videoPath of videoPaths) {
      if (typeof videoPath !== 'string') {
        return NextResponse.json(
          { success: false, error: 'All video paths must be strings' },
          { status: 400 }
        );
      }

      const absolutePath = path.isAbsolute(videoPath)
        ? videoPath
        : path.join(projectRoot, videoPath);

      // Verify video file exists
      try {
        await fs.access(absolutePath);
      } catch {
        return NextResponse.json(
          { success: false, error: `Video file not found: ${videoPath}` },
          { status: 404 }
        );
      }

      absoluteVideoPaths.push(absolutePath);
    }

    // Stitch videos (stitcher creates its own output path)
    const finalVideoPath = await stitchVideos(absoluteVideoPaths, projectId);

    // Use absolute path for response (client will handle serving it)
    const response: any = {
      success: true,
      data: {
        finalVideoPath: finalVideoPath,
      },
    };

    // Upload to S3 if requested
    if (shouldUploadToS3) {
      try {
        const s3Key = await uploadToS3(finalVideoPath, projectId, {
          contentType: 'video/mp4',
        });
        const s3Url = getS3Url(s3Key);

        response.data.s3Url = s3Url;
        response.data.s3Key = s3Key;
      } catch (s3Error: any) {
        console.error('[API] S3 upload error:', s3Error);
        // Don't fail the request if S3 upload fails, just log it
        // The final video is still available locally
      }
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[API] Video stitching error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Video stitching failed',
      },
      { status: 500 }
    );
  }
}

