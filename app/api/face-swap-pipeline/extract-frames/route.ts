import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { extractFrames } from '@/lib/services/face-swap-pipeline/frame-extractor';
import { uploadToS3, getS3Url } from '@/lib/storage/s3-uploader';
import path from 'path';

export const dynamic = 'force-dynamic';

/**
 * POST /api/face-swap-pipeline/extract-frames
 * Extract frames from uploaded video
 * 
 * Request Body (FormData):
 * - video: File (required)
 * - frameRate?: number - Extract every Nth frame
 * - timeInterval?: number - Extract frame every N seconds
 * - maxFrames?: number - Maximum frames to extract
 * 
 * Response:
 * {
 *   success: boolean;
 *   frames?: FrameMetadata[];
 *   error?: string;
 * }
 */
export async function POST(request: NextRequest) {
  const timestamp = new Date().toISOString();

  try {
    const formData = await request.formData();
    const videoFile = formData.get('video') as File;

    if (!videoFile) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required field: video file',
        },
        { status: 400 }
      );
    }

    // Parse options
    const frameRate = formData.get('frameRate') 
      ? parseInt(formData.get('frameRate') as string, 10) 
      : undefined;
    const timeInterval = formData.get('timeInterval')
      ? parseFloat(formData.get('timeInterval') as string)
      : undefined;
    const maxFrames = formData.get('maxFrames')
      ? parseInt(formData.get('maxFrames') as string, 10)
      : undefined;

    console.log('[ExtractFrames API] ========================================');
    console.log('[ExtractFrames API] Request received');
    console.log('[ExtractFrames API] Video:', videoFile.name, '-', videoFile.size, 'bytes');
    console.log('[ExtractFrames API] Options:', { frameRate, timeInterval, maxFrames });

    // Save video to temp directory
    const projectId = `face-swap-${Date.now()}`;
    const uploadsDir = join(process.cwd(), 'tmp', 'face-swap-pipeline', projectId, 'input');
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    const videoBytes = await videoFile.arrayBuffer();
    const videoBuffer = Buffer.from(videoBytes);
    const videoPath = join(uploadsDir, videoFile.name);
    await writeFile(videoPath, videoBuffer);

    console.log('[ExtractFrames API] Video saved to:', videoPath);

    // Extract frames
    const frames = await extractFrames(videoPath, projectId, {
      frameRate,
      timeInterval,
      maxFrames,
    });

    // Upload frames to S3 (optional, for easier access)
    const framesWithUrls = await Promise.all(
      frames.map(async (frame) => {
        try {
          const s3Key = await uploadToS3(frame.path, `face-swap-pipeline/${projectId}/frames/${path.basename(frame.path)}`);
          const url = getS3Url(s3Key);
          return { ...frame, url };
        } catch (error) {
          console.warn(`[ExtractFrames API] Failed to upload frame ${frame.frameNumber} to S3:`, error);
          return frame;
        }
      })
    );

    console.log('[ExtractFrames API] ✓ Extracted', frames.length, 'frames');
    console.log('[ExtractFrames API] ========================================');

    return NextResponse.json({
      success: true,
      frames: framesWithUrls,
      projectId,
    });
  } catch (error: any) {
    console.error('[ExtractFrames API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to extract frames',
      },
      { status: 500 }
    );
  }
}

