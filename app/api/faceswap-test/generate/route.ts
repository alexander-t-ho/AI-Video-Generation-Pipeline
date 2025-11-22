import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import Replicate from 'replicate';
import { uploadToS3, getS3Url } from '@/lib/storage/s3-uploader';

export const dynamic = 'force-dynamic';

// Face swap model configurations with version hashes
const FACESWAP_MODELS = {
  simple: {
    name: 'codeplugtech/face-swap',
    version: '278a81e7ebb22db98bcba54de985d22cc1abeead2754eb1f2af717247be69b34',
  },
  advanced: {
    name: 'easel/advanced-face-swap',
    version: '602d8c526aca9e5081f0515649ff8998e058cf7e6b9ff32717d25327f18c5145',
  },
} as const;

// Face restoration model configurations
const RESTORATION_MODELS = {
  codeformer: {
    name: 'sczhou/codeformer',
    version: 'cc4956dd26fa5a7185d5660cc9100fab1b8070a1d1654a8bb5eb6d443b020bb2',
  },
  gfpgan: {
    name: 'tencentarc/gfpgan',
    version: '0fbacf7afc6c144e5be9767cff80f25aff23e52b0708f17e20f9879b2f21516c',
  },
} as const;

const MAX_POLL_ATTEMPTS = 120; // 4 minutes (120 * 2s)
const POLL_INTERVAL = 2000; // 2 seconds

