import { NextRequest, NextResponse } from 'next/server';
import { assembleVideo, extractAudio } from '@/lib/services/face-swap-pipeline/video-assembler';
import { uploadToS3, getS3Url } from '@/lib/storage/s3-uploader';
import { join } from 'path';
import { existsSync } from 'fs';
import { getVideoMetadata } from '@/lib/services/face-swap-pipeline/frame-extractor';

export const dynamic = 'force-dynamic';

/**
 * POST /api/face-swap-pipeline/reconstruct-video
 * Reassemble processed frames into video
 * 
 * Request Body (JSON):
 * {
 *   frameUrls: string[] - Array of processed frame URLs (in order)
 *   originalVideoPath?: string - Path to original video (for audio/metadata)
 *   projectId: string - Project ID
 *   fps?: number - Frame rate (default: 30)
 *   width?: number - Video width
 *   height?: number - Video height
 * }
 * 
 * Response:
 * {
 *   success: boolean;
 *   videoUrl?: string;
 *   error?: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { frameUrls, originalVideoPath, projectId, fps, width, height } = body;

    if (!frameUrls || !Array.isArray(frameUrls) || frameUrls.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing or invalid field: frameUrls (must be non-empty array)',
        },
        { status: 400 }
      );
    }

    if (!projectId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required field: projectId',
        },
        { status: 400 }
      );
    }

    console.log('[ReconstructVideo API] ========================================');
    console.log('[ReconstructVideo API] Reconstructing video from', frameUrls.length, 'frames');
    console.log('[ReconstructVideo API] Project ID:', projectId);

    // Download frames to local paths (if they're URLs)
    const framePaths: string[] = [];
    const framesDir = join(process.cwd(), 'tmp', 'face-swap-pipeline', projectId, 'processed-frames');
    if (!existsSync(framesDir)) {
      await import('fs/promises').then(fs => fs.mkdir(framesDir, { recursive: true }));
    }

    // For now, assume frameUrls are local paths or S3 URLs that need to be downloaded
    // In a full implementation, we'd download from S3 if needed
    for (let i = 0; i < frameUrls.length; i++) {
      const frameUrl = frameUrls[i];
      let framePath: string;

      if (frameUrl.startsWith('http://') || frameUrl.startsWith('https://')) {
        // Download from URL
        const response = await fetch(frameUrl);
        const buffer = await response.arrayBuffer();
        framePath = join(framesDir, `frame_${(i + 1).toString().padStart(6, '0')}.png`);
        await import('fs/promises').then(fs => fs.writeFile(framePath, Buffer.from(buffer)));
      } else {
        // Assume it's already a local path
        framePath = frameUrl;
      }

      framePaths.push(framePath);
    }

    console.log('[ReconstructVideo API] Downloaded/prepared', framePaths.length, 'frames');

    // Get video metadata
    let videoMetadata: {
      duration: number;
      fps: number;
      width: number;
      height: number;
      audioPath?: string;
    };

    if (originalVideoPath && existsSync(originalVideoPath)) {
      const metadata = await getVideoMetadata(originalVideoPath);
      videoMetadata = {
        duration: metadata.duration,
        fps: fps || metadata.fps || 30,
        width: width || metadata.width || 1920,
        height: height || metadata.height || 1080,
      };

      // Extract audio
      const audioPath = join(process.cwd(), 'tmp', 'face-swap-pipeline', projectId, 'audio.aac');
      try {
        await extractAudio(originalVideoPath, audioPath);
        videoMetadata.audioPath = audioPath;
      } catch (error: any) {
        console.warn('[ReconstructVideo API] Failed to extract audio:', error.message);
      }
    } else {
      // Use defaults
      videoMetadata = {
        duration: framePaths.length / (fps || 30),
        fps: fps || 30,
        width: width || 1920,
        height: height || 1080,
      };
    }

    // Assemble video
    const outputPath = join(process.cwd(), 'tmp', 'face-swap-pipeline', projectId, 'output', 'final-video.mp4');
    await assembleVideo(framePaths, outputPath, videoMetadata);

    console.log('[ReconstructVideo API] Video assembled:', outputPath);

    // Upload to S3
    const s3Key = await uploadToS3(outputPath, `face-swap-pipeline/${projectId}/final-video.mp4`);
    const videoUrl = getS3Url(s3Key);

    console.log('[ReconstructVideo API] ✓ Video uploaded to S3:', videoUrl);
    console.log('[ReconstructVideo API] ========================================');

    return NextResponse.json({
      success: true,
      videoUrl,
    });
  } catch (error: any) {
    console.error('[ReconstructVideo API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reconstruct video',
      },
      { status: 500 }
    );
  }
}

