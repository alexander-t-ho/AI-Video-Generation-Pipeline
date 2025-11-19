/**
 * Background Removal Service
 * 
 * This module handles background removal from images using Replicate's RMBG model.
 * Includes S3 caching to avoid reprocessing the same image multiple times.
 */

import Replicate from 'replicate';
import { findBackgroundRemovedVersion, uploadProcessedImageToS3, getS3Url } from '@/lib/storage/s3-uploader';

// Use Replicate's RMBG (Remove Background) model
const RMBG_MODEL = 'lucataco/remove-bg:95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1';
const MAX_RETRIES = 3;
const POLL_INTERVAL = 2000;
const MAX_POLL_ATTEMPTS = 30;

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string;
  error?: string;
}

/**
 * Creates and configures a Replicate client
 */
function createReplicateClient(): Replicate {
  const apiToken = process.env.REPLICATE_API_TOKEN;

  if (!apiToken) {
    throw new Error('REPLICATE_API_TOKEN environment variable is not set');
  }

  return new Replicate({
    auth: apiToken,
  });
}

/**
 * Removes background from an image URL
 * @param imageUrl URL of the image to process (must be publicly accessible HTTP/HTTPS URL)
 * @param s3Key Optional S3 key of the original image (for caching)
 * @returns URL of the processed image with background removed
 */
export async function removeBackground(imageUrl: string, s3Key?: string): Promise<string> {
  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new Error('Image URL is required and must be a string');
  }

  // Validate URL format - Replicate requires HTTP/HTTPS URLs
  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
    throw new Error(`Image URL must be a public HTTP/HTTPS URL. Received: ${imageUrl.substring(0, 100)}`);
  }

  const logPrefix = '[BackgroundRemover]';
  console.log(`${logPrefix} Starting background removal`);
  console.log(`${logPrefix} Input image: ${imageUrl.substring(0, 80)}${imageUrl.length > 80 ? '...' : ''}`);

  // Check for existing processed version if we have an S3 key
  if (s3Key) {
    console.log(`${logPrefix} Checking for cached background-removed version...`);
    const existingKey = await findBackgroundRemovedVersion(s3Key);
    if (existingKey) {
      const cachedUrl = getS3Url(existingKey);
      console.log(`${logPrefix} Using cached background-removed image from S3`);
      console.log(`${logPrefix} Cached URL: ${cachedUrl.substring(0, 80)}${cachedUrl.length > 80 ? '...' : ''}`);
      return cachedUrl;
    }
    console.log(`${logPrefix} No cached version found, processing image...`);
  }

  const replicate = createReplicateClient();

  try {
    // Create prediction
    const prediction = await replicate.predictions.create({
      version: RMBG_MODEL,
      input: {
        image: imageUrl,
      },
    });

    if (!prediction.id) {
      throw new Error('Replicate API returned prediction without ID');
    }

    console.log(`${logPrefix} Prediction created: ${prediction.id}`);

    // Poll for completion
    const outputUrl = await pollForCompletion(prediction.id);
    
    console.log(`${logPrefix} Background removal completed`);
    console.log(`${logPrefix} Output image: ${outputUrl.substring(0, 80)}${outputUrl.length > 80 ? '...' : ''}`);

    // Upload to S3 if s3Key provided
    if (s3Key) {
      try {
        console.log(`${logPrefix} Uploading processed image to S3 for future caching...`);
        const processedKey = await uploadProcessedImageToS3(outputUrl, s3Key);
        const s3Url = getS3Url(processedKey);
        console.log(`${logPrefix} Processed image uploaded to S3: ${s3Url.substring(0, 80)}${s3Url.length > 80 ? '...' : ''}`);
        return s3Url;
      } catch (uploadError) {
        // If upload fails, still return the Replicate URL
        console.warn(`${logPrefix} Failed to upload to S3, returning Replicate URL:`, uploadError);
        return outputUrl;
      }
    }

    return outputUrl;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`${logPrefix} Failed to remove background:`, errorMessage);
    throw new Error(`Background removal failed: ${errorMessage}`);
  }
}

/**
 * Polls Replicate for prediction completion
 */
async function pollForCompletion(predictionId: string): Promise<string> {
  const logPrefix = '[BackgroundRemover]';
  const replicate = createReplicateClient();

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const prediction = (await replicate.predictions.get(predictionId)) as ReplicatePrediction;

      console.log(
        `${logPrefix} Poll attempt ${attempt + 1}/${MAX_POLL_ATTEMPTS}: Status = ${prediction.status}`
      );

      if (prediction.status === 'succeeded') {
        if (!prediction.output || typeof prediction.output !== 'string') {
          throw new Error('Prediction succeeded but no output URL found');
        }
        return prediction.output;
      }

      if (prediction.status === 'failed') {
        const errorMessage = prediction.error || 'Unknown error';
        throw new Error(`Prediction failed: ${errorMessage}`);
      }

      if (prediction.status === 'canceled') {
        throw new Error('Prediction was canceled');
      }

      // Status is 'starting' or 'processing', continue polling
      if (prediction.status === 'starting' || prediction.status === 'processing') {
        if (attempt < MAX_POLL_ATTEMPTS - 1) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
          continue;
        } else {
          throw new Error(
            `Prediction timeout: Status is still "${prediction.status}" after ${MAX_POLL_ATTEMPTS} attempts`
          );
        }
      }

      // Unknown status
      throw new Error(`Unknown prediction status: ${prediction.status}`);
    } catch (error) {
      // If it's a known error, throw it
      if (error instanceof Error && (
        error.message.includes('failed') ||
        error.message.includes('canceled') ||
        error.message.includes('timeout')
      )) {
        throw error;
      }

      // For other errors, retry if we have attempts left
      if (attempt < MAX_POLL_ATTEMPTS - 1) {
        console.warn(`${logPrefix} Poll error (attempt ${attempt + 1}):`, error);
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
        continue;
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to poll prediction status: ${errorMessage}`);
      }
    }
  }

  throw new Error(`Polling timeout after ${MAX_POLL_ATTEMPTS} attempts`);
}

/**
 * Removes background from multiple images
 * @param imageUrls Array of image URLs to process
 * @param s3Keys Optional array of S3 keys for caching (must match imageUrls length if provided)
 * @returns Array of URLs of processed images with backgrounds removed
 */
export async function removeBackgrounds(
  imageUrls: string[], 
  s3Keys?: string[]
): Promise<string[]> {
  if (!Array.isArray(imageUrls)) {
    throw new Error('Image URLs must be an array');
  }

  if (s3Keys && s3Keys.length !== imageUrls.length) {
    throw new Error('S3 keys array length must match imageUrls array length');
  }

  const logPrefix = '[BackgroundRemover]';
  console.log(`${logPrefix} Processing ${imageUrls.length} image(s)`);

  const results: string[] = [];

  // Process images sequentially to avoid overwhelming the API
  for (let i = 0; i < imageUrls.length; i++) {
    console.log(`${logPrefix} Processing image ${i + 1}/${imageUrls.length}`);
    try {
      const s3Key = s3Keys?.[i];
      const result = await removeBackground(imageUrls[i], s3Key);
      results.push(result);
    } catch (error) {
      console.error(`${logPrefix} Failed to process image ${i + 1}:`, error);
      // Continue with other images even if one fails
      // Store original URL as fallback
      results.push(imageUrls[i]);
    }
  }

  console.log(`${logPrefix} Completed processing ${results.length}/${imageUrls.length} image(s)`);
  return results;
}

