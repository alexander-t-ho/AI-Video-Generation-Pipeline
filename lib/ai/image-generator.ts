/**
 * Image Generator - Replicate Integration
 * 
 * This module handles image generation using Replicate's Flux-schnell model.
 * Supports both text-to-image and image-to-image generation.
 */

import { v4 as uuidv4 } from 'uuid';
import Replicate from 'replicate';
import fs from 'fs/promises';
import path from 'path';
import { GeneratedImage } from '../types';

// ============================================================================
// Constants
// ============================================================================

const REPLICATE_MODEL = 'black-forest-labs/flux-schnell';
const MAX_RETRIES = 3;
const POLL_INTERVAL = 2000; // 2 seconds
const MAX_POLL_ATTEMPTS = 15; // 30 seconds total (15 * 2s)
const DOWNLOAD_RETRIES = 3;

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

interface ReplicateInput {
  prompt: string;
  go_fast?: boolean;
  num_outputs?: number;
  aspect_ratio?: string;
  output_format?: string;
  output_quality?: number;
  image?: string; // For image-to-image
}

// ============================================================================
// Replicate Client Setup
// ============================================================================

/**
 * Creates and configures a Replicate client
 * @returns Configured Replicate client instance
 */
function createReplicateClient(): Replicate {
  const apiToken = process.env.REPLICATE_API_TOKEN;

  if (!apiToken) {
    throw new Error('REPLICATE_API_TOKEN environment variable is not set');
  }

  // Validate API token format (Replicate tokens typically start with 'r8_')
  if (!apiToken.startsWith('r8_')) {
    console.warn('[Replicate] API token format may be invalid. Expected format: r8_...');
  }

  return new Replicate({
    auth: apiToken,
  });
}

// ============================================================================
// Image Prediction Creation
// ============================================================================

/**
 * Creates an image prediction on Replicate
 * @param prompt Image generation prompt
 * @param seedImage Optional seed image URL for image-to-image generation
 * @returns Prediction ID
 */
