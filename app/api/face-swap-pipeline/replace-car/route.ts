import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { detectAndMaskCar, extractSceneStructure } from '@/lib/services/face-swap-pipeline/car-processor';
import { inpaintCar } from '@/lib/services/face-swap-pipeline/car-inpainter';
import { uploadToS3, getS3Url } from '@/lib/storage/s3-uploader';

export const dynamic = 'force-dynamic';

/**
 * POST /api/face-swap-pipeline/replace-car
 * Replace car in a frame
 * 
 * Request Body (FormData):
 * - frame: File (required) - Frame image
 * - prompt: string (required) - Description of replacement car
 * - useControlNet?: string - 'true' to use ControlNet for structure preservation
 * - negativePrompt?: string
 * - guidanceScale?: number
 * - numInferenceSteps?: number
 * 
 * Response:
 * {
 *   success: boolean;
 *   processedFrameUrl?: string;
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
    const prompt = formData.get('prompt') as string;

    if (!frameFile || !prompt) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: frame and prompt',
        },
        { status: 400 }
      );
    }

    const useControlNet = formData.get('useControlNet') === 'true';
    const negativePrompt = (formData.get('negativePrompt') as string) || undefined;
    const guidanceScale = formData.get('guidanceScale')
      ? parseFloat(formData.get('guidanceScale') as string)
      : undefined;
    const numInferenceSteps = formData.get('numInferenceSteps')
      ? parseInt(formData.get('numInferenceSteps') as string, 10)
      : undefined;

    console.log('[ReplaceCar API] ========================================');
    console.log('[ReplaceCar API] Request received');
    console.log('[ReplaceCar API] Frame:', frameFile.name);
    console.log('[ReplaceCar API] Prompt:', prompt);
    console.log('[ReplaceCar API] Use ControlNet:', useControlNet);

    // Save frame to temp directory
    const projectId = `car-replace-${Date.now()}`;
    const uploadsDir = join(process.cwd(), 'tmp', 'face-swap-pipeline', projectId, 'input');
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    const frameBytes = await frameFile.arrayBuffer();
    const framePath = join(uploadsDir, frameFile.name);
    await writeFile(framePath, Buffer.from(frameBytes));

    // Upload to S3
    const frameS3Key = await uploadToS3(framePath, `face-swap-pipeline/${projectId}/input/${frameFile.name}`);
    const frameUrl = getS3Url(frameS3Key);

    console.log('[ReplaceCar API] Frame uploaded to S3:', frameUrl);

    // Step 1: Detect and mask car
    const maskUrl = await detectAndMaskCar(frameUrl);
    console.log('[ReplaceCar API] Car detected and masked');

    // Step 2: Extract scene structure (if using ControlNet)
    let controlImageUrl: string | undefined;
    if (useControlNet) {
      const structure = await extractSceneStructure(frameUrl);
      controlImageUrl = structure.edges;
      console.log('[ReplaceCar API] Scene structure extracted');
    }

    // Step 3: Inpaint new car
    const processedUrl = await inpaintCar(frameUrl, maskUrl, prompt, {
      useControlNet,
      controlImageUrl,
      negativePrompt,
      guidanceScale,
      numInferenceSteps,
    });

    console.log('[ReplaceCar API] ✓ Car replacement complete');
    console.log('[ReplaceCar API] ========================================');

    return NextResponse.json({
      success: true,
      processedFrameUrl: processedUrl,
    });
  } catch (error: any) {
    console.error('[ReplaceCar API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to replace car',
      },
      { status: 500 }
    );
  }
}

