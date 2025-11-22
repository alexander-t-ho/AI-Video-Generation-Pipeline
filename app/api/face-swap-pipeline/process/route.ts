import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { processVideoPipeline } from '@/lib/services/face-swap-pipeline/pipeline-orchestrator';
import { uploadToS3, getS3Url } from '@/lib/storage/s3-uploader';
import { ProcessingOptions } from '@/lib/types/face-swap-pipeline';

export const dynamic = 'force-dynamic';

/**
 * POST /api/face-swap-pipeline/process
 * Main entry point for video processing pipeline
 * 
 * Request Body (FormData):
 * - video: File (required) - Video file
 * - referenceFace?: File - Reference face image
 * - referencePerson?: File - Reference person image
 * - referenceCar?: File - Reference car image
 * - frameExtractionRate?: number - Extract every Nth frame
 * - extractByTimeInterval?: number - Extract frame every N seconds
 * - processKeyFramesOnly?: string - 'true' to process only key frames
 * - enableFaceSwap?: string - 'true' to enable face swapping
 * - enablePersonReplacement?: string - 'true' to enable person replacement
 * - enableCarReplacement?: string - 'true' to enable car replacement
 * - enableEnhancement?: string - 'true' to enable enhancement
 * - enableUpscaling?: string - 'true' to enable upscaling
 * - faceSwapModel?: string - 'simple' or 'advanced'
 * - upscalingModel?: string - 'real-esrgan' or 'realesrgan'
 * 
 * Response:
 * {
 *   success: boolean;
 *   jobId?: string;
 *   error?: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json(
        {
          success: false,
          error: 'REPLICATE_API_TOKEN environment variable is not set.',
        },
        { status: 500 }
      );
    }

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

    console.log('[ProcessPipeline API] ========================================');
    console.log('[ProcessPipeline API] Starting video processing pipeline');
    console.log('[ProcessPipeline API] Video:', videoFile.name, '-', videoFile.size, 'bytes');

    // Save video to temp directory
    const projectId = `face-swap-pipeline-${Date.now()}`;
    const uploadsDir = join(process.cwd(), 'tmp', 'face-swap-pipeline', projectId, 'input');
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    const videoBytes = await videoFile.arrayBuffer();
    const videoBuffer = Buffer.from(videoBytes);
    const videoPath = join(uploadsDir, videoFile.name);
    await writeFile(videoPath, videoBuffer);

    console.log('[ProcessPipeline API] Video saved to:', videoPath);

    // Handle reference images
    const referenceImages: {
      face?: string;
      person?: string;
      car?: string;
    } = {};

    const referenceFaceFile = formData.get('referenceFace') as File | null;
    const referencePersonFile = formData.get('referencePerson') as File | null;
    const referenceCarFile = formData.get('referenceCar') as File | null;

    // Upload reference images to S3
    if (referenceFaceFile) {
      const faceBytes = await referenceFaceFile.arrayBuffer();
      const facePath = join(uploadsDir, referenceFaceFile.name);
      await writeFile(facePath, Buffer.from(faceBytes));
      const s3Key = await uploadToS3(facePath, `face-swap-pipeline/${projectId}/reference-face.jpg`);
      referenceImages.face = getS3Url(s3Key);
      console.log('[ProcessPipeline API] Reference face uploaded');
    }

    if (referencePersonFile) {
      const personBytes = await referencePersonFile.arrayBuffer();
      const personPath = join(uploadsDir, referencePersonFile.name);
      await writeFile(personPath, Buffer.from(personBytes));
      const s3Key = await uploadToS3(personPath, `face-swap-pipeline/${projectId}/reference-person.jpg`);
      referenceImages.person = getS3Url(s3Key);
      console.log('[ProcessPipeline API] Reference person uploaded');
    }

    if (referenceCarFile) {
      const carBytes = await referenceCarFile.arrayBuffer();
      const carPath = join(uploadsDir, referenceCarFile.name);
      await writeFile(carPath, Buffer.from(carBytes));
      const s3Key = await uploadToS3(carPath, `face-swap-pipeline/${projectId}/reference-car.jpg`);
      referenceImages.car = getS3Url(s3Key);
      console.log('[ProcessPipeline API] Reference car uploaded');
    }

    // Parse processing options
    const processingOptions: ProcessingOptions = {
      frameExtractionRate: formData.get('frameExtractionRate')
        ? parseInt(formData.get('frameExtractionRate') as string, 10)
        : undefined,
      extractByTimeInterval: formData.get('extractByTimeInterval')
        ? parseFloat(formData.get('extractByTimeInterval') as string)
        : undefined,
      processKeyFramesOnly: formData.get('processKeyFramesOnly') === 'true',
      enableFaceSwap: formData.get('enableFaceSwap') === 'true',
      enablePersonReplacement: formData.get('enablePersonReplacement') === 'true',
      enableCarReplacement: formData.get('enableCarReplacement') === 'true',
      enableEnhancement: formData.get('enableEnhancement') === 'true',
      enableUpscaling: formData.get('enableUpscaling') === 'true',
      faceSwapModel: (formData.get('faceSwapModel') as 'simple' | 'advanced') || 'simple',
      upscalingModel: (formData.get('upscalingModel') as 'real-esrgan' | 'realesrgan') || 'real-esrgan',
    };

    console.log('[ProcessPipeline API] Processing options:', processingOptions);

    // Start pipeline
    const jobId = await processVideoPipeline(
      videoPath,
      projectId,
      referenceImages,
      processingOptions
    );

    console.log('[ProcessPipeline API] ✓ Pipeline started');
    console.log('[ProcessPipeline API] Job ID:', jobId);
    console.log('[ProcessPipeline API] ========================================');

    return NextResponse.json({
      success: true,
      jobId,
      projectId,
    });
  } catch (error: any) {
    console.error('[ProcessPipeline API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start pipeline',
      },
      { status: 500 }
    );
  }
}

