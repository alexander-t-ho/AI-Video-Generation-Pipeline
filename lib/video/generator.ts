/**
 * Video Generator - Replicate wan-video Integration
 * 
 * This module handles video generation using Replicate's wan-video/wan-2.5-i2v-fast model.
 * Supports both image-to-video (Scene 0) and image-to-video with seed frames (Scene 1-4).
 */

import Replicate from 'replicate';
import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import http from 'http';

import { VIDEO_CONFIG } from '@/lib/config/ai-models';
import { enhanceVideoPrompt } from '@/lib/utils/video-prompt-enhancer';

// ============================================================================
// Constants
// ============================================================================

let REPLICATE_MODEL = VIDEO_CONFIG.model; // Default model, can be overridden
const MAX_RETRIES = VIDEO_CONFIG.maxRetries;
const POLL_INTERVAL = VIDEO_CONFIG.pollInterval;
const MAX_POLL_ATTEMPTS = VIDEO_CONFIG.maxPollAttempts;
const DOWNLOAD_RETRIES = VIDEO_CONFIG.downloadRetries;
const VIDEO_DURATION = VIDEO_CONFIG.duration;
const VIDEO_RESOLUTION = VIDEO_CONFIG.resolution;

/**
 * Sets the runtime model override for video generation
 * This allows the dev panel to dynamically change the model
 */
export function setRuntimeVideoModel(model: string) {
  REPLICATE_MODEL = model;
  console.log(`[Video Generator] Runtime model set to: ${model}`);
}

// ============================================================================
// Types
// ============================================================================

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: any; // WAN model returns an object with .url() method
  error?: string;
  created_at?: string;
  completed_at?: string;
}

interface ReplicateInput {
  image?: string; // Required for image-to-video models: URL or Base64 string of the input image
  video?: string; // Required for Gen-4 Aleph: URL of the input video
  prompt: string; // Required: Text prompt guiding the video generation
  duration?: number; // Optional: Duration of the generated video in seconds
  resolution?: string; // Optional: Video resolution (e.g., '720p')
  aspect_ratio?: string; // Optional: Aspect ratio for Gen-4 models (e.g., '16:9')
  negative_prompt?: string; // Optional: Text to specify elements to avoid
  enable_prompt_expansion?: boolean; // Optional: Enable prompt optimization (WAN models)
  seed?: number; // Optional: Random seed for reproducible generation
  reference_images?: string[]; // Optional: Reference images for Gen-4 (for character/object consistency)
  [key: string]: any; // Allow additional model-specific parameters
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
    console.warn('[VideoGenerator] API token format may be invalid. Expected format: r8_...');
  }

  return new Replicate({
    auth: apiToken,
  });
}

// ============================================================================
// Duration Validation
// ============================================================================

/**
 * Validates and adjusts duration based on model requirements
 * Rounds UP to the next acceptable duration (never rounds down)
 * @param duration Requested duration in seconds
 * @param model Model identifier
 * @returns Valid duration for the model (rounded up)
 */
function validateAndAdjustDuration(duration: number, model: string): number {
  // Google Veo 3.1 Fast only accepts 4, 6, or 8 seconds
  if (model.includes('veo-3.1-fast') || model.includes('google/veo-3.1-fast')) {
    const validDurations = [4, 6, 8];
    // Find the next valid duration that is >= requested duration (round UP)
    const adjusted = validDurations.find(d => d >= duration) || validDurations[validDurations.length - 1];
    if (adjusted !== duration) {
      console.log(`[VideoGenerator] Rounded duration UP from ${duration}s to ${adjusted}s for ${model}`);
    }
    return adjusted;
  }

  // Google Veo 3.1 (non-fast) may have different requirements
  // Add other model-specific validations here as needed
  
  return duration;
}

// ============================================================================
// Video Prediction Creation
// ============================================================================

/**
 * Creates a video prediction on Replicate
 * @param imageUrl Image URL to use as starting frame
 * @param prompt Text description of desired motion/action
 * @param seedFrame Optional seed frame URL (for Scene 1-4)
 * @param duration Optional duration in seconds (will be rounded up to model-acceptable values)
 * @returns Prediction ID
 */
