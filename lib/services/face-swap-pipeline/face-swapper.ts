/**
 * Face Swap Service
 * Wrapper around Replicate face swap models
 */

import Replicate from 'replicate';
import { uploadToS3, getS3Url } from '@/lib/storage/s3-uploader';

const logPrefix = '[FaceSwapper]';

// Face swap model configurations with verified version hashes
const FACESWAP_MODELS = {
  simple: {
    name: 'codeplugtech/face-swap',
    version: '278a81e7ebb22db98bcba54de985d22cc1abeead2754eb1f2af717247be69b34',
    inputFields: { target: 'input_image', source: 'swap_image' },
  },
  advanced: {
    name: 'easel/advanced-face-swap',
    version: '602d8c526aca9e5081f0515649ff8998e058cf7e6b9ff32717d25327f18c5145',
    inputFields: { target: 'target_image', source: 'swap_image' },
  },
} as const;

// Model type for external use
export type FaceSwapModel = 'simple' | 'advanced';

const MAX_POLL_ATTEMPTS = 120; // 4 minutes
const POLL_INTERVAL = 2000; // 2 seconds

/**
 * Swap face in a frame using Replicate
 * @param frameUrl - URL of the frame image
 * @param referenceFaceUrl - URL of the reference face image
 * @param model - Model to use ('simple' or 'advanced')
 * @returns URL of the swapped frame
 */
export async function swapFace(
  frameUrl: string,
  referenceFaceUrl: string,
  model: FaceSwapModel = 'simple'
): Promise<string> {
  console.log(`${logPrefix} Starting face swap`);
  console.log(`${logPrefix} Frame: ${frameUrl}`);
  console.log(`${logPrefix} Reference face: ${referenceFaceUrl}`);
  console.log(`${logPrefix} Model: ${model}`);

  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error('REPLICATE_API_TOKEN environment variable is not set');
  }

  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  const modelConfig = FACESWAP_MODELS[model];

  // Build input using model-specific field names
  const input: Record<string, unknown> = {
    [modelConfig.inputFields.target]: frameUrl, // Frame to swap onto
    [modelConfig.inputFields.source]: referenceFaceUrl, // Face to swap from
  };

  console.log(`${logPrefix} Using model: ${modelConfig.name}`);
  console.log(`${logPrefix} Version: ${modelConfig.version}`);
  console.log(`${logPrefix} Creating prediction...`);

  // Create prediction using version hash for reliable API calls
  const prediction = await replicate.predictions.create({
    version: modelConfig.version,
    input,
  });

  console.log(`${logPrefix} Prediction created: ${prediction.id}`);
  console.log(`${logPrefix} Initial status: ${prediction.status}`);

  // Poll for completion
  let completed = false;
  let attempts = 0;
  let result = prediction;

  while (!completed && attempts < MAX_POLL_ATTEMPTS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

    result = await replicate.predictions.get(prediction.id);
    attempts++;

    const elapsedSeconds = (attempts * POLL_INTERVAL) / 1000;
    if (attempts % 10 === 0) {
      console.log(`${logPrefix} Polling ${attempts}/${MAX_POLL_ATTEMPTS} (${elapsedSeconds.toFixed(1)}s) - Status: ${result.status}`);
    }

    if (result.status === 'succeeded') {
      completed = true;
      console.log(`${logPrefix} ✓ Face swap succeeded!`);
    } else if (result.status === 'failed') {
      const errorMessage = result.error || 'Unknown error';
      console.error(`${logPrefix} ✗ Face swap failed: ${errorMessage}`);
      throw new Error(`Face swap failed: ${errorMessage}`);
    } else if (result.status === 'canceled') {
      console.error(`${logPrefix} ✗ Face swap was canceled`);
      throw new Error('Face swap was canceled');
    }
  }

  if (!completed) {
    const timeoutMinutes = (MAX_POLL_ATTEMPTS * POLL_INTERVAL) / 1000 / 60;
    console.error(`${logPrefix} ✗ Face swap timed out after ${timeoutMinutes} minutes`);
    throw new Error(`Face swap timed out after ${timeoutMinutes} minutes`);
  }

  // Extract output image URL
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
    console.error(`${logPrefix} ✗ No image URL found in prediction output`);
    console.error(`${logPrefix} Output:`, JSON.stringify(result.output, null, 2));
    throw new Error('No image URL in prediction output');
  }

  console.log(`${logPrefix} ✓ Face swap complete: ${outputImageUrl}`);
  return outputImageUrl;
}

/**
 * Batch swap faces on multiple frames
 * @param frames - Array of frame URLs
 * @param referenceFaceUrl - URL of reference face
 * @param model - Model to use ('simple' or 'advanced')
 * @returns Array of swapped frame URLs
 */
export async function batchSwapFaces(
  frames: string[],
  referenceFaceUrl: string,
  model: FaceSwapModel = 'simple'
): Promise<string[]> {
  console.log(`${logPrefix} Batch swapping faces on ${frames.length} frames`);

  const results: string[] = [];

  // Process frames sequentially to avoid rate limits
  for (let i = 0; i < frames.length; i++) {
    try {
      console.log(`${logPrefix} Processing frame ${i + 1}/${frames.length}`);
      const swappedUrl = await swapFace(frames[i], referenceFaceUrl, model);
      results.push(swappedUrl);
    } catch (error: any) {
      console.error(`${logPrefix} Failed to swap face on frame ${i + 1}:`, error.message);
      // Continue with other frames
      results.push(frames[i]); // Use original frame as fallback
    }
  }

  console.log(`${logPrefix} ✓ Batch swap complete: ${results.length}/${frames.length} successful`);
  return results;
}

