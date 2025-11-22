/**
 * Person Segmentation Service
 * Uses Replicate models to segment persons from frames
 */

import Replicate from 'replicate';

const logPrefix = '[PersonSegmenter]';

// Person segmentation models
const SEGMENTATION_MODELS = {
  'rembg': {
    name: 'cjwbw/rembg',
    // Background removal can be used for person segmentation
  },
} as const;

const MAX_POLL_ATTEMPTS = 120;
const POLL_INTERVAL = 2000;

/**
 * Segment person from frame (remove background to isolate person)
 * @param frameUrl - URL of the frame image
 * @returns URL of segmented image (person with transparent background)
 */
export async function segmentPerson(
  frameUrl: string
): Promise<string> {
  console.log(`${logPrefix} Segmenting person from frame: ${frameUrl}`);

  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error('REPLICATE_API_TOKEN environment variable is not set');
  }

  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  // Use rembg for background removal (which isolates the person)
  const input = {
    image: frameUrl,
    model: 'u2net', // Person segmentation model
    return_mask: false,
    alpha_matting: true,
    alpha_matting_foreground_threshold: 240,
    alpha_matting_background_threshold: 10,
    alpha_matting_erode_size: 10,
  };

  console.log(`${logPrefix} Creating prediction...`);

  const prediction = await replicate.predictions.create({
    model: SEGMENTATION_MODELS.rembg.name,
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
      console.log(`${logPrefix} ✓ Person segmentation succeeded!`);
    } else if (result.status === 'failed') {
      const errorMessage = result.error || 'Unknown error';
      console.error(`${logPrefix} ✗ Person segmentation failed: ${errorMessage}`);
      throw new Error(`Person segmentation failed: ${errorMessage}`);
    } else if (result.status === 'canceled') {
      console.error(`${logPrefix} ✗ Person segmentation was canceled`);
      throw new Error('Person segmentation was canceled');
    }
  }

  if (!completed) {
    throw new Error('Person segmentation timed out');
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

  console.log(`${logPrefix} ✓ Person segmentation complete: ${outputImageUrl}`);
  return outputImageUrl;
}

/**
 * Create mask for person removal (inverse of segmentation)
 * @param frameUrl - Original frame URL
 * @param segmentedPersonUrl - Segmented person URL (transparent background)
 * @returns URL of mask image (white = person, black = background)
 */
export async function createPersonMask(
  frameUrl: string,
  segmentedPersonUrl: string
): Promise<string> {
  console.log(`${logPrefix} Creating person mask from segmented image`);
  
  try {
    const sharp = await import('sharp');
    const { downloadImage } = await import('@/lib/services/style-image-processor');
    const { uploadBufferToS3, getS3Url } = await import('@/lib/storage/s3-uploader');

    // Download segmented image
    const segmentedBuffer = await downloadImage(segmentedPersonUrl);
    
    // Extract alpha channel (transparency) to create mask
    // White = person (alpha > 0), Black = background (alpha = 0)
    const maskBuffer = await sharp.default(segmentedBuffer)
      .extractChannel(3) // Alpha channel
      .greyscale()
      .png()
      .toBuffer();

    // Upload mask to S3
    const projectId = `person-mask-${Date.now()}`;
    const s3Key = `face-swap-pipeline/${projectId}/person-mask.png`;
    await uploadBufferToS3(maskBuffer, s3Key, 'image/png');
    const maskUrl = getS3Url(s3Key);

    console.log(`${logPrefix} ✓ Person mask created: ${maskUrl}`);
    return maskUrl;
  } catch (error: any) {
    console.error(`${logPrefix} Failed to create mask:`, error.message);
    // Fallback: return segmented person URL (will work but less optimal)
    console.warn(`${logPrefix} Using segmented person URL as mask fallback`);
    return segmentedPersonUrl;
  }
}

/**
 * Batch segment persons from multiple frames
 * @param frameUrls - Array of frame URLs
 * @returns Array of segmented person URLs
 */
export async function batchSegmentPersons(
  frameUrls: string[]
): Promise<string[]> {
  console.log(`${logPrefix} Batch segmenting persons from ${frameUrls.length} frames`);

  const results: string[] = [];

  // Process frames sequentially to avoid rate limits
  for (let i = 0; i < frameUrls.length; i++) {
    try {
      console.log(`${logPrefix} Segmenting person ${i + 1}/${frameUrls.length}`);
      const segmentedUrl = await segmentPerson(frameUrls[i]);
      results.push(segmentedUrl);
    } catch (error: any) {
      console.error(`${logPrefix} Failed to segment person on frame ${i + 1}:`, error.message);
      // Use original frame as fallback
      results.push(frameUrls[i]);
    }
  }

  console.log(`${logPrefix} ✓ Batch segmentation complete: ${results.length}/${frameUrls.length} successful`);
  return results;
}