export async function createVideoPrediction(
  imageUrl: string,
  prompt: string,
  seedFrame?: string,
  duration?: number
): Promise<string> {
  // Validate inputs
  if (!imageUrl || typeof imageUrl !== 'string' || imageUrl.trim() === '') {
    throw new Error('Image URL is required and must be a non-empty string');
  }

  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    throw new Error('Prompt is required and must be a non-empty string');
  }

  const logPrefix = '[VideoGenerator]';
  const timestamp = new Date().toISOString();
  console.log(`${logPrefix} ========================================`);
  console.log(`${logPrefix} Creating video prediction`);
  console.log(`${logPrefix} Timestamp: ${timestamp}`);
  console.log(`${logPrefix} Model: ${REPLICATE_MODEL}`);
  console.log(`${logPrefix} Original Prompt: "${prompt}"`);
  
  // Enhance the prompt for video generation (especially for automotive content)
  const { enhancedPrompt, negativePrompt } = enhanceVideoPrompt(prompt, {
    ensureHeadlights: true,
    ensureCorrectWheelRotation: true,
    addMotionDetails: true,
    useNegativePrompt: true,
  });
  
  console.log(`${logPrefix} Enhanced Prompt: "${enhancedPrompt}"`);
  if (negativePrompt) {
    console.log(`${logPrefix} Negative Prompt: "${negativePrompt}"`);
  }
  
  console.log(`${logPrefix} Inputs:`);
  console.log(`${logPrefix}   - Image URL: ${imageUrl}`);
  if (seedFrame) {
    console.log(`${logPrefix}   - Seed Frame: ${seedFrame}`);
    console.log(`${logPrefix}   - Mode: image-to-video with seed frame`);
  } else {
    console.log(`${logPrefix}   - Mode: image-to-video (Scene 0)`);
  }
  // Use provided duration or fall back to default, then validate and adjust
  const requestedDuration = duration || VIDEO_DURATION;
  const validatedDuration = validateAndAdjustDuration(requestedDuration, REPLICATE_MODEL);
  console.log(`${logPrefix} Settings:`);
  console.log(`${logPrefix}   - Duration: ${validatedDuration}s${validatedDuration !== requestedDuration ? ` (rounded up from ${requestedDuration}s)` : ''}`);
  console.log(`${logPrefix}   - Resolution: ${VIDEO_RESOLUTION}`);

  const replicate = createReplicateClient();

  // Build input parameters
  // For Scene 0: use imageUrl directly
  // For Scene 1-4: use seedFrame if provided, otherwise use imageUrl
  const inputImageUrl = seedFrame || imageUrl;

  // Model-specific parameter handling
  // Gen-4 models may have different parameter names/requirements than WAN models
  const isGen4 = REPLICATE_MODEL.includes('gen4');
  const isGen4Aleph = REPLICATE_MODEL.includes('gen4-aleph');
  
  // Gen-4 Aleph requires 'video' input, not 'image'
  // Gen-4 Turbo uses 'image' input
  // For Scene 0 (first scene), we should use Gen-4 Turbo, not Aleph
  // If Aleph is selected for Scene 0, we need to handle it differently
  if (isGen4Aleph && !seedFrame) {
    // Gen-4 Aleph requires video input, but we only have an image for Scene 0
    // This is a configuration error - Gen-4 Aleph should not be used for Scene 0
    throw new Error('Gen-4 Aleph requires a video input. Use Gen-4 Turbo or another image-to-video model for Scene 0.');
  }
  
  const input: ReplicateInput = {
    // Gen-4 Aleph uses 'video', others use 'image'
    ...(isGen4Aleph ? {
      video: inputImageUrl, // For Gen-4 Aleph, this should be a video URL
    } : {
      image: inputImageUrl,
    }),
    prompt: enhancedPrompt.trim(),
    // Add negative prompt if available
    ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
    // WAN models use 'duration' and 'resolution'
    // Gen-4 models may use different parameters - adjust if needed
    ...(isGen4 ? {
      // Gen-4 specific parameters (adjust based on actual API requirements)
      // Note: Gen-4 Turbo uses 'duration' and 'aspect_ratio' (not 'resolution')
      // Gen-4 Aleph may have different requirements
      ...(isGen4Aleph ? {
        // Gen-4 Aleph parameters (video editing/transformation)
        aspect_ratio: VIDEO_RESOLUTION === '720p' ? '16:9' : VIDEO_RESOLUTION === '1080p' ? '16:9' : '16:9',
      } : {
        // Gen-4 Turbo parameters (image-to-video)
        duration: validatedDuration,
        aspect_ratio: VIDEO_RESOLUTION === '720p' ? '16:9' : VIDEO_RESOLUTION === '1080p' ? '16:9' : '16:9',
      }),
    } : {
      // WAN model parameters
      duration: validatedDuration,
      resolution: VIDEO_RESOLUTION,
      enable_prompt_expansion: true, // WAN-specific: Enable prompt optimization
    }),
  };

  try {
    // Replicate SDK accepts either:
    // 1. version: "owner/model:hash" (full format) - preferred when version hash is provided
    // 2. model: "owner/model" (uses latest version)
    // When a version hash is included, use the 'version' parameter directly
    let predictionParams: any;
    
    if (REPLICATE_MODEL.includes(':')) {
      // Format: "owner/model:hash" - use version parameter
      predictionParams = {
        version: REPLICATE_MODEL,
        input,
      };
    } else {
      // Format: "owner/model" - use model parameter (uses latest version)
      predictionParams = {
        model: REPLICATE_MODEL,
        input,
      };
    }
    
    const prediction = await replicate.predictions.create(predictionParams);

    if (!prediction.id) {
      throw new Error('Replicate API returned prediction without ID');
    }

    console.log(`${logPrefix} Prediction created successfully`);
    console.log(`${logPrefix} Prediction ID: ${prediction.id}`);
    console.log(`${logPrefix} Status: ${prediction.status}`);
    console.log(`${logPrefix} ========================================`);

    return prediction.id;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[VideoGenerator] Failed to create prediction:', errorMessage);

    // Handle specific Replicate API errors
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      throw new Error('Replicate API authentication failed. Please check your REPLICATE_API_TOKEN.');
    }

    if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
      throw new Error('Replicate API rate limit exceeded. Please try again later.');
    }

    throw new Error(`Failed to create video prediction: ${errorMessage}`);
  }
}

