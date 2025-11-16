/**
 * API client for making requests to backend endpoints
 */

import {
  StoryboardRequest,
  StoryboardResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageStatusResponse,
} from '@/lib/types';
import { UploadedImage } from '@/lib/storage/image-storage';
import { getRuntimeConfig } from '@/lib/config/model-runtime';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Gets runtime model configuration headers for API requests
 */
function getRuntimeModelHeaders(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {};
  }

  const config = getRuntimeConfig();
  return {
    'X-Model-Text': config.text,
    'X-Model-T2I': config.t2i,
    'X-Model-I2I': config.i2i,
    'X-Model-Video': config.video,
  };
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

/**
 * Enhanced error structure for better error handling
 */
export interface APIError {
  message: string;
  code?: string;
  statusCode?: number;
  retryable: boolean;
  context?: Record<string, any>;
}

/**
 * Create structured error from various error types
 */
function createAPIError(error: unknown, context?: Record<string, any>): APIError {
  if (error instanceof Response) {
    return {
      message: `HTTP ${error.status}: ${error.statusText}`,
      statusCode: error.status,
      retryable: [408, 429, 500, 502, 503, 504].includes(error.status),
      context,
    };
  }
  
  if (error instanceof Error) {
    return {
      message: error.message,
      retryable: false,
      context,
    };
  }
  
  return {
    message: String(error),
    retryable: false,
    context,
  };
}

/**
 * Retry helper function with enhanced error handling
 */
async function retryRequest<T>(
  fn: () => Promise<T>,
  config = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: APIError | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = createAPIError(error, { attempt: attempt + 1, maxRetries: config.maxRetries });

      // Check if error is retryable
      if (error instanceof Response) {
        if (!config.retryableStatusCodes.includes(error.status)) {
          throw lastError;
        }
      }

      // Log error for debugging (Phase 6.1.2)
      if (attempt < config.maxRetries) {
        console.warn(`[API] Retry attempt ${attempt + 1}/${config.maxRetries}:`, lastError.message);
      } else {
        console.error('[API] Request failed after retries:', lastError);
      }

      // Don't retry on last attempt
      if (attempt === config.maxRetries) {
        break;
      }

      // Wait before retrying with exponential backoff
      await new Promise((resolve) => setTimeout(resolve, config.retryDelay * Math.pow(2, attempt)));
    }
  }

  throw lastError || createAPIError(new Error('Request failed after retries'));
}

/**
 * Generate a storyboard from a prompt
 */
export async function generateStoryboard(
  prompt: string,
  targetDuration: number = 15,
  referenceImageUrls?: string[]
): Promise<StoryboardResponse> {
  return retryRequest(async () => {
    const response = await fetch(`${API_BASE_URL}/api/storyboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getRuntimeModelHeaders(),
      },
      body: JSON.stringify({
        prompt,
        targetDuration,
        referenceImageUrls,
      } as StoryboardRequest),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to generate storyboard' }));
      throw new Error(error.error || 'Failed to generate storyboard');
    }

    return response.json();
  });
}

/**
 * Create a new project
 */
export async function createProject(
  prompt: string,
  targetDuration: number = 15,
  referenceImageUrls?: string[]
): Promise<{ projectId: string; storyboard: StoryboardResponse }> {
  const storyboard = await generateStoryboard(prompt, targetDuration, referenceImageUrls);

  if (!storyboard.success || !storyboard.scenes) {
    throw new Error(storyboard.error || 'Failed to generate storyboard');
  }

  // Project ID will be generated on the client side
  return {
    projectId: '', // Will be set by the store
    storyboard,
  };
}

/**
 * Upload images to the server
 */
export async function uploadImages(
  files: File[],
  projectId: string,
  enableBackgroundRemoval?: boolean
): Promise<{ urls: string[]; paths: string[]; images?: UploadedImage[] }> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('images', file);
  });
  formData.append('projectId', projectId);
  
  // Get background removal setting from runtime config if not provided
  if (enableBackgroundRemoval === undefined) {
    try {
      const { getRuntimeConfig } = await import('@/lib/config/model-runtime');
      const config = getRuntimeConfig();
      enableBackgroundRemoval = config.enableBackgroundRemoval !== false;
    } catch {
      // Default to true if config can't be loaded
      enableBackgroundRemoval = true;
    }
  }
  formData.append('enableBackgroundRemoval', enableBackgroundRemoval ? 'true' : 'false');

  return retryRequest(async () => {
    const response = await fetch(`${API_BASE_URL}/api/upload-images`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to upload images' }));
      throw new Error(error.error || 'Failed to upload images');
    }

    const result = await response.json();
    
    // Extract URLs from uploaded images
    const urls = result.images?.map((img: any) => img.url) || [];
    const paths = result.images?.map((img: any) => img.localPath) || [];

    return {
      ...result,
      urls,
      paths,
      images: result.images, // Include full image objects with processed versions
    };
  });
}

/**
 * Generate an image for a scene
 */
export async function generateImage(
  request: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  return retryRequest(async () => {
    const response = await fetch(`${API_BASE_URL}/api/generate-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getRuntimeModelHeaders(),
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to generate image' }));
      throw new Error(error.error || 'Failed to generate image');
    }

    return response.json();
  });
}

