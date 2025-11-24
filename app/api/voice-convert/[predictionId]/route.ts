/**
 * Voice Conversion Status API Route
 * 
 * GET /api/voice-convert/[predictionId]
 * Check the status of a voice conversion prediction
 */

import { NextRequest, NextResponse } from 'next/server';
import { getVoiceConversionStatus } from '@/lib/ai/voice-converter';
import { getStorageService } from '@/lib/storage/storage-service';
import fs from 'fs';
import path from 'path';

interface RouteParams {
  params: Promise<{
    predictionId: string;
  }>;
}

export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const { predictionId } = await context.params;
    const projectId = request.nextUrl.searchParams.get('projectId');

    if (!predictionId) {
      return NextResponse.json(
        { success: false, error: 'Missing predictionId' },
        { status: 400 }
      );
    }

    console.log('[VoiceConvertStatus API] Checking status:', { predictionId });

    const status = await getVoiceConversionStatus(predictionId);

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
        console.warn('[VoiceConvertStatus API] Failed to save audio locally:', downloadError);
        // Still return success with just the URL
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
    console.error('[VoiceConvertStatus API] Error:', error);

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
 * Download converted audio and save to local storage + S3
 */
async function downloadAndSaveAudio(
  audioUrl: string,
  projectId: string,
  predictionId: string
): Promise<{ localPath: string; s3Url?: string }> {
  // Create output directory
  const outputDir = path.join('/tmp', 'ai-video-pipeline', projectId, 'voice-converted');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Determine file extension from URL
  const extension = audioUrl.includes('.wav') ? 'wav' : 'mp3';
  const filename = `voice_converted_${predictionId}.${extension}`;
  const localPath = path.join(outputDir, filename);

  // Download the audio file
  console.log('[VoiceConvertStatus API] Downloading audio from:', audioUrl);
  const response = await fetch(audioUrl);

  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Save locally
  fs.writeFileSync(localPath, buffer);
  console.log('[VoiceConvertStatus API] Saved audio to:', localPath);

  // Upload to S3
  let s3Url: string | undefined;
  try {
    const storageService = getStorageService();
    const storedFile = await storageService.storeFile(buffer, {
      projectId,
      category: 'generated-videos',
      mimeType: `audio/${extension}`,
      customFilename: filename,
    }, {
      keepLocal: true,
    });
    s3Url = storedFile.url;
    console.log('[VoiceConvertStatus API] Uploaded to S3:', s3Url);
  } catch (s3Error) {
    console.warn('[VoiceConvertStatus API] Failed to upload to S3:', s3Error);
  }

  return { localPath, s3Url };
}