/**
 * Retries a function with exponential backoff
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
        console.log(`[VideoGenerator] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

/**
 * Creates a video prediction with retry logic
 */
export async function createVideoPredictionWithRetry(
  imageUrl: string,
  prompt: string,
  seedFrame?: string,
  duration?: number
): Promise<string> {
  return retryWithBackoff(() => createVideoPrediction(imageUrl, prompt, seedFrame, duration));
}

// ============================================================================
// Polling Logic
// ============================================================================

/**
 * Polls Replicate for prediction status
 * @param predictionId Replicate prediction ID
 * @returns Video URL when prediction succeeds
 */
export async function pollVideoStatus(predictionId: string): Promise<string> {
  if (!predictionId || typeof predictionId !== 'string') {
    throw new Error('Prediction ID is required and must be a string');
  }

  const logPrefix = '[VideoGenerator]';
  console.log(`${logPrefix} Starting to poll prediction status`);
  console.log(`${logPrefix} Prediction ID: ${predictionId}`);
  console.log(`${logPrefix} Max attempts: ${MAX_POLL_ATTEMPTS} (${MAX_POLL_ATTEMPTS * POLL_INTERVAL / 1000}s total)`);

  const replicate = createReplicateClient();

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const prediction = (await replicate.predictions.get(predictionId)) as ReplicatePrediction;

      console.log(
        `[VideoGenerator] Poll attempt ${attempt + 1}/${MAX_POLL_ATTEMPTS}: Status = ${prediction.status}`
      );

      // Handle different status types
      if (prediction.status === 'succeeded') {
        // Extract output URL - WAN model returns an object with .url() method
        let videoUrl: string;

        if (prediction.output && typeof prediction.output.url === 'function') {
          // WAN model format: output has .url() method
          videoUrl = prediction.output.url();
        } else if (typeof prediction.output === 'string') {
          // Direct string URL
          videoUrl = prediction.output;
        } else if (Array.isArray(prediction.output) && prediction.output.length > 0) {
          // Array format
          videoUrl = prediction.output[0];
        } else {
          throw new Error('Prediction succeeded but no output URL found');
        }

        console.log(`${logPrefix} Prediction succeeded!`);
        console.log(`${logPrefix} Video URL: ${videoUrl.substring(0, 80)}${videoUrl.length > 80 ? '...' : ''}`);
        console.log(`${logPrefix} ========================================`);

        return videoUrl;
      } else if (prediction.status === 'failed' || prediction.status === 'canceled') {
        const errorMessage = prediction.error || 'Unknown error';
        throw new Error(`Video generation ${prediction.status}: ${errorMessage}`);
      } else if (prediction.status === 'starting' || prediction.status === 'processing') {
        // Continue polling
        if (attempt < MAX_POLL_ATTEMPTS - 1) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
        }
      } else {
        console.warn(`[VideoGenerator] Unknown status: ${prediction.status}`);
        if (attempt < MAX_POLL_ATTEMPTS - 1) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Don't retry on authentication errors
      if (errorMessage.includes('authentication') || errorMessage.includes('401')) {
        throw new Error('Replicate API authentication failed. Please check your REPLICATE_API_TOKEN.');
      }

      // Retry on network errors
      if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED')) {
        if (attempt < MAX_POLL_ATTEMPTS - 1) {
          console.warn(`[VideoGenerator] Network error, retrying... (attempt ${attempt + 1}/${MAX_POLL_ATTEMPTS})`);
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
          continue;
        }
      }

      throw error;
    }
  }

  // Timeout
  throw new Error(`Video generation timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL / 1000} seconds`);
}

