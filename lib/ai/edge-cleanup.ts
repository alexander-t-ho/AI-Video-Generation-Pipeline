/**
 * Edge Cleanup for Background-Removed Images
 * 
 * Removes edge artifacts and refines edges of images that have had their backgrounds removed.
 * This helps prevent visible pixels/artifacts around objects when used as reference images.
 */

import Replicate from 'replicate';
import fs from 'fs/promises';
import path from 'path';

// ============================================================================
// Constants
// ============================================================================

const REMBG_MODEL = 'cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003';
const MAX_RETRIES = 3;
const POLL_INTERVAL = 2000; // 2 seconds
const MAX_POLL_ATTEMPTS = 60; // 2 minutes max

// ============================================================================
// Replicate Client
// ============================================================================

function createReplicateClient(): Replicate {
  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) {
    throw new Error('REPLICATE_API_TOKEN environment variable is not set');
  }

  return new Replicate({
    auth: apiToken,
  });
}

// ============================================================================
// Edge Cleanup Functions
// ============================================================================

/**
 * Cleans up edges of a background-removed image by applying a second pass of background removal
 * This helps remove edge artifacts and refine the edges
 * @param imagePath Local file path to the image with background removed
 * @returns Path to the cleaned image
 */
export async function cleanupImageEdges(imagePath: string): Promise<string> {
  const logPrefix = '[EdgeCleanup]';
  
  if (!imagePath || typeof imagePath !== 'string') {
    throw new Error('Image path is required and must be a valid string');
  }

  // Check if file exists
  try {
    await fs.access(imagePath);
  } catch (error) {
    throw new Error(`Image file not found: ${imagePath}`);
  }

  console.log(`${logPrefix} Starting edge cleanup for: ${imagePath}`);

  const replicate = createReplicateClient();

  // Read image file
  let imageBuffer: Buffer;
  try {
    imageBuffer = await fs.readFile(imagePath);
  } catch (error) {
    throw new Error(`Failed to read image file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Convert buffer to base64 data URL
  const base64Image = imageBuffer.toString('base64');
  const mimeType = path.extname(imagePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
  const dataUrl = `data:${mimeType};base64,${base64Image}`;

  try {
    // Create prediction - second pass of background removal helps clean edges
    const prediction = await replicate.predictions.create({
      version: REMBG_MODEL,
      input: {
        image: dataUrl,
      },
    });

    if (!prediction.id) {
      throw new Error('Replicate API returned prediction without ID');
    }

    console.log(`${logPrefix} Prediction created: ${prediction.id}`);

    // Poll for completion
    const outputUrl = await pollEdgeCleanupStatus(prediction.id);

    // Download the cleaned image
    const cleanedImagePath = await downloadCleanedImage(
      outputUrl,
      imagePath
    );

    console.log(`${logPrefix} Edge cleanup completed: ${cleanedImagePath}`);
    return cleanedImagePath;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`${logPrefix} Edge cleanup failed: ${errorMessage}`);
    throw new Error(`Edge cleanup failed: ${errorMessage}`);
  }
}

/**
 * Polls Replicate API for prediction status
 * @param predictionId Prediction ID from Replicate
 * @returns Output URL when prediction is complete
 */
async function pollEdgeCleanupStatus(predictionId: string): Promise<string> {
  const logPrefix = '[EdgeCleanup]';
  const replicate = createReplicateClient();

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const prediction = await replicate.predictions.get(predictionId);

      if (prediction.status === 'succeeded') {
        if (typeof prediction.output === 'string') {
          return prediction.output;
        } else if (Array.isArray(prediction.output) && prediction.output.length > 0) {
          return prediction.output[0] as string;
        } else {
          throw new Error('Unexpected output format from Replicate');
        }
      } else if (prediction.status === 'failed') {
        const error = prediction.error || 'Unknown error';
        throw new Error(`Edge cleanup failed: ${error}`);
      } else if (prediction.status === 'canceled') {
        throw new Error('Edge cleanup was canceled');
      }

      // Still processing, wait and retry
      if (attempt < MAX_POLL_ATTEMPTS - 1) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        continue;
      }
    } catch (error) {
      // If it's a terminal error, throw it
      if (error instanceof Error && (
        error.message.includes('failed') ||
        error.message.includes('canceled') ||
        error.message.includes('error')
      )) {
        throw error;
      }

      // Otherwise, retry
      if (attempt < MAX_POLL_ATTEMPTS - 1) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Edge cleanup timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL / 1000} seconds`);
}

/**
 * Downloads cleaned image from URL and saves it locally
 * @param imageUrl URL of the cleaned image
 * @param originalPath Original image path (for naming)
 * @returns Path to saved cleaned image
 */
async function downloadCleanedImage(
  imageUrl: string,
  originalPath: string
): Promise<string> {
  const logPrefix = '[EdgeCleanup]';
  
  try {
    // Download image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download cleaned image: ${response.statusText}`);
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());

    // Generate output path (same directory, with -edge-cleaned suffix)
    const dir = path.dirname(originalPath);
    const ext = path.extname(originalPath);
    const basename = path.basename(originalPath, ext);
    // Remove any existing suffixes like -bg-removed
    const cleanBasename = basename.replace(/-bg-removed$/, '');
    const outputPath = path.join(dir, `${cleanBasename}-edge-cleaned${ext}`);

    // Save cleaned image
    await fs.writeFile(outputPath, imageBuffer);

    console.log(`${logPrefix} Saved cleaned image: ${outputPath}`);
    return outputPath;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to download and save cleaned image: ${errorMessage}`);
  }
}

/**
 * Cleans up edges of an image with multiple iterations
 * @param imagePath Local file path to the image with background removed
 * @param iterations Number of edge cleanup iterations (default: 1)
 * @returns Array of paths to cleaned images (one per iteration)
 */
export async function cleanupImageEdgesIterative(
  imagePath: string,
  iterations: number = 1
): Promise<string[]> {
  const logPrefix = '[EdgeCleanup]';
  const cleanedPaths: string[] = [];
  let currentImagePath = imagePath;

  console.log(`${logPrefix} Starting iterative edge cleanup (${iterations} iterations)`);

  for (let i = 0; i < iterations; i++) {
    console.log(`${logPrefix} Edge cleanup iteration ${i + 1}/${iterations}`);
    
    try {
      const cleanedPath = await cleanupImageEdges(currentImagePath);
      cleanedPaths.push(cleanedPath);
      
      // Use the cleaned image as input for next iteration
      currentImagePath = cleanedPath;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`${logPrefix} Edge cleanup iteration ${i + 1} failed: ${errorMessage}`);
      // If an iteration fails, use the last successful result (or original) for remaining iterations
      if (cleanedPaths.length > 0) {
        currentImagePath = cleanedPaths[cleanedPaths.length - 1];
      }
      // Continue with remaining iterations using the last successful result
    }
  }

  console.log(`${logPrefix} Completed ${iterations} edge cleanup iterations`);
  return cleanedPaths;
}

/**
 * Cleans up edges of multiple images
 * @param imagePaths Array of image paths to process
 * @returns Array of paths to cleaned images
 */
export async function cleanupImageEdgesBatch(imagePaths: string[]): Promise<string[]> {
  if (!Array.isArray(imagePaths)) {
    throw new Error('Image paths must be an array');
  }

  const logPrefix = '[EdgeCleanup]';
  console.log(`${logPrefix} Processing ${imagePaths.length} image(s) for edge cleanup`);

  const results: string[] = [];

  // Process images sequentially to avoid overwhelming the API
  for (let i = 0; i < imagePaths.length; i++) {
    console.log(`${logPrefix} Processing image ${i + 1}/${imagePaths.length}`);
    try {
      const result = await cleanupImageEdges(imagePaths[i]);
      results.push(result);
    } catch (error) {
      console.error(`${logPrefix} Failed to process image ${i + 1}:`, error);
      // Continue with other images even if one fails
      // Store original path as fallback
      results.push(imagePaths[i]);
    }
  }

  console.log(`${logPrefix} Completed processing ${results.length}/${imagePaths.length} image(s)`);
  return results;
}

