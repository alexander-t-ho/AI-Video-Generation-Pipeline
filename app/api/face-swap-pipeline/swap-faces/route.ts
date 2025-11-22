import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { swapFace } from '@/lib/services/face-swap-pipeline/face-swapper';
import { enhanceFace, swapAndEnhanceFace } from '@/lib/services/face-swap-pipeline/face-enhancer';
import { uploadToS3, getS3Url } from '@/lib/storage/s3-uploader';

export const dynamic = 'force-dynamic';

/**
 * POST /api/face-swap-pipeline/swap-faces
 * Swap face in a frame (with optional enhancement)
 * 
 * Request Body (FormData):
 * - frame: File (required) - Frame image
 * - referenceFace: File (required) - Reference face image
 * - swapModel?: string - 'simple' or 'advanced'
 * - enableEnhancement?: string - 'true' or 'false'
 * - enhanceModel?: string - 'gfpgan' or 'codeformer'
 * 
 * Response:
 * {
 *   success: boolean;
 *   swappedFrameUrl?: string;
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
    const frameFile = formData.get('frame') as File;
    const referenceFaceFile = formData.get('referenceFace') as File;

    if (!frameFile || !referenceFaceFile) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: frame and referenceFace',
        },
        { status: 400 }
      );
    }

    const swapModel = (formData.get('swapModel') as string) || 'simple';
    const enableEnhancement = formData.get('enableEnhancement') === 'true';
    const enhanceModel = (formData.get('enhanceModel') as string) || 'gfpgan';

    console.log('[SwapFaces API] ========================================');
    console.log('[SwapFaces API] Request received');
    console.log('[SwapFaces API] Frame:', frameFile.name);
    console.log('[SwapFaces API] Reference face:', referenceFaceFile.name);
    console.log('[SwapFaces API] Swap model:', swapModel);
    console.log('[SwapFaces API] Enable enhancement:', enableEnhancement);
    if (enableEnhancement) {
      console.log('[SwapFaces API] Enhance model:', enhanceModel);
    }

    // Save files to temp directory
    const projectId = `face-swap-${Date.now()}`;
    const uploadsDir = join(process.cwd(), 'tmp', 'face-swap-pipeline', projectId, 'swap-input');
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    const frameBytes = await frameFile.arrayBuffer();
    const referenceBytes = await referenceFaceFile.arrayBuffer();

    const framePath = join(uploadsDir, frameFile.name);
    const referencePath = join(uploadsDir, referenceFaceFile.name);

    await Promise.all([
      writeFile(framePath, Buffer.from(frameBytes)),
      writeFile(referencePath, Buffer.from(referenceBytes)),
    ]);

    // Upload to S3 to get public URLs
    const [frameS3Key, referenceS3Key] = await Promise.all([
      uploadToS3(framePath, `face-swap-pipeline/${projectId}/input/${frameFile.name}`),
      uploadToS3(referencePath, `face-swap-pipeline/${projectId}/input/${referenceFaceFile.name}`),
    ]);

    const frameUrl = getS3Url(frameS3Key);
    const referenceFaceUrl = getS3Url(referenceS3Key);

    console.log('[SwapFaces API] Files uploaded to S3');
    console.log('[SwapFaces API] Frame URL:', frameUrl);
    console.log('[SwapFaces API] Reference face URL:', referenceFaceUrl);

    // Process frame
    let resultUrl: string;

    if (enableEnhancement) {
      // Swap and enhance in one go
      resultUrl = await swapAndEnhanceFace(
        frameUrl,
        referenceFaceUrl,
        swapModel as 'simple' | 'advanced',
        enhanceModel as 'gfpgan' | 'codeformer'
      );
    } else {
      // Just swap
      resultUrl = await swapFace(
        frameUrl,
        referenceFaceUrl,
        swapModel as 'simple' | 'advanced'
      );
    }

    console.log('[SwapFaces API] ✓ Face swap complete');
    console.log('[SwapFaces API] Result URL:', resultUrl);
    console.log('[SwapFaces API] ========================================');

    return NextResponse.json({
      success: true,
      swappedFrameUrl: resultUrl,
    });
  } catch (error: any) {
    console.error('[SwapFaces API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to swap face',
      },
      { status: 500 }
    );
  }
}