// ============================================================================
// Video Download
// ============================================================================

/**
 * Downloads a video from a URL
 * @param url Video URL to download
 * @param outputPath Local path to save the video
 */
async function downloadVideo(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;

    client
      .get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          if (response.headers.location) {
            return downloadVideo(response.headers.location, outputPath)
              .then(resolve)
              .catch(reject);
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download video: HTTP ${response.statusCode}`));
          return;
        }

        const fileStream = require('fs').createWriteStream(outputPath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });

        fileStream.on('error', (error: Error) => {
          require('fs').unlink(outputPath, () => {}); // Delete partial file
          reject(error);
        });
      })
      .on('error', (error: Error) => {
        reject(error);
      });
  });
}

/**
 * Downloads a video with retry logic
 */
async function downloadVideoWithRetry(
  url: string,
  outputPath: string
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < DOWNLOAD_RETRIES; attempt++) {
    try {
      await downloadVideo(url, outputPath);
      return; // Success
    } catch (error) {
      lastError = error as Error;
      if (attempt < DOWNLOAD_RETRIES - 1) {
        console.warn(`[VideoGenerator] Download attempt ${attempt + 1} failed, retrying...`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error('Video download failed after retries');
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Generate a video from an image using Replicate Luma Ray
 * 
 * @param imageUrl - URL or path to the image to use as starting frame
 * @param prompt - Text description of desired motion/action
 * @param seedFrame - Optional seed frame URL (for Scene 1-4)
 * @param projectId - Project ID for organizing output files
 * @param sceneIndex - Scene index for organizing output files
 * @returns Local path to the generated video file
 * 
 * @throws Error if video generation fails, times out, or download fails
 */
export async function generateVideo(
  imageUrl: string,
  prompt: string,
  seedFrame: string | undefined,
  projectId: string,
  sceneIndex: number
): Promise<string> {
  // Validate inputs
  if (!imageUrl) {
    throw new Error('Image URL is required');
  }

  if (!prompt) {
    throw new Error('Prompt is required');
  }

  if (!projectId) {
    throw new Error('Project ID is required');
  }

  const logPrefix = '[VideoGenerator]';
  console.log(`${logPrefix} ========================================`);
  console.log(`${logPrefix} Starting video generation`);
  console.log(`${logPrefix} Project ID: ${projectId}`);
  console.log(`${logPrefix} Scene Index: ${sceneIndex}`);

  // Extract model name from REPLICATE_MODEL for filename
  // e.g., "wan-video/wan-2.5-i2v-fast:5be8b80..." -> "wan-2.5-i2v-fast"
  const modelName = REPLICATE_MODEL.split('/').pop()?.split(':')[0] || 'unknown';
  const sanitizedModelName = modelName.replace(/[^a-zA-Z0-9.-]/g, '-');

  // Create output directory in video testing folder
  const projectRoot = process.cwd();
  const outputDir = path.join(projectRoot, 'video testing');
  await fs.mkdir(outputDir, { recursive: true });

  // Create unique filename with timestamp and model name
  const timestamp = Date.now();
  const outputPath = path.join(outputDir, `scene-${sceneIndex}-${sanitizedModelName}-${timestamp}.mp4`);

  console.log(`${logPrefix} Using model: ${REPLICATE_MODEL} (${sanitizedModelName})`);

  try {
    // Step 1: Create prediction
    const predictionId = await createVideoPredictionWithRetry(imageUrl, prompt, seedFrame);

    // Step 2: Poll for completion
    const videoUrl = await pollVideoStatus(predictionId);

    // Step 3: Download video
    console.log(`${logPrefix} Downloading video...`);
    await downloadVideoWithRetry(videoUrl, outputPath);

    // Verify file was created
    try {
      await fs.access(outputPath);
      const stats = await fs.stat(outputPath);
      console.log(`${logPrefix} Video downloaded successfully`);
      console.log(`${logPrefix} File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`${logPrefix} Output path: ${outputPath}`);
      console.log(`${logPrefix} ========================================`);
    } catch {
      throw new Error('Video file was not created after download');
    }

    return outputPath;
  } catch (error) {
    // Clean up partial file on error
    try {
      await fs.unlink(outputPath);
    } catch {
      // Ignore cleanup errors
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Video generation failed: ${errorMessage}`);
  }
}

// ============================================================================
// Export
// ============================================================================

export default {
  generateVideo,
  createVideoPrediction,
  createVideoPredictionWithRetry,
  pollVideoStatus,
};

