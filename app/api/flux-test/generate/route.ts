import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import Replicate from 'replicate';
import { uploadToS3, getS3Url } from '@/lib/storage/s3-uploader';

export const dynamic = 'force-dynamic';

const FLUX_MODEL = 'black-forest-labs/flux-1.1-pro';
const MAX_POLL_ATTEMPTS = 120; // 4 minutes (120 * 2s)
const POLL_INTERVAL = 2000; // 2 seconds

/**
 * POST /api/flux-test/generate
 * Generates an image using Flux Pro model
 *
 * Request Body (FormData):
 * - image: File (required)
 * - prompt: string (required)
 *
 * Response:
 * {
 *   success: boolean;
 *   imageUrl?: string;
 *   predictionId?: string;
 *   prompt?: string;
 *   error?: string;
 * }
 */
export async function POST(request: NextRequest) {
  const timestamp = new Date().toISOString();

  try {
    // Check for required environment variables
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
    const imageFile = formData.get('image') as File;
    const prompt = formData.get('prompt') as string;

    // Validate required fields
    if (!imageFile) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required field: image file',
        },
        { status: 400 }
      );
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing or invalid required field: prompt',
        },
        { status: 400 }
      );
    }

    console.log('[Flux Test] ========================================');
    console.log('[Flux Test] Request received');
    console.log('[Flux Test] Timestamp:', timestamp);
    console.log('[Flux Test] Model:', FLUX_MODEL);
    console.log('[Flux Test] Image:', imageFile.name);
    console.log('[Flux Test] Image Size:', imageFile.size, 'bytes');
    console.log('[Flux Test] Prompt:', prompt);
    console.log('[Flux Test] ========================================');

    // Save image to temp directory
    const bytes = await imageFile.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadsDir = join(process.cwd(), 'tmp', 'flux-test');
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    const fileTimestamp = Date.now();
    const fileName = `${fileTimestamp}-${imageFile.name}`;
    const filePath = join(uploadsDir, fileName);

    await writeFile(filePath, buffer);
    console.log('[Flux Test] Image saved to:', filePath);

    // Upload to S3 to get a public URL
    let imageUrl: string;
    try {
      console.log('[Flux Test] Uploading image to S3...');
      const s3Key = await uploadToS3(filePath, `flux-test/${fileName}`);
      imageUrl = getS3Url(s3Key);
      console.log('[Flux Test] ✓ Image uploaded to S3:', imageUrl);
    } catch (s3Error: any) {
      console.error('[Flux Test] ✗ S3 upload failed:', s3Error?.message || s3Error);
      // Fallback to local URL if S3 fails (may not work for Replicate if not publicly accessible)
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      imageUrl = `${baseUrl}/api/images/${encodeURIComponent(filePath)}`;
      console.warn('[Flux Test] Using fallback local URL (may not be accessible by Replicate):', imageUrl);
    }

    // Initialize Replicate client
    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    console.log('[Flux Test] Creating prediction with Flux Pro...');
    console.log('[Flux Test] Input image URL:', imageUrl);

    // Create prediction with Flux Pro
    const prediction = await replicate.predictions.create({
      model: FLUX_MODEL,
      input: {
        prompt: prompt.trim(),
        image: imageUrl,
        prompt_upsampling: false,
        aspect_ratio: '1:1',
        output_format: 'png',
        output_quality: 100,
      },
    });

    console.log('[Flux Test] ✓ Prediction created:', prediction.id);
    console.log('[Flux Test] Initial status:', prediction.status);

    // Poll for completion
    let completed = false;
    let attempts = 0;
    let result = prediction;

    console.log('[Flux Test] Starting polling for completion...');
    console.log(`[Flux Test] Max attempts: ${MAX_POLL_ATTEMPTS} (${(MAX_POLL_ATTEMPTS * POLL_INTERVAL) / 1000 / 60} minutes)`);

    while (!completed && attempts < MAX_POLL_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

      result = await replicate.predictions.get(prediction.id);
      attempts++;

      const elapsedSeconds = (attempts * POLL_INTERVAL) / 1000;
      console.log(`[Flux Test] Polling attempt ${attempts}/${MAX_POLL_ATTEMPTS} (${elapsedSeconds.toFixed(1)}s) - Status: ${result.status}`);

      if (result.status === 'succeeded') {
        completed = true;
        console.log('[Flux Test] ✓ Image generation succeeded!');
      } else if (result.status === 'failed') {
        const errorMessage = result.error || 'Unknown error';
        console.error('[Flux Test] ✗ Image generation failed:', errorMessage);
        throw new Error(`Image generation failed: ${errorMessage}`);
      } else if (result.status === 'canceled') {
        console.error('[Flux Test] ✗ Image generation was canceled');
        throw new Error('Image generation was canceled');
      }
    }

    if (!completed) {
      const timeoutMinutes = (MAX_POLL_ATTEMPTS * POLL_INTERVAL) / 1000 / 60;
      console.error(`[Flux Test] ✗ Image generation timed out after ${timeoutMinutes} minutes`);
      throw new Error(`Image generation timed out after ${timeoutMinutes} minutes`);
    }

    // Extract image URL from output
    let outputImageUrl: string | null = null;

    if (result.output) {
      if (typeof result.output === 'string') {
        outputImageUrl = result.output;
      } else if (Array.isArray(result.output) && result.output.length > 0) {
        outputImageUrl = result.output[0];
      } else if (typeof result.output === 'object' && 'url' in result.output) {
        outputImageUrl = result.output.url;
      } else if (typeof result.output === 'object' && result.output !== null) {
        // Try to find URL in nested object
        const outputStr = JSON.stringify(result.output);
        const urlMatch = outputStr.match(/https?:\/\/[^\s"']+/);
        if (urlMatch) {
          outputImageUrl = urlMatch[0];
        }
      }
    }

    if (!outputImageUrl) {
      console.error('[Flux Test] ✗ No image URL found in prediction output');
      console.error('[Flux Test] Output type:', typeof result.output);
      console.error('[Flux Test] Output value:', JSON.stringify(result.output, null, 2));
      throw new Error('No image URL in prediction output');
    }

    console.log('[Flux Test] ✓ Image URL extracted:', outputImageUrl);
    console.log('[Flux Test] ========================================');
    console.log('[Flux Test] Generation complete!');
    console.log('[Flux Test] ========================================');

    return NextResponse.json({
      success: true,
      imageUrl: outputImageUrl,
      predictionId: prediction.id,
      prompt: prompt.trim(),
    });
  } catch (error: any) {
    console.error('[Flux Test] ========================================');
    console.error('[Flux Test] ✗ Error occurred');
    console.error('[Flux Test] ========================================');
    console.error('[Flux Test] Error message:', error?.message || error);
    if (error?.stack) {
      console.error('[Flux Test] Stack trace:', error.stack);
    }
    console.error('[Flux Test] ========================================');

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate image',
      },
      { status: 500 }
    );
  }
}
