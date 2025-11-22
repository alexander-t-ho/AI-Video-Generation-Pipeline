/**
 * Face Enhancement Service
 * Post-swap enhancement using GFPGAN or CodeFormer
 */

import Replicate from 'replicate';

const logPrefix = '[FaceEnhancer]';

// Face enhancement model configurations
const ENHANCEMENT_MODELS = {
  gfpgan: {
    name: 'tencentarc/gfpgan',
    version: '0fbacf7afc6c144e5be9767cff80f25aff23e52b0708f17e20f9879b2f21516c',
  },
  codeformer: {
    name: 'sczhou/codeformer',
    version: 'cc4956dd26fa5a7185d5660cc9100fab1b8070a1d1654a8bb5eb6d443b020bb2',
  },
} as const;

const MAX_POLL_ATTEMPTS = 120; // 4 minutes
const POLL_INTERVAL = 2000; // 2 seconds

/**
 * Enhance a face-swapped frame
 * @param frameUrl - URL of the frame image
 * @param model - Enhancement model to use
 * @param options - Enhancement options
 * @returns URL of the enhanced frame
 */
export async function enhanceFace(
  frameUrl: string,
  model: 'gfpgan' | 'codeformer' = 'gfpgan',
  options: {
    scale?: number; // Upscale factor (GFPGAN)
    fidelity?: number; // Fidelity for CodeFormer (0.1-1.0)
    upscale?: number; // Upscale factor for CodeFormer
  } = {}
): Promise<string> {
  console.log(`${logPrefix} Starting face enhancement`);
  console.log(`${logPrefix} Frame: ${frameUrl}`);
  console.log(`${logPrefix} Model: ${model}`);

  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error('REPLICATE_API_TOKEN environment variable is not set');
  }

  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  const modelConfig = ENHANCEMENT_MODELS[model];

  // Build input based on model
  let input: Record<string, unknown>;

  if (model === 'gfpgan') {
    input = {
      img: frameUrl,
      version: 'v1.4',
      scale: options.scale || 2,
    };
  } else {
    // CodeFormer
    input = {
      image: frameUrl,
      codeformer_fidelity: options.fidelity || 0.7,
      background_enhance: true,
      face_upsample: true,
      upscale: options.upscale || 2,
    };
  }

  console.log(`${logPrefix} Creating prediction...`);

  // Create prediction
  const prediction = await replicate.predictions.create({
    version: modelConfig.version,
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
      console.log(`${logPrefix} ✓ Face enhancement succeeded!`);
    } else if (result.status === 'failed') {
      const errorMessage = result.error || 'Unknown error';
      console.error(`${logPrefix} ✗ Face enhancement failed: ${errorMessage}`);
      throw new Error(`Face enhancement failed: ${errorMessage}`);
    } else if (result.status === 'canceled') {
      console.error(`${logPrefix} ✗ Face enhancement was canceled`);
      throw new Error('Face enhancement was canceled');
    }
  }

  if (!completed) {
    throw new Error('Face enhancement timed out');
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

  console.log(`${logPrefix} ✓ Face enhancement complete: ${outputImageUrl}`);
  return outputImageUrl;
}

/**
 * Chain face swap and enhancement
 * @param frameUrl - Original frame URL
 * @param referenceFaceUrl - Reference face URL
 * @param swapModel - Face swap model
 * @param enhanceModel - Enhancement model
 * @param enhanceOptions - Enhancement options
 * @returns URL of final enhanced frame
 */
export async function swapAndEnhanceFace(
  frameUrl: string,
  referenceFaceUrl: string,
  swapModel: 'simple' | 'advanced' = 'simple',
  enhanceModel: 'gfpgan' | 'codeformer' = 'gfpgan',
  enhanceOptions: {
    scale?: number;
    fidelity?: number;
    upscale?: number;
  } = {}
): Promise<string> {
  console.log(`${logPrefix} Starting swap + enhance pipeline`);

  // Step 1: Swap face using specified model
  const { swapFace } = await import('./face-swapper');
  const swappedUrl = await swapFace(frameUrl, referenceFaceUrl, swapModel);

  // Step 2: Enhance
  const enhancedUrl = await enhanceFace(swappedUrl, enhanceModel, enhanceOptions);

  console.log(`${logPrefix} ✓ Swap + enhance complete`);
  return enhancedUrl;
}

