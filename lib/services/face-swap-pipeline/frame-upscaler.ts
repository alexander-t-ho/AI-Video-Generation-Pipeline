/**
 * Frame Upscaling Service
 * Upscales frames using Real-ESRGAN
 */

import Replicate from 'replicate';

const logPrefix = '[FrameUpscaler]';

// Upscaling model configurations
const UPSCALING_MODELS = {
  'real-esrgan': {
    name: 'nightmareai/real-esrgan',
    // Use latest version
  },
  'realesrgan': {
    name: 'xinntao/realesrgan',
    // Use latest version
  },
} as const;

const MAX_POLL_ATTEMPTS = 120;
const POLL_INTERVAL = 2000;

/**
 * Upscale a single frame
 * @param frameUrl - URL of the frame image
 * @param model - Upscaling model to use
 * @param scale - Upscale factor (2, 4, etc.)
 * @returns URL of the upscaled frame
 */
export async function upscaleFrame(
  frameUrl: string,
  model: 'real-esrgan' | 'realesrgan' = 'real-esrgan',
  scale: number = 2
): Promise<string> {
  console.log(`${logPrefix} Upscaling frame: ${frameUrl}`);
  console.log(`${logPrefix} Model: ${model}, Scale: ${scale}x`);

  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error('REPLICATE_API_TOKEN environment variable is not set');
  }

  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  const modelConfig = UPSCALING_MODELS[model];

  // Build input based on model
  let input: Record<string, unknown>;

  if (model === 'real-esrgan') {
    input = {
      image: frameUrl,
      scale: scale,
    };
  } else {
    // realesrgan
    input = {
      image: frameUrl,
      scale: scale,
    };
  }

  console.log(`${logPrefix} Creating prediction...`);

  const prediction = await replicate.predictions.create({
    model: modelConfig.name,
    input,
  });

  console.log(`${logPrefix} Prediction created: ${prediction.id}`);

  // Poll for completion
  let completed = false;
  let attempts = 0;
  let result = prediction;

  while (!completed && attempts < MAX_POLL_ATTEMPTS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

    result = await replicate.predictions.get(prediction.id);
    attempts++;

    if (result.status === 'succeeded') {
      completed = true;
      console.log(`${logPrefix} ✓ Upscaling succeeded!`);
    } else if (result.status === 'failed') {
      const errorMessage = result.error || 'Unknown error';
      console.error(`${logPrefix} ✗ Upscaling failed: ${errorMessage}`);
      throw new Error(`Upscaling failed: ${errorMessage}`);
    } else if (result.status === 'canceled') {
      console.error(`${logPrefix} ✗ Upscaling was canceled`);
      throw new Error('Upscaling was canceled');
    }
  }

  if (!completed) {
    throw new Error('Upscaling timed out');
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
    }
  }

  if (!outputImageUrl) {
    throw new Error('No image URL in prediction output');
  }

  console.log(`${logPrefix} ✓ Upscaling complete: ${outputImageUrl}`);
  return outputImageUrl;
}

/**
 * Batch upscale frames
 * @param frameUrls - Array of frame URLs
 * @param model - Upscaling model
 * @param scale - Upscale factor
 * @returns Array of upscaled frame URLs
 */
export async function batchUpscaleFrames(
  frameUrls: string[],
  model: 'real-esrgan' | 'realesrgan' = 'real-esrgan',
  scale: number = 2
): Promise<string[]> {
  console.log(`${logPrefix} Batch upscaling ${frameUrls.length} frames`);

  const results: string[] = [];

  // Process frames sequentially to avoid rate limits
  for (let i = 0; i < frameUrls.length; i++) {
    try {
      console.log(`${logPrefix} Upscaling frame ${i + 1}/${frameUrls.length}`);
      const upscaledUrl = await upscaleFrame(frameUrls[i], model, scale);
      results.push(upscaledUrl);
    } catch (error: any) {
      console.error(`${logPrefix} Failed to upscale frame ${i + 1}:`, error.message);
      // Use original frame as fallback
      results.push(frameUrls[i]);
    }
  }

  console.log(`${logPrefix} ✓ Batch upscale complete: ${results.length}/${frameUrls.length} successful`);
  return results;
}