/**
 * POST /api/faceswap-test/generate
 * Swaps faces between images using AI models, with optional face restoration
 *
 * Request Body (FormData):
 * - targetImage: File (required) - The image to swap faces onto
 * - swapImage: File (required) - The face to swap from
 * - model: string (required) - 'simple' or 'advanced'
 *
 * Advanced model only:
 * - swapImageB: File (optional) - Second face for multi-person swaps
 * - userGender: string - 'a man' or 'a woman'
 * - userBGender: string - 'a man' or 'a woman'
 * - hairSource: string - 'user' or 'target'
 * - upscale: string - 'true' or 'false'
 * - detailer: string - 'true' or 'false'
 *
 * Face Restoration (optional):
 * - enableRestoration: string - 'true' or 'false'
 * - restorationMethod: string - 'codeformer' or 'gfpgan'
 * - fidelity: string - '0.1' to '1.0' (CodeFormer only, default 0.7)
 * - restorationUpscale: string - '1' to '4' (default 2)
 *
 * Response:
 * {
 *   success: boolean;
 *   swappedImageUrl?: string;
 *   restoredImageUrl?: string;
 *   predictionId?: string;
 *   restorationPredictionId?: string;
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
    const targetImageFile = formData.get('targetImage') as File;
    const swapImageFile = formData.get('swapImage') as File;
    const swapImageBFile = formData.get('swapImageB') as File | null;
    const modelType = (formData.get('model') as string) || 'simple';

    // Advanced model options
    const userGender = (formData.get('userGender') as string) || 'a woman';
    const userBGender = (formData.get('userBGender') as string) || 'a woman';
    const hairSource = (formData.get('hairSource') as string) || 'user';
    const upscale = formData.get('upscale') === 'true';
    const detailer = formData.get('detailer') === 'true';

    // Face restoration options
    const enableRestoration = formData.get('enableRestoration') === 'true';
    const restorationMethod = (formData.get('restorationMethod') as string) || 'codeformer';
    const fidelity = parseFloat(formData.get('fidelity') as string) || 0.7;
    const restorationUpscale = parseInt(formData.get('restorationUpscale') as string) || 2;

    // Validate required fields
    if (!targetImageFile) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required field: target image',
        },
        { status: 400 }
      );
    }

    if (!swapImageFile) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required field: swap image (face to swap from)',
        },
        { status: 400 }
      );
    }

    const modelConfig = modelType === 'advanced' ? FACESWAP_MODELS.advanced : FACESWAP_MODELS.simple;

    console.log('[FaceSwap Test] ========================================');
    console.log('[FaceSwap Test] Request received');
    console.log('[FaceSwap Test] Timestamp:', timestamp);
    console.log('[FaceSwap Test] Model:', modelConfig.name);
    console.log('[FaceSwap Test] Version:', modelConfig.version || 'latest');
    console.log('[FaceSwap Test] Target Image:', targetImageFile.name, '-', targetImageFile.size, 'bytes');
    console.log('[FaceSwap Test] Swap Image:', swapImageFile.name, '-', swapImageFile.size, 'bytes');
    if (swapImageBFile) {
      console.log('[FaceSwap Test] Swap Image B:', swapImageBFile.name, '-', swapImageBFile.size, 'bytes');
    }
    if (modelType === 'advanced') {
      console.log('[FaceSwap Test] User Gender:', userGender);
      console.log('[FaceSwap Test] User B Gender:', userBGender);
      console.log('[FaceSwap Test] Hair Source:', hairSource);
      console.log('[FaceSwap Test] Upscale:', upscale);
      console.log('[FaceSwap Test] Detailer:', detailer);
    }
    console.log('[FaceSwap Test] Enable Restoration:', enableRestoration);
    if (enableRestoration) {
      console.log('[FaceSwap Test] Restoration Method:', restorationMethod);
      if (restorationMethod === 'codeformer') {
        console.log('[FaceSwap Test] Fidelity:', fidelity);
      }
      console.log('[FaceSwap Test] Restoration Upscale:', restorationUpscale);
    }
    console.log('[FaceSwap Test] ========================================');

    // Create uploads directory
    const uploadsDir = join(process.cwd(), 'tmp', 'faceswap-test');
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    const fileTimestamp = Date.now();

    // Helper function to upload an image to S3
    const uploadImageToS3 = async (file: File, prefix: string): Promise<string> => {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const fileName = `${fileTimestamp}-${prefix}-${file.name}`;
      const filePath = join(uploadsDir, fileName);

      await writeFile(filePath, buffer);
      console.log(`[FaceSwap Test] ${prefix} saved to:`, filePath);

      try {
        console.log(`[FaceSwap Test] Uploading ${prefix} to S3...`);
        const s3Key = await uploadToS3(filePath, `faceswap-test/${fileName}`);
        const imageUrl = getS3Url(s3Key);
        console.log(`[FaceSwap Test] ${prefix} uploaded to S3:`, imageUrl);
        return imageUrl;
      } catch (s3Error: unknown) {
        const errorMessage = s3Error instanceof Error ? s3Error.message : String(s3Error);
        console.error(`[FaceSwap Test] S3 upload failed for ${prefix}:`, errorMessage);
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const imageUrl = `${baseUrl}/api/images/${encodeURIComponent(filePath)}`;
        console.warn(`[FaceSwap Test] Using fallback local URL for ${prefix}:`, imageUrl);
        return imageUrl;
      }
    };

    // Upload images to S3
    const targetImageUrl = await uploadImageToS3(targetImageFile, 'target');
    const swapImageUrl = await uploadImageToS3(swapImageFile, 'swap');
    let swapImageBUrl: string | null = null;
    if (swapImageBFile && modelType === 'advanced') {
      swapImageBUrl = await uploadImageToS3(swapImageBFile, 'swapB');
    }

    // Initialize Replicate client
    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    console.log('[FaceSwap Test] Creating prediction...');
    console.log('[FaceSwap Test] Target image URL:', targetImageUrl);
    console.log('[FaceSwap Test] Swap image URL:', swapImageUrl);
    if (swapImageBUrl) {
      console.log('[FaceSwap Test] Swap image B URL:', swapImageBUrl);
    }

    // Build input based on model type
    let input: Record<string, unknown>;

    if (modelType === 'advanced') {
      // easel/advanced-face-swap uses target_image and swap_image
      input = {
        target_image: targetImageUrl,
        swap_image: swapImageUrl,
        user_gender: userGender,
        user_b_gender: userBGender,
        hair_source: hairSource,
        upscale: upscale,
        detailer: detailer,
      };

      if (swapImageBUrl) {
        input.swap_image_b = swapImageBUrl;
      }
    } else {
      // codeplugtech/face-swap uses input_image and swap_image
      input = {
        input_image: targetImageUrl,
        swap_image: swapImageUrl,
      };
    }

    console.log('[FaceSwap Test] Input parameters:', input);

    // Create prediction using version hash for reliable API calls
    console.log('[FaceSwap Test] Using version hash for API call');
    const prediction = await replicate.predictions.create({
      version: modelConfig.version,
      input,
    });

    console.log('[FaceSwap Test] Prediction created:', prediction.id);
    console.log('[FaceSwap Test] Initial status:', prediction.status);

    // Poll for completion
    let completed = false;
    let attempts = 0;
    let result = prediction;

    console.log('[FaceSwap Test] Starting polling for completion...');
    console.log(`[FaceSwap Test] Max attempts: ${MAX_POLL_ATTEMPTS} (${(MAX_POLL_ATTEMPTS * POLL_INTERVAL) / 1000 / 60} minutes)`);

    while (!completed && attempts < MAX_POLL_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

      result = await replicate.predictions.get(prediction.id);
      attempts++;

      const elapsedSeconds = (attempts * POLL_INTERVAL) / 1000;
      console.log(`[FaceSwap Test] Polling attempt ${attempts}/${MAX_POLL_ATTEMPTS} (${elapsedSeconds.toFixed(1)}s) - Status: ${result.status}`);

      if (result.status === 'succeeded') {
        completed = true;
        console.log('[FaceSwap Test] Face swap succeeded!');
      } else if (result.status === 'failed') {
        const errorMessage = result.error || 'Unknown error';
        console.error('[FaceSwap Test] Face swap failed:', errorMessage);
        throw new Error(`Face swap failed: ${errorMessage}`);
      } else if (result.status === 'canceled') {
        console.error('[FaceSwap Test] Face swap was canceled');
        throw new Error('Face swap was canceled');
      }
    }

    if (!completed) {
      const timeoutMinutes = (MAX_POLL_ATTEMPTS * POLL_INTERVAL) / 1000 / 60;
      console.error(`[FaceSwap Test] Face swap timed out after ${timeoutMinutes} minutes`);
      throw new Error(`Face swap timed out after ${timeoutMinutes} minutes`);
    }

    // Extract image URL from output
    let outputImageUrl: string | null = null;

    if (result.output) {
      if (typeof result.output === 'string') {
        outputImageUrl = result.output;
      } else if (Array.isArray(result.output) && result.output.length > 0) {
        outputImageUrl = result.output[0];
      } else if (typeof result.output === 'object' && 'url' in result.output) {
        outputImageUrl = (result.output as { url: string }).url;
      } else if (typeof result.output === 'object' && result.output !== null) {
        const outputStr = JSON.stringify(result.output);
        const urlMatch = outputStr.match(/https?:\/\/[^\s"']+/);
        if (urlMatch) {
          outputImageUrl = urlMatch[0];
        }
      }
    }

    if (!outputImageUrl) {
      console.error('[FaceSwap Test] No image URL found in prediction output');
      console.error('[FaceSwap Test] Output type:', typeof result.output);
      console.error('[FaceSwap Test] Output value:', JSON.stringify(result.output, null, 2));
      throw new Error('No image URL in prediction output');
    }

    console.log('[FaceSwap Test] Image URL extracted:', outputImageUrl);
    console.log('[FaceSwap Test] ========================================');
    console.log('[FaceSwap Test] Face swap complete!');
    console.log('[FaceSwap Test] ========================================');

    // Store the swapped image URL
    const swappedImageUrl = outputImageUrl;
    let restoredImageUrl: string | null = null;
    let restorationPredictionId: string | null = null;

    // Step 2: Face Restoration (optional)
    if (enableRestoration) {
      console.log('[FaceSwap Test] ========================================');
      console.log('[FaceSwap Test] Starting face restoration...');
      console.log('[FaceSwap Test] Method:', restorationMethod);
      console.log('[FaceSwap Test] ========================================');

      const restorationConfig = restorationMethod === 'gfpgan'
        ? RESTORATION_MODELS.gfpgan
        : RESTORATION_MODELS.codeformer;

      // Build restoration input based on method
      let restorationInput: Record<string, unknown>;

      if (restorationMethod === 'gfpgan') {
        restorationInput = {
          img: swappedImageUrl,
          version: 'v1.4',
          scale: restorationUpscale,
        };
      } else {
        // CodeFormer
        restorationInput = {
          image: swappedImageUrl,
          codeformer_fidelity: fidelity,
          background_enhance: true,
          face_upsample: true,
          upscale: restorationUpscale,
        };
      }

      console.log('[FaceSwap Test] Restoration input:', restorationInput);

      // Create restoration prediction
      const restorationPrediction = await replicate.predictions.create({
        version: restorationConfig.version,
        input: restorationInput,
      });

      restorationPredictionId = restorationPrediction.id;
      console.log('[FaceSwap Test] Restoration prediction created:', restorationPrediction.id);

      // Poll for restoration completion
      let restorationCompleted = false;
      let restorationAttempts = 0;
      let restorationResult = restorationPrediction;

      while (!restorationCompleted && restorationAttempts < MAX_POLL_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

        restorationResult = await replicate.predictions.get(restorationPrediction.id);
        restorationAttempts++;

        const elapsedSeconds = (restorationAttempts * POLL_INTERVAL) / 1000;
        console.log(`[FaceSwap Test] Restoration polling ${restorationAttempts}/${MAX_POLL_ATTEMPTS} (${elapsedSeconds.toFixed(1)}s) - Status: ${restorationResult.status}`);

        if (restorationResult.status === 'succeeded') {
          restorationCompleted = true;
          console.log('[FaceSwap Test] Face restoration succeeded!');
        } else if (restorationResult.status === 'failed') {
          console.error('[FaceSwap Test] Face restoration failed:', restorationResult.error);
          // Don't throw - we still have the swapped image
          break;
        } else if (restorationResult.status === 'canceled') {
          console.error('[FaceSwap Test] Face restoration was canceled');
          break;
        }
      }

      // Extract restored image URL
      if (restorationCompleted && restorationResult.output) {
        if (typeof restorationResult.output === 'string') {
          restoredImageUrl = restorationResult.output;
        } else if (Array.isArray(restorationResult.output) && restorationResult.output.length > 0) {
          restoredImageUrl = restorationResult.output[0];
        }

        if (restoredImageUrl) {
          console.log('[FaceSwap Test] Restored image URL:', restoredImageUrl);
        }
      }

      console.log('[FaceSwap Test] ========================================');
      console.log('[FaceSwap Test] Restoration phase complete!');
      console.log('[FaceSwap Test] ========================================');
    }

    return NextResponse.json({
      success: true,
      swappedImageUrl: swappedImageUrl,
      restoredImageUrl: restoredImageUrl,
      predictionId: prediction.id,
      restorationPredictionId: restorationPredictionId,
      model: modelConfig.name,
      restorationMethod: enableRestoration ? restorationMethod : null,
    });
  } catch (error: unknown) {
    console.error('[FaceSwap Test] ========================================');
    console.error('[FaceSwap Test] Error occurred');
    console.error('[FaceSwap Test] ========================================');
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[FaceSwap Test] Error message:', errorMessage);
    if (error instanceof Error && error.stack) {
      console.error('[FaceSwap Test] Stack trace:', error.stack);
    }
    console.error('[FaceSwap Test] ========================================');

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to swap faces',
      },
      { status: 500 }
    );
  }
}
