/**
 * Background Removal Service - Replicate Integration
 * 
 * Removes backgrounds from images using Replicate's rembg model.
 * Supports multiple iterations for improved quality.
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
// Types
// ============================================================================

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
  created_at?: string;
  completed_at?: string;
}

// ============================================================================
// Replicate Client Setup (OPTIMIZED: Singleton Pattern)
// ============================================================================

let replicateClientInstance: Replicate | null = null;

/**
 * Gets or creates a Replicate client (singleton pattern)
 * OPTIMIZATION: Reuses client instance to avoid recreation overhead
 * @returns Configured Replicate client instance
 */
function getReplicateClient(): Replicate {
  if (!replicateClientInstance) {
    const apiToken = process.env.REPLICATE_API_TOKEN;

    if (!apiToken) {
      throw new Error('REPLICATE_API_TOKEN environment variable is not set');
    }

    replicateClientInstance = new Replicate({
      auth: apiToken,
    });
  }

  return replicateClientInstance;
}

// ============================================================================
// Background Removal Functions
// ============================================================================

/**
 * Removes background from an image using Replicate rembg model
 * @param imagePath Local file path to the image
 * @returns Path to the processed image with transparent background
 */
export async function removeBackground(
  imagePath: string
): Promise<string> {
  const logPrefix = '[BackgroundRemover]';
  
  if (!imagePath || typeof imagePath !== 'string') {
    throw new Error('Image path is required and must be a valid string');
  }

  console.log(`${logPrefix} Starting background removal for: ${imagePath}`);

  const replicate = getReplicateClient(); // OPTIMIZED: Use singleton

  // OPTIMIZED: Read file once, no redundant access() call
  let imageBuffer: Buffer;
  try {
    const { imageCache } = await import('@/lib/storage/cache');

    // Check cache first
    const cached = imageCache.get(imagePath);
    if (cached) {
      imageBuffer = cached.buffer;
    } else {
      imageBuffer = await fs.readFile(imagePath);
      const mimeType = path.extname(imagePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
      imageCache.set(imagePath, imageBuffer, mimeType);
    }
  } catch (error) {
    // Handle both "file not found" and other read errors
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Image file not found: ${imagePath}`);
    }
    throw new Error(`Failed to read image file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Create a file-like object for Replicate
  // Replicate accepts File, Blob, or URL
  // For local files, we need to convert to a format Replicate can use
  // We'll use a data URL or upload to a temporary public URL
  // For now, let's use the file path if it's accessible, or convert to base64
  
  // Convert buffer to base64 data URL
  const base64Image = imageBuffer.toString('base64');
  const mimeType = path.extname(imagePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
  const dataUrl = `data:${mimeType};base64,${base64Image}`;

  try {
    // Create prediction
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
    const outputUrl = await pollBackgroundRemovalStatus(prediction.id);

    // Download the processed image
    const processedImagePath = await downloadProcessedImage(
      outputUrl,
      imagePath
    );

    console.log(`${logPrefix} Background removal completed: ${processedImagePath}`);
    return processedImagePath;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`${logPrefix} Background removal failed: ${errorMessage}`);
    throw new Error(`Background removal failed: ${errorMessage}`);
  }
}

/**
 * Polls Replicate API for prediction status
 * @param predictionId Prediction ID from Replicate
 * @returns Output URL when prediction is complete
 */
async function pollBackgroundRemovalStatus(predictionId: string): Promise<string> {
  const logPrefix = '[BackgroundRemover]';
  const replicate = getReplicateClient(); // OPTIMIZED: Use singleton

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const prediction = await replicate.predictions.get(predictionId);

      if (prediction.status === 'succeeded') {
        if (prediction.output) {
          // Output is typically a URL string
          const outputUrl = Array.isArray(prediction.output) 
            ? prediction.output[0] 
            : prediction.output;
          
          if (typeof outputUrl === 'string' && outputUrl.startsWith('http')) {
            console.log(`${logPrefix} Prediction succeeded: ${outputUrl}`);
            return outputUrl;
          } else {
            throw new Error(`Invalid output format: ${typeof outputUrl}`);
          }
        } else {
          throw new Error('Prediction succeeded but no output URL returned');
        }
      } else if (prediction.status === 'failed') {
        const errorMsg = prediction.error || 'Unknown error';
        throw new Error(`Prediction failed: ${errorMsg}`);
      } else if (prediction.status === 'canceled') {
        throw new Error('Prediction was canceled');
      }

      // Still processing, wait and retry
      if (attempt < MAX_POLL_ATTEMPTS - 1) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('failed')) {
        throw error;
      }
      // Retry on network errors
      if (attempt < MAX_POLL_ATTEMPTS - 1) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Background removal timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL / 1000} seconds`);
}

/**
 * Downloads processed image from URL and saves it locally
 * @param imageUrl URL of the processed image
 * @param originalPath Original image path (for naming)
 * @returns Path to saved processed image
 */
async function downloadProcessedImage(
  imageUrl: string,
  originalPath: string
): Promise<string> {
  const logPrefix = '[BackgroundRemover]';
  
  try {
    // Download image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download processed image: ${response.statusText}`);
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());

    // Generate output path (same directory, with -bg-removed suffix)
    const dir = path.dirname(originalPath);
    const ext = path.extname(originalPath);
    const basename = path.basename(originalPath, ext);
    const outputPath = path.join(dir, `${basename}-bg-removed${ext}`);

    // Save processed image
    await fs.writeFile(outputPath, imageBuffer);

    console.log(`${logPrefix} Saved processed image: ${outputPath}`);
    return outputPath;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to download and save processed image: ${errorMessage}`);
  }
}

/**
 * Removes background from an image with retry logic
 * @param imagePath Local file path to the image
 * @param retries Number of retry attempts
 * @returns Path to the processed image
 */
export async function removeBackgroundWithRetry(
  imagePath: string,
  retries: number = MAX_RETRIES
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await removeBackground(imagePath);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.warn(`[BackgroundRemover] Attempt ${attempt + 1}/${retries} failed: ${lastError.message}`);
      
      if (attempt < retries - 1) {
        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Background removal failed after all retries');
}

/**
 * Processes an image through multiple iterations of background removal
 * @param imagePath Local file path to the image
 * @param iterations Number of iterations (default: 2)
 * @returns Array of paths to processed images (one per iteration)
 */
export async function removeBackgroundIterative(
  imagePath: string,
  iterations: number = 2
): Promise<string[]> {
  const logPrefix = '[BackgroundRemover]';
  const processedPaths: string[] = [];
  let currentImagePath = imagePath;

  console.log(`${logPrefix} Starting iterative background removal (${iterations} iterations)`);

  for (let i = 0; i < iterations; i++) {
    console.log(`${logPrefix} Iteration ${i + 1}/${iterations}`);
    
    try {
      const processedPath = await removeBackgroundWithRetry(currentImagePath);
      processedPaths.push(processedPath);
      
      // Use the processed image as input for next iteration
      currentImagePath = processedPath;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`${logPrefix} Iteration ${i + 1} failed: ${errorMessage}`);
      throw new Error(`Background removal iteration ${i + 1} failed: ${errorMessage}`);
    }
  }

  console.log(`${logPrefix} Completed ${iterations} iterations`);
  return processedPaths;
}

// ============================================================================
// Export for Testing
// ============================================================================

/**
 * Resets the singleton Replicate client (useful for testing)
 * OPTIMIZATION: Allows proper unit testing of singleton pattern
 */
export function resetReplicateClient(): void {
  replicateClientInstance = null;
}