export async function createImagePrediction(
  prompt: string,
  seedImage?: string
): Promise<string> {
  // Validate inputs
  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    throw new Error('Prompt is required and must be a non-empty string');
  }

  if (seedImage && typeof seedImage !== 'string') {
    throw new Error('Seed image must be a valid URL string if provided');
  }

  const logPrefix = '[ImageGenerator]';
  console.log(`${logPrefix} ========================================`);
  console.log(`${logPrefix} Creating image prediction`);
  console.log(`${logPrefix} Prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);
  if (seedImage) {
    console.log(`${logPrefix} Seed image: ${seedImage.substring(0, 80)}${seedImage.length > 80 ? '...' : ''}`);
    console.log(`${logPrefix} Mode: image-to-image`);
  } else {
    console.log(`${logPrefix} Mode: text-to-image`);
  }
  console.log(`${logPrefix} Timestamp: ${new Date().toISOString()}`);

  const replicate = createReplicateClient();

  // Build input parameters according to PRD
  const input: ReplicateInput = {
    prompt: prompt.trim(),
    go_fast: true, // Enable fp8 optimization for speed
    num_outputs: 1,
    aspect_ratio: '16:9',
    output_format: 'png',
    output_quality: 90,
  };

  // Add seed image if provided (for image-to-image)
  if (seedImage) {
    input.image = seedImage;
  }

  try {
    const prediction = await replicate.predictions.create({
      version: REPLICATE_MODEL,
      input,
    });

    if (!prediction.id) {
      throw new Error('Replicate API returned prediction without ID');
    }

    const logPrefix = '[ImageGenerator]';
    console.log(`${logPrefix} Prediction created successfully`);
    console.log(`${logPrefix} Prediction ID: ${prediction.id}`);
    console.log(`${logPrefix} Status: ${prediction.status}`);
    console.log(`${logPrefix} ========================================`);

    return prediction.id;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ImageGenerator] Failed to create prediction:', errorMessage);

    // Handle specific Replicate API errors
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      throw new Error('Replicate API authentication failed. Please check your REPLICATE_API_TOKEN.');
    }

    if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
      throw new Error('Replicate API rate limit exceeded. Please try again later.');
    }

    throw new Error(`Failed to create image prediction: ${errorMessage}`);
  }
}

/**
 * Retries a function with exponential backoff
 * @param fn Function to retry
 * @param maxRetries Maximum number of retries
 * @param initialDelay Initial delay in milliseconds
 * @returns Result of the function
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on authentication errors
      if (error instanceof Error && error.message.includes('authentication')) {
        throw error;
      }

      // Retry with exponential backoff
      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.log(`[ImageGenerator] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

/**
 * Creates an image prediction with retry logic
 * @param prompt Image generation prompt
 * @param seedImage Optional seed image URL
 * @returns Prediction ID
 */
export async function createImagePredictionWithRetry(
  prompt: string,
  seedImage?: string
): Promise<string> {
  return retryWithBackoff(() => createImagePrediction(prompt, seedImage));
}

// ============================================================================
// Polling Logic
// ============================================================================

/**
 * Polls Replicate for prediction status
 * @param predictionId Replicate prediction ID
 * @returns Image URL when prediction succeeds
 */
export async function pollReplicateStatus(predictionId: string): Promise<string> {
  if (!predictionId || typeof predictionId !== 'string') {
    throw new Error('Prediction ID is required and must be a string');
  }

  const logPrefix = '[ImageGenerator]';
  console.log(`${logPrefix} Starting to poll prediction status`);
  console.log(`${logPrefix} Prediction ID: ${predictionId}`);
  console.log(`${logPrefix} Max attempts: ${MAX_POLL_ATTEMPTS} (${MAX_POLL_ATTEMPTS * POLL_INTERVAL / 1000}s total)`);

  const replicate = createReplicateClient();

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const prediction = (await replicate.predictions.get(predictionId)) as ReplicatePrediction;

      console.log(
        `[ImageGenerator] Poll attempt ${attempt + 1}/${MAX_POLL_ATTEMPTS}: Status = ${prediction.status}`
      );

      // Handle different status types
      if (prediction.status === 'succeeded') {
        // Extract output URL
        let imageUrl: string;

        if (typeof prediction.output === 'string') {
          imageUrl = prediction.output;
        } else if (Array.isArray(prediction.output) && prediction.output.length > 0) {
          imageUrl = prediction.output[0];
        } else {
          throw new Error('Prediction succeeded but no output URL found');
        }

        if (!imageUrl || typeof imageUrl !== 'string') {
          throw new Error('Invalid output URL from Replicate');
        }

        const logPrefix = '[ImageGenerator]';
        console.log(`${logPrefix} Prediction succeeded!`);
        console.log(`${logPrefix} Image URL: ${imageUrl}`);
        console.log(`${logPrefix} Completed in ${attempt + 1} poll attempts (${(attempt + 1) * POLL_INTERVAL / 1000}s)`);
        console.log(`${logPrefix} ========================================`);
        return imageUrl;
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
      if (error instanceof Error && error.message.includes('failed')) {
        throw error;
      }
      if (error instanceof Error && error.message.includes('canceled')) {
        throw error;
      }
      if (error instanceof Error && error.message.includes('timeout')) {
        throw error;
      }

      // For other errors, retry if we have attempts left
      if (attempt < MAX_POLL_ATTEMPTS - 1) {
        console.warn(`[ImageGenerator] Poll error (attempt ${attempt + 1}):`, error);
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
        continue;
      } else {
        // Last attempt failed
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to poll prediction status: ${errorMessage}`);
      }
    }
  }

  throw new Error(`Polling timeout after ${MAX_POLL_ATTEMPTS} attempts`);
}

// ============================================================================
// Image Download & Save
// ============================================================================

/**
 * Downloads an image from a URL and saves it to the local filesystem
 * @param imageUrl URL of the image to download
 * @param projectId Project ID for file organization
 * @param sceneIndex Scene index (0-4)
 * @returns GeneratedImage object
 */
export async function downloadAndSaveImage(
  imageUrl: string,
  projectId: string,
  sceneIndex: number
): Promise<GeneratedImage> {
  // Validate inputs
  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new Error('Image URL is required and must be a string');
  }

  if (!projectId || typeof projectId !== 'string') {
    throw new Error('Project ID is required and must be a string');
  }

  if (typeof sceneIndex !== 'number' || sceneIndex < 0 || sceneIndex > 4) {
    throw new Error('Scene index must be a number between 0 and 4');
  }

  const logPrefix = '[ImageGenerator]';
  console.log(`${logPrefix} ========================================`);
  console.log(`${logPrefix} Starting image download and save`);
  console.log(`${logPrefix} Image URL: ${imageUrl.substring(0, 80)}${imageUrl.length > 80 ? '...' : ''}`);
  console.log(`${logPrefix} Project ID: ${projectId}`);
  console.log(`${logPrefix} Scene index: ${sceneIndex}`);

  // Generate image ID
  const imageId = uuidv4();

  // Build file path: /tmp/projects/{projectId}/images/scene-{sceneIndex}-{imageId}.png
  const projectDir = path.join('/tmp', 'projects', projectId);
  const imagesDir = path.join(projectDir, 'images');
  const filename = `scene-${sceneIndex}-${imageId}.png`;
  const filePath = path.join(imagesDir, filename);

  // Create directories if they don't exist
  try {
    await fs.mkdir(imagesDir, { recursive: true });
    console.log(`[ImageGenerator] Created directory: ${imagesDir}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to create directory ${imagesDir}: ${errorMessage}`);
  }

  // Download image with retry logic
  let imageBuffer: Buffer;
  let downloadAttempt = 0;

  while (downloadAttempt < DOWNLOAD_RETRIES) {
    try {
      console.log(`[ImageGenerator] Download attempt ${downloadAttempt + 1}/${DOWNLOAD_RETRIES}`);

      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Validate content type
      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.startsWith('image/')) {
        console.warn(`[ImageGenerator] Unexpected content type: ${contentType}`);
      }

      imageBuffer = Buffer.from(await response.arrayBuffer());

      // Validate file size (should be > 0)
      if (imageBuffer.length === 0) {
        throw new Error('Downloaded image is empty');
      }

      // Validate it's a valid image by checking PNG header
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const fileHeader = imageBuffer.slice(0, 8);
      if (!fileHeader.equals(pngHeader)) {
        console.warn('[ImageGenerator] File may not be a valid PNG (header check failed)');
      }

      break; // Success, exit retry loop
    } catch (error) {
      downloadAttempt++;
      if (downloadAttempt >= DOWNLOAD_RETRIES) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to download image after ${DOWNLOAD_RETRIES} attempts: ${errorMessage}`);
      }

      // Wait before retry
      const delay = 1000 * downloadAttempt; // Exponential backoff
      console.log(`[ImageGenerator] Download failed, retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Save image to filesystem
  try {
    await fs.writeFile(filePath, imageBuffer!);
    const logPrefix = '[ImageGenerator]';
    console.log(`${logPrefix} Image saved successfully`);
    console.log(`${logPrefix} File path: ${filePath}`);

    // Verify file was written
    const stats = await fs.stat(filePath);
    if (stats.size === 0) {
      throw new Error('Saved image file is empty');
    }

    console.log(`${logPrefix} File size: ${stats.size} bytes (${(stats.size / 1024).toFixed(2)} KB)`);
    console.log(`${logPrefix} Image ID: ${imageId}`);
    console.log(`${logPrefix} ========================================`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to save image to ${filePath}: ${errorMessage}`);
  }

  // Create GeneratedImage object
  const generatedImage: GeneratedImage = {
    id: imageId,
    url: filePath, // Absolute path for internal use (same as localPath)
    localPath: filePath, // Full absolute path
    prompt: '', // Will be set by caller
    replicateId: '', // Will be set by caller
    createdAt: new Date().toISOString(),
  };

  return generatedImage;
}