/**
 * Poll for image generation status
 */
export async function pollImageStatus(
  predictionId: string,
  options: {
    interval?: number;
    timeout?: number;
    projectId?: string;
    sceneIndex?: number;
    prompt?: string;
    onProgress?: (status: ImageStatusResponse) => void;
  } = {}
): Promise<ImageStatusResponse> {
  const { interval = 2000, timeout = 300000, projectId, sceneIndex, prompt, onProgress } = options; // 5 min default timeout
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        // Check timeout
        if (Date.now() - startTime > timeout) {
          reject(new Error('Image generation timeout'));
          return;
        }

        // Build URL with query parameters if provided
        let url: string;
        if (API_BASE_URL) {
          const urlObj = new URL(`${API_BASE_URL}/api/generate-image/${predictionId}`);
          if (projectId) urlObj.searchParams.set('projectId', projectId);
          if (sceneIndex !== undefined) urlObj.searchParams.set('sceneIndex', sceneIndex.toString());
          if (prompt) urlObj.searchParams.set('prompt', prompt);
          url = urlObj.toString();
        } else {
          // Relative URL - build query string manually
          const params = new URLSearchParams();
          if (projectId) params.set('projectId', projectId);
          if (sceneIndex !== undefined) params.set('sceneIndex', sceneIndex.toString());
          if (prompt) params.set('prompt', prompt);
          const queryString = params.toString();
          url = `/api/generate-image/${predictionId}${queryString ? `?${queryString}` : ''}`;
        }

        const response = await fetch(url);
        if (!response.ok) {
          const errorText = await response.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { error: errorText || 'Failed to fetch image status' };
          }
          throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch image status`);
        }

        const status: ImageStatusResponse = await response.json();

        // Call progress callback
        if (onProgress) {
          onProgress(status);
        }

        // Check if completed
        if (status.status === 'succeeded') {
          resolve(status);
          return;
        }

        if (status.status === 'failed' || status.status === 'canceled') {
          reject(new Error(status.error || 'Image generation failed'));
          return;
        }

        // Continue polling
        setTimeout(poll, interval);
      } catch (error) {
        reject(error);
      }
    };

    poll();
  });
}

/**
 * Generate video for a scene
 */
export async function generateVideo(
  imageUrl: string,
  prompt: string,
  projectId: string,
  sceneIndex: number,
  seedFrame?: string
): Promise<{ predictionId: string; status: string }> {
  return retryRequest(async () => {
    const response = await fetch(`${API_BASE_URL}/api/generate-video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getRuntimeModelHeaders(),
      },
      body: JSON.stringify({
        imageUrl,
        prompt,
        projectId,
        sceneIndex,
        seedFrame,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to generate video' }));
      throw new Error(error.error || 'Failed to generate video');
    }

    const result = await response.json();

    // Extract predictionId from the nested data structure
    if (result.success && result.data?.predictionId) {
      return {
        predictionId: result.data.predictionId,
        status: 'starting',
      };
    }

    throw new Error('Invalid response format from video generation API');
  });
}

/**
 * Poll for video generation status
 */
