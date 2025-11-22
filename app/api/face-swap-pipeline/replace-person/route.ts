import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { segmentPerson, createPersonMask } from '@/lib/services/face-swap-pipeline/person-segmenter';
import { inpaintPerson } from '@/lib/services/face-swap-pipeline/person-inpainter';
import { uploadToS3, getS3Url } from '@/lib/storage/s3-uploader';

export const dynamic = 'force-dynamic';

/**
 * POST /api/face-swap-pipeline/replace-person
 * Replace person in a frame
 * 
 * Request Body (FormData):
 * - frame: File (required) - Frame image
 * - prompt: string (required) - Description of replacement person
 * - negativePrompt?: string - Negative prompt
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

    const negativePrompt = (formData.get('negativePrompt') as string) || undefined;
    const guidanceScale = formData.get('guidanceScale')
      ? parseFloat(formData.get('guidanceScale') as string)
      : undefined;
    const numInferenceSteps = formData.get('numInferenceSteps')
      ? parseInt(formData.get('numInferenceSteps') as string, 10)
      : undefined;

    console.log('[ReplacePerson API] ========================================');
    console.log('[ReplacePerson API] Request received');
    console.log('[ReplacePerson API] Frame:', frameFile.name);
    console.log('[ReplacePerson API] Prompt:', prompt);

    // Save frame to temp directory
    const projectId = `person-replace-${Date.now()}`;
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

    console.log('[ReplacePerson API] Frame uploaded to S3:', frameUrl);

    // Step 1: Segment person (create mask)
    const segmentedPersonUrl = await segmentPerson(frameUrl);
    const maskUrl = await createPersonMask(frameUrl, segmentedPersonUrl);

    console.log('[ReplacePerson API] Person segmented, mask created');

    // Step 2: Inpaint new person
    const processedUrl = await inpaintPerson(frameUrl, maskUrl, prompt, {
      negativePrompt,
      guidanceScale,
      numInferenceSteps,
    });

    console.log('[ReplacePerson API] ✓ Person replacement complete');
    console.log('[ReplacePerson API] ========================================');

    return NextResponse.json({
      success: true,
      processedFrameUrl: processedUrl,
    });
  } catch (error: any) {
    console.error('[ReplacePerson API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to replace person',
      },
      { status: 500 }
    );
  }
}

