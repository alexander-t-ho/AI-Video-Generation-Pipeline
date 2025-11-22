/**
 * Car Inpainting Service
 * Removes car and generates replacement car matching scene perspective
 */

import Replicate from 'replicate';

const logPrefix = '[CarInpainter]';

// Standard inpainting model (without ControlNet)
const INPAINTING_MODEL = {
  name: 'stability-ai/stable-diffusion-inpainting',
  version: '95b7223104132402a9ae91cc677285bc5eb997834bd2349fa486f53910fd68b3',
} as const;

// ControlNet inpainting model (for structure preservation with Canny edges)
const CONTROLNET_INPAINT_MODEL = {
  name: 'fermatresearch/flux-controlnet-inpaint',
  version: '46ae77d1d148dca1bd61c1215e99ee692c4cf01289a2bba681b14a58c04bda8f',
} as const;

const MAX_POLL_ATTEMPTS = 120;
const POLL_INTERVAL = 2000;

/**
 * Remove car and generate replacement car
 * @param frameUrl - URL of the frame image
 * @param maskUrl - URL of the mask (white = car area to replace)
 * @param prompt - Prompt describing the replacement car
 * @param options - Inpainting options
 * @returns URL of the inpainted frame
 */
export async function inpaintCar(
  frameUrl: string,
  maskUrl: string,
  prompt: string,
  options: {
    useControlNet?: boolean;
    controlImageUrl?: string; // Canny edges or structure image
    negativePrompt?: string;
    guidanceScale?: number;
    numInferenceSteps?: number;
    seed?: number;
  } = {}
): Promise<string> {
  console.log(`${logPrefix} Inpainting car`);
  console.log(`${logPrefix} Frame: ${frameUrl}`);
  console.log(`${logPrefix} Mask: ${maskUrl}`);
  console.log(`${logPrefix} Prompt: ${prompt}`);

  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error('REPLICATE_API_TOKEN environment variable is not set');
  }

  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  // Build input based on whether ControlNet is used
  let input: Record<string, unknown>;
  let modelVersion: string;

  if (options.useControlNet && options.controlImageUrl) {
    // Use Flux ControlNet Inpainting for structure preservation
    // This model supports image, mask, and control_image together
    input = {
      image: frameUrl,
      mask: maskUrl,
      control_image: options.controlImageUrl, // Canny edges
      prompt: prompt.trim(),
      conditioning_scale: 0.4, // Canny works best at 0.4
      strength: 0.8,
      guidance_scale: options.guidanceScale || 3.5,
      num_inference_steps: options.numInferenceSteps || 8,
      enable_hyper_flux_8_step: true,
      output_format: 'png',
      seed: options.seed,
    };
    modelVersion = CONTROLNET_INPAINT_MODEL.version;

    console.log(`${logPrefix} Using Flux ControlNet Inpainting for structure preservation`);
  } else {
    // Standard inpainting without ControlNet
    input = {
      image: frameUrl,
      mask: maskUrl,
      prompt: prompt.trim(),
      negative_prompt: options.negativePrompt || 'blurry, distorted, low quality, artifacts, wrong perspective',
      guidance_scale: options.guidanceScale || 7.5,
      num_inference_steps: options.numInferenceSteps || 50,
      seed: options.seed,
    };
    modelVersion = INPAINTING_MODEL.version;

    console.log(`${logPrefix} Using standard SD inpainting...`);
  }

  console.log(`${logPrefix} Creating prediction...`);

  const prediction = await replicate.predictions.create({
    version: modelVersion,
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
      console.log(`${logPrefix} ✓ Car inpainting succeeded!`);
    } else if (result.status === 'failed') {
      const errorMessage = result.error || 'Unknown error';
      console.error(`${logPrefix} ✗ Car inpainting failed: ${errorMessage}`);
      throw new Error(`Car inpainting failed: ${errorMessage}`);
    } else if (result.status === 'canceled') {
      console.error(`${logPrefix} ✗ Car inpainting was canceled`);
      throw new Error('Car inpainting was canceled');
    }
  }

  if (!completed) {
    throw new Error('Car inpainting timed out');
  }

  // Extract output
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

  console.log(`${logPrefix} ✓ Car inpainting complete: ${outputImageUrl}`);
  return outputImageUrl;
}

/**
 * Batch inpaint cars in multiple frames
 * @param frames - Array of objects with frameUrl, maskUrl, prompt, and options
 * @returns Array of inpainted frame URLs
 */
export async function batchInpaintCars(
  frames: Array<{
    frameUrl: string;
    maskUrl: string;
    prompt: string;
    useControlNet?: boolean;
    controlImageUrl?: string;
  }>
): Promise<string[]> {
  console.log(`${logPrefix} Batch inpainting cars in ${frames.length} frames`);

  const results: string[] = [];

  // Process frames sequentially to avoid rate limits
  for (let i = 0; i < frames.length; i++) {
    try {
      console.log(`${logPrefix} Inpainting car ${i + 1}/${frames.length}`);
      const inpaintedUrl = await inpaintCar(
        frames[i].frameUrl,
        frames[i].maskUrl,
        frames[i].prompt,
        {
          useControlNet: frames[i].useControlNet,
          controlImageUrl: frames[i].controlImageUrl,
        }
      );
      results.push(inpaintedUrl);
    } catch (error: any) {
      console.error(`${logPrefix} Failed to inpaint car on frame ${i + 1}:`, error.message);
      // Use original frame as fallback
      results.push(frames[i].frameUrl);
    }
  }

  console.log(`${logPrefix} ✓ Batch car inpainting complete: ${results.length}/${frames.length} successful`);
  return results;
}