export async function pollVideoStatus(
  predictionId: string,
  options: {
    interval?: number;
    timeout?: number;
    onProgress?: (status: any) => void;
    projectId?: string;
    sceneIndex?: number;
  } = {}
): Promise<{ status: string; videoPath?: string; error?: string }> {
  const { interval = 5000, timeout = 600000, onProgress, projectId, sceneIndex } = options; // 10 min default timeout
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        // Check timeout
        if (Date.now() - startTime > timeout) {
          reject(new Error('Video generation timeout'));
          return;
        }

        // Build URL with query parameters if provided
        let url = `${API_BASE_URL}/api/generate-video/${predictionId}`;
        if (projectId && sceneIndex !== undefined) {
          const params = new URLSearchParams();
          params.set('projectId', projectId);
          params.set('sceneIndex', sceneIndex.toString());
          url += '?' + params.toString();
        }

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('Failed to fetch video status');
        }

        const status = await response.json();

        // Call progress callback
        if (onProgress) {
          onProgress(status);
        }

        // Check if request failed (success: false means prediction failed)
        if (status.success === false) {
          reject(new Error(status.error || 'Video generation failed'));
          return;
        }

        // Extract status from nested data structure if present
        const actualStatus = status.data?.status || status.status;

        // Check if completed (nested in data object)
        if (actualStatus === 'succeeded') {
          // Use local path if available, otherwise use Replicate URL as fallback
          const videoPath = status.data?.video?.localPath;
          const replicateUrl = status.data?.output;
          
          resolve({
            status: 'succeeded',
            videoPath: videoPath || replicateUrl, // Fallback to Replicate URL if local download failed
            error: videoPath ? undefined : status.data?.error, // Include error if no local path
          });
          return;
        }

        // Check if failed or canceled
        if (actualStatus === 'failed' || actualStatus === 'canceled') {
          reject(new Error(status.error || status.data?.error || 'Video generation failed'));
          return;
        }

        // Continue polling if still processing
        setTimeout(poll, interval);
      } catch (error) {
        reject(error);
      }
    };

    poll();
  });
}

/**
 * Extract seed frames from a video
 */
export async function extractFrames(
  videoPath: string,
  projectId: string,
  sceneIndex: number
): Promise<{ frames: Array<{ id: string; url: string; timestamp: number }> }> {
  return retryRequest(async () => {
    const response = await fetch(`${API_BASE_URL}/api/extract-frames`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        videoPath,
        projectId,
        sceneIndex,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to extract frames' }));
      throw new Error(error.error || 'Failed to extract frames');
    }

    const result = await response.json();
    // Unwrap the response structure: { success: true, data: { frames: [...] } }
    if (result.success && result.data?.frames) {
      return { frames: result.data.frames };
    } else {
      throw new Error(result.error || 'Invalid response structure from frame extraction API');
    }
  });
}

/**
 * Stitch videos together
 */
export async function stitchVideos(
  videoPaths: string[],
  projectId: string
): Promise<{ finalVideoPath: string; s3Url?: string }> {
  return retryRequest(async () => {
    const response = await fetch(`${API_BASE_URL}/api/stitch-videos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        videoPaths,
        projectId,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to stitch videos' }));
      throw new Error(error.error || 'Failed to stitch videos');
    }

    const result = await response.json();
    // Unwrap the response structure: { success: true, data: { finalVideoPath: ..., s3Url: ... } }
    if (result.success && result.data) {
      return {
        finalVideoPath: result.data.finalVideoPath,
        s3Url: result.data.s3Url,
      };
    } else {
      throw new Error(result.error || 'Invalid response structure from stitch videos API');
    }
  });
}

/**
 * Get project status
 */
export async function getProjectStatus(projectId: string): Promise<any> {
  return retryRequest(async () => {
    const response = await fetch(`${API_BASE_URL}/api/project/${projectId}/status`);

    if (!response.ok) {
      // For 404, throw a Response object so statusCode is preserved
      if (response.status === 404) {
        throw response;
      }
      const error = await response.json().catch(() => ({ error: 'Failed to get project status' }));
      throw new Error(error.error || 'Failed to get project status');
    }

    return response.json();
  });
}

/**
 * Upload image to S3
 */
export async function uploadImageToS3(
  imagePath: string,
  projectId: string
): Promise<{ s3Url: string; s3Key: string }> {
  return retryRequest(async () => {
    const response = await fetch(`${API_BASE_URL}/api/upload-image-s3`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imagePath,
        projectId,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to upload image to S3' }));
      throw new Error(error.error || 'Failed to upload image to S3');
    }

    const data = await response.json();
    return data.data;
  });
}

