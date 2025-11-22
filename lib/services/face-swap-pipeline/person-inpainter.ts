/**
 * Person Inpainting Service
 * Removes person and generates new person in same pose using Stable Diffusion Inpainting
 */

import Replicate from 'replicate';

const logPrefix = '[PersonInpainter]';

// Inpainting model
const INPAINTING_MODEL = {
  name: 'stability-ai/stable-diffusion-inpainting',
  // Use latest version
} as const;

const MAX_POLL_ATTEMPTS = 120;
const POLL_INTERVAL = 2000;

/**
 * Remove person and generate new person in same pose
 * @param frameUrl - URL of the frame image
 * @param maskUrl - URL of the mask (white = area to inpaint)
 * @param prompt - Prompt describing the new person
 * @param options - Inpainting options
 * @returns URL of the inpainted frame
 */
export async function inpaintPerson(
  frameUrl: string,
  maskUrl: string,
  prompt: string,
  options: {
    negativePrompt?: string;
    guidanceScale?: number;
    numInferenceSteps?: number;
    seed?: number;
  } = {}
): Promise<string> {
  console.log(`${logPrefix} Inpainting person`);
  console.log(`${logPrefix} Frame: ${frameUrl}`);
  console.log(`${logPrefix} Mask: ${maskUrl}`);
  console.log(`${logPrefix} Prompt: ${prompt}`);

  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error('REPLICATE_API_TOKEN environment variable is not set');
  }

  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  const input = {
    image: frameUrl,
    mask: maskUrl,
    prompt: prompt.trim(),
    negative_prompt: options.negativePrompt || 'blurry, distorted, low quality, artifacts',
    guidance_scale: options.guidanceScale || 7.5,
    num_inference_steps: options.numInferenceSteps || 50,
    seed: options.seed,
  };

  console.log(`${logPrefix} Creating prediction...`);

  const prediction = await replicate.predictions.create({
    model: INPAINTING_MODEL.name,
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
      console.log(`${logPrefix} ✓ Person inpainting succeeded!`);
    } else if (result.status === 'failed') {
      const errorMessage = result.error || 'Unknown error';
      console.error(`${logPrefix} ✗ Person inpainting failed: ${errorMessage}`);
      throw new Error(`Person inpainting failed: ${errorMessage}`);
    } else if (result.status === 'canceled') {
      console.error(`${logPrefix} ✗ Person inpainting was canceled`);
      throw new Error('Person inpainting was canceled');
    }
  }

  if (!completed) {
    throw new Error('Person inpainting timed out');
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

  console.log(`${logPrefix} ✓ Person inpainting complete: ${outputImageUrl}`);
  return outputImageUrl;
}

/**
 * Batch inpaint persons in multiple frames
 * @param frames - Array of objects with frameUrl, maskUrl, and prompt
 * @returns Array of inpainted frame URLs
 */
export async function batchInpaintPersons(
  frames: Array<{ frameUrl: string; maskUrl: string; prompt: string }>
): Promise<string[]> {
  console.log(`${logPrefix} Batch inpainting persons in ${frames.length} frames`);

  const results: string[] = [];

  // Process frames sequentially to avoid rate limits
  for (let i = 0; i < frames.length; i++) {
    try {
      console.log(`${logPrefix} Inpainting person ${i + 1}/${frames.length}`);
      const inpaintedUrl = await inpaintPerson(
        frames[i].frameUrl,
        frames[i].maskUrl,
        frames[i].prompt
      );
      results.push(inpaintedUrl);
    } catch (error: any) {
      console.error(`${logPrefix} Failed to inpaint person on frame ${i + 1}:`, error.message);
      // Use original frame as fallback
      results.push(frames[i].frameUrl);
    }
  }

  console.log(`${logPrefix} ✓ Batch inpainting complete: ${results.length}/${frames.length} successful`);
  return results;
}