/**
 * Downloads and saves an image with retry logic
 * @param imageUrl URL of the image to download
 * @param projectId Project ID for file organization
 * @param sceneIndex Scene index (0-4)
 * @returns GeneratedImage object
 */
export async function downloadAndSaveImageWithRetry(
  imageUrl: string,
  projectId: string,
  sceneIndex: number
): Promise<GeneratedImage> {
  return retryWithBackoff(
    () => downloadAndSaveImage(imageUrl, projectId, sceneIndex),
    DOWNLOAD_RETRIES
  );
}

// ============================================================================
// Complete Image Generation Flow
// ============================================================================

/**
 * Complete image generation flow: create prediction → poll → download → save
 * @param prompt Image generation prompt
 * @param projectId Project ID for file organization
 * @param sceneIndex Scene index (0-4)
 * @param seedImage Optional seed image URL for image-to-image generation
 * @returns GeneratedImage object
 */
export async function generateImage(
  prompt: string,
  projectId: string,
  sceneIndex: number,
  seedImage?: string
): Promise<GeneratedImage> {
  const logPrefix = '[ImageGenerator]';
  console.log(`${logPrefix} ========================================`);
  console.log(`${logPrefix} Starting complete image generation flow`);
  console.log(`${logPrefix} Prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);
  console.log(`${logPrefix} Project ID: ${projectId}`);
  console.log(`${logPrefix} Scene index: ${sceneIndex}`);
  if (seedImage) {
    console.log(`${logPrefix} Using seed image for image-to-image generation`);
  }
  const flowStartTime = Date.now();

  try {
    // Step 1: Create prediction
    const predictionId = await createImagePredictionWithRetry(prompt, seedImage);
    const step1Time = Date.now();
    console.log(`${logPrefix} Step 1/3 completed in ${step1Time - flowStartTime}ms: Prediction created (ID: ${predictionId})`);

    // Step 2: Poll for completion
    const imageUrl = await pollReplicateStatus(predictionId);
    const step2Time = Date.now();
    console.log(`${logPrefix} Step 2/3 completed in ${step2Time - step1Time}ms: Prediction finished`);

    // Step 3: Download and save
    const generatedImage = await downloadAndSaveImageWithRetry(imageUrl, projectId, sceneIndex);
    const step3Time = Date.now();
    console.log(`${logPrefix} Step 3/3 completed in ${step3Time - step2Time}ms: Image saved`);

    // Set prompt and replicateId in the returned object
    generatedImage.prompt = prompt;
    generatedImage.replicateId = predictionId;

    const totalTime = Date.now() - flowStartTime;
    console.log(`${logPrefix} Complete flow finished in ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
    console.log(`${logPrefix} Final image path: ${generatedImage.localPath}`);
    console.log(`${logPrefix} ========================================`);

    return generatedImage;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ImageGenerator] Generation failed: ${errorMessage}`);
    throw error;
  }
}

// ============================================================================
// Error Handling Helpers
// ============================================================================

/**
 * Creates a user-friendly error message from technical error
 * @param error Error object
 * @returns User-friendly error message
 */
export function getUserFriendlyErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'An unexpected error occurred. Please try again.';
  }

  const errorMessage = error.message.toLowerCase();

  // User-friendly error messages
  if (errorMessage.includes('rate limit')) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  if (errorMessage.includes('authentication') || errorMessage.includes('api token')) {
    return 'API authentication failed. Please contact support.';
  }

  if (errorMessage.includes('network') || errorMessage.includes('connection') || errorMessage.includes('timeout')) {
    return 'Network error. Please check your connection and try again.';
  }

  if (errorMessage.includes('prediction timeout') || errorMessage.includes('polling timeout')) {
    return 'Image generation took too long. Please try again.';
  }

  if (errorMessage.includes('download') || errorMessage.includes('save')) {
    return 'Failed to save image. Please try again.';
  }

  if (errorMessage.includes('required') || errorMessage.includes('invalid')) {
    return 'Invalid request. Please check your input and try again.';
  }

  if (errorMessage.includes('canceled')) {
    return 'Image generation was canceled.';
  }

  // Default: return original message but make it more user-friendly
  return error.message || 'Failed to generate image. Please try again.';
}

/**
 * Determines the error code from an error
 * @param error Error object
 * @returns Error code
 */
export function getErrorCode(error: unknown): 'INVALID_REQUEST' | 'PREDICTION_FAILED' | 'POLLING_FAILED' | 'RATE_LIMIT' | 'AUTHENTICATION_FAILED' | 'NETWORK_ERROR' | 'TIMEOUT' | 'DOWNLOAD_FAILED' {
  if (!(error instanceof Error)) {
    return 'PREDICTION_FAILED';
  }

  const errorMessage = error.message.toLowerCase();

  if (errorMessage.includes('rate limit')) {
    return 'RATE_LIMIT';
  }

  if (errorMessage.includes('authentication') || errorMessage.includes('api token')) {
    return 'AUTHENTICATION_FAILED';
  }

  if (errorMessage.includes('network') || errorMessage.includes('connection')) {
    return 'NETWORK_ERROR';
  }

  if (errorMessage.includes('timeout') || errorMessage.includes('polling timeout')) {
    return 'TIMEOUT';
  }

  if (errorMessage.includes('download') || errorMessage.includes('save')) {
    return 'DOWNLOAD_FAILED';
  }

  if (errorMessage.includes('polling') || errorMessage.includes('status')) {
    return 'POLLING_FAILED';
  }

  if (errorMessage.includes('required') || errorMessage.includes('invalid')) {
    return 'INVALID_REQUEST';
  }

  return 'PREDICTION_FAILED';
}

/**
 * Determines if an error is retryable
 * @param error Error object
 * @returns True if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorMessage = error.message.toLowerCase();

  // Retryable errors
  const retryablePatterns = [
    'rate limit',
    'timeout',
    'network',
    'connection',
    'temporary',
    'service unavailable',
    'internal server error',
    'polling timeout',
    'download',
  ];

  // Non-retryable errors
  const nonRetryablePatterns = [
    'authentication',
    'unauthorized',
    'invalid',
    'required',
    'canceled',
  ];

  // Check for non-retryable first
  if (nonRetryablePatterns.some((pattern) => errorMessage.includes(pattern))) {
    return false;
  }

  // Check for retryable
  return retryablePatterns.some((pattern) => errorMessage.includes(pattern));
}

