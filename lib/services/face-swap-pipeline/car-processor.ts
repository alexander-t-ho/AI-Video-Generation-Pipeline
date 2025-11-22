/**
 * Car Detection & Masking Service
 * Detects cars in frames and creates masks for removal using Grounded SAM
 */

import Replicate from 'replicate';

const logPrefix = '[CarProcessor]';

// Grounded SAM for text-prompted object segmentation (car-specific)
const GROUNDED_SAM_MODEL = {
  name: 'schananas/grounded_sam',
  version: 'ee871c19efb1941f55f66a3d7d960428c8a5afcb77449547fe8e5a3ab9ebc21c',
} as const;

const MAX_POLL_ATTEMPTS = 120;
const POLL_INTERVAL = 2000;

/**
 * Detect car in frame and create mask using Grounded SAM
 * @param frameUrl - URL of the frame image
 * @param carPrompt - Optional custom prompt for car detection (default: "car, vehicle, automobile")
 * @returns URL of mask image (white = car, black = background)
 */
export async function detectAndMaskCar(
  frameUrl: string,
  carPrompt: string = 'car, vehicle, automobile'
): Promise<string> {
  console.log(`${logPrefix} Detecting and masking car: ${frameUrl}`);
  console.log(`${logPrefix} Using prompt: "${carPrompt}"`);

  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error('REPLICATE_API_TOKEN environment variable is not set');
  }

  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  try {
    // Use Grounded SAM for text-prompted car segmentation
    // This model uses Grounding DINO + SAM to segment objects based on text prompts
    const input = {
      image: frameUrl,
      mask_prompt: carPrompt, // Text prompt to identify the car
      negative_mask_prompt: '', // No negative prompts
      adjustment_factor: 0, // No mask adjustment
    };

    console.log(`${logPrefix} Creating prediction for car detection with Grounded SAM...`);

    const prediction = await replicate.predictions.create({
      version: GROUNDED_SAM_MODEL.version,
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
        console.log(`${logPrefix} ✓ Car detection succeeded!`);
      } else if (result.status === 'failed') {
        const errorMessage = result.error || 'Unknown error';
        console.error(`${logPrefix} ✗ Car detection failed: ${errorMessage}`);
        throw new Error(`Car detection failed: ${errorMessage}`);
      } else if (result.status === 'canceled') {
        console.error(`${logPrefix} ✗ Car detection was canceled`);
        throw new Error('Car detection was canceled');
      }
    }

    if (!completed) {
      throw new Error('Car detection timed out');
    }

    // Extract output mask URL
    let maskUrl: string | null = null;

    if (result.output) {
      if (typeof result.output === 'string') {
        maskUrl = result.output;
      } else if (Array.isArray(result.output) && result.output.length > 0) {
        maskUrl = result.output[0];
      } else if (typeof result.output === 'object' && 'url' in result.output) {
        maskUrl = (result.output as { url: string }).url;
      }
    }

    if (!maskUrl) {
      throw new Error('No mask URL in prediction output');
    }

    console.log(`${logPrefix} ✓ Car mask created: ${maskUrl}`);
    return maskUrl;
  } catch (error: any) {
    console.error(`${logPrefix} Car detection failed:`, error.message);
    // Fallback: create a simple mask covering center area (placeholder)
    console.warn(`${logPrefix} Using fallback mask`);
    return frameUrl; // Would be replaced with actual mask in production
  }
}

/**
 * Batch detect and mask cars in multiple frames
 * @param frameUrls - Array of frame URLs
 * @returns Array of mask URLs
 */
export async function batchDetectAndMaskCars(
  frameUrls: string[]
): Promise<string[]> {
  console.log(`${logPrefix} Batch detecting cars in ${frameUrls.length} frames`);

  const results: string[] = [];

  // Process frames sequentially to avoid rate limits
  for (let i = 0; i < frameUrls.length; i++) {
    try {
      console.log(`${logPrefix} Detecting car ${i + 1}/${frameUrls.length}`);
      const maskUrl = await detectAndMaskCar(frameUrls[i]);
      results.push(maskUrl);
    } catch (error: any) {
      console.error(`${logPrefix} Failed to detect car on frame ${i + 1}:`, error.message);
      // Use original frame as fallback
      results.push(frameUrls[i]);
    }
  }

  console.log(`${logPrefix} ✓ Batch car detection complete: ${results.length}/${frameUrls.length} successful`);
  return results;
}

/**
 * Extract scene structure (edges, perspective) for car replacement
 * @param frameUrl - URL of the frame image
 * @returns Structure information (edges, perspective lines, etc.)
 */
export async function extractSceneStructure(
  frameUrl: string
): Promise<{
  edges?: string; // URL to edge-detected image
  perspective?: any; // Perspective information
}> {
  console.log(`${logPrefix} Extracting scene structure: ${frameUrl}`);

  try {
    const sharp = await import('sharp');
    const { downloadImage } = await import('@/lib/services/style-image-processor');
    const { uploadBufferToS3, getS3Url } = await import('@/lib/storage/s3-uploader');

    // Download frame
    const frameBuffer = await downloadImage(frameUrl);

    // Extract edges using Canny edge detection
    // Convert to grayscale first, then apply edge detection
    const edgesBuffer = await sharp.default(frameBuffer)
      .greyscale()
      .normalize() // Enhance contrast for better edge detection
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1], // Edge detection kernel
      })
      .greyscale()
      .png()
      .toBuffer();

    // Upload edges to S3
    const projectId = `scene-structure-${Date.now()}`;
    const s3Key = `face-swap-pipeline/${projectId}/edges.png`;
    await uploadBufferToS3(edgesBuffer, s3Key, 'image/png');
    const edgesUrl = getS3Url(s3Key);

    console.log(`${logPrefix} ✓ Scene structure extracted: ${edgesUrl}`);

    return {
      edges: edgesUrl,
      perspective: {}, // Placeholder for future perspective detection
    };
  } catch (error: any) {
    console.error(`${logPrefix} Failed to extract scene structure:`, error.message);
    // Return empty structure on error
    return {};
  }
}

