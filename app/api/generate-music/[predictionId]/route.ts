/**
 * Music Generation Status API Route
 *
 * GET /api/generate-music/[predictionId]?provider=musicgen|suno
 * Check the status of a music generation prediction/task
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getMusicGenerationStatus,
  getSunoGenerationStatus,
  MusicProvider,
} from '@/lib/ai/music-generator';
import { getStorageService } from '@/lib/storage/storage-service';
import fs from 'fs';
import path from 'path';

interface RouteParams {
  params: Promise<{
    predictionId: string;
  }>;
}

/**
 * GET /api/generate-music/[predictionId]?provider=musicgen|suno
 *
 * Returns the current status of a music generation prediction/task.
 * If completed, downloads the audio to local storage and S3.
 */
export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const { predictionId } = await context.params;
    const projectId = request.nextUrl.searchParams.get('projectId');
    const provider = (request.nextUrl.searchParams.get('provider') || 'musicgen') as MusicProvider;

    if (!predictionId) {
      return NextResponse.json(
        { success: false, error: 'Missing predictionId/taskId' },
        { status: 400 }
      );
    }

    console.log('[MusicStatus API] Checking status:', { predictionId, provider });

    // Get status based on provider
    const status = provider === 'suno'
      ? await getSunoGenerationStatus(predictionId)
      : await getMusicGenerationStatus(predictionId);

    // If succeeded and we have a project ID, download and save the audio
    if (status.status === 'succeeded' && status.audioUrl && projectId) {
      try {
        const savedAudio = await downloadAndSaveAudio(
          status.audioUrl,
          projectId,
          predictionId
        );

        return NextResponse.json({
          success: true,
          data: {
            status: status.status,
            audioUrl: status.audioUrl,
            localPath: savedAudio.localPath,
            s3Url: savedAudio.s3Url,
          },
        });
      } catch (downloadError) {
        console.warn('[MusicStatus API] Failed to save audio locally:', downloadError);
        // Still return success with just the replicate URL
        return NextResponse.json({
          success: true,
          data: {
            status: status.status,
            audioUrl: status.audioUrl,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        status: status.status,
        audioUrl: status.audioUrl,
        error: status.error,
      },
    });
  } catch (error) {
    console.error('[MusicStatus API] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Download audio from Replicate and save to local storage + S3
 */
async function downloadAndSaveAudio(
  audioUrl: string,
  projectId: string,
  predictionId: string
): Promise<{ localPath: string; s3Url?: string }> {
  // Create output directory
  const outputDir = path.join('/tmp', 'ai-video-pipeline', projectId, 'music');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Determine file extension from URL
  const extension = audioUrl.includes('.wav') ? 'wav' : 'mp3';
  const filename = `music_${predictionId}.${extension}`;
  const localPath = path.join(outputDir, filename);

  // Download the audio file
  console.log('[MusicStatus API] Downloading audio from:', audioUrl);
  const response = await fetch(audioUrl);

  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Save locally
  fs.writeFileSync(localPath, buffer);
  console.log('[MusicStatus API] Saved audio to:', localPath);

  // Upload to S3
  let s3Url: string | undefined;
  try {
    const storageService = getStorageService();
    const storedFile = await storageService.storeFile(buffer, {
      projectId,
      category: 'generated-videos', // Using generated-videos category for audio
      mimeType: `audio/${extension}`,
      customFilename: filename,
    }, {
      keepLocal: true,
    });
    s3Url = storedFile.url;
    console.log('[MusicStatus API] Uploaded to S3:', s3Url);
  } catch (s3Error) {
    console.warn('[MusicStatus API] Failed to upload to S3:', s3Error);
  }

  return { localPath, s3Url };
}
