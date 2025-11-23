/**
 * API client for making requests to backend endpoints
 */

import {
  StoryboardRequest,
  StoryboardResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageStatusResponse,
} from "@/lib/types";
import { UploadedImage } from "@/lib/storage/image-storage";
import { getRuntimeConfig } from "@/lib/config/model-runtime";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * Log API calls to the agent chat window
 */
function logAPICall(method: string, url: string, statusCode?: number) {
  if (typeof window === "undefined") return;

  try {
    const endpoint = url.replace(API_BASE_URL, "");
    const status = statusCode ? ` (${statusCode})` : "";

    // Dynamically import to avoid circular dependencies
    import("@/lib/state/project-store")
      .then(({ useProjectStore }) => {
        const addChatMessage = useProjectStore.getState().addChatMessage;
        addChatMessage({
          role: "agent",
          type: "status",
          content: `${method} ${endpoint}${status}`,
        });
      })
      .catch((error) => {
        console.warn("[API Logger] Failed to log API call:", error);
      });
  } catch (error) {
    console.warn("[API Logger] Failed to log API call:", error);
  }
}

/**
 * Gets runtime model configuration headers for API requests
 */
function getRuntimeModelHeaders(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }

  const config = getRuntimeConfig();
  return {
    "X-Model-Text": config.text,
    "X-Model-T2I": config.t2i,
    "X-Model-I2I": config.i2i,
    "X-Model-Video": config.video,
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
function createAPIError(
  error: unknown,
  context?: Record<string, any>,
): APIError {
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
  config = DEFAULT_RETRY_CONFIG,
  logInfo?: { method: string; url: string },
): Promise<T> {
  let lastError: APIError | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const result = await fn();

      // Log successful API call on first attempt
      if (attempt === 0 && logInfo) {
        logAPICall(logInfo.method, logInfo.url, 200);
      }

      return result;
    } catch (error) {
      lastError = createAPIError(error, {
        attempt: attempt + 1,
        maxRetries: config.maxRetries,
      });

      // Log failed API call
      if (logInfo && error instanceof Response) {
        logAPICall(logInfo.method, logInfo.url, error.status);
      }

      // Check if error is retryable
      if (error instanceof Response) {
        if (!config.retryableStatusCodes.includes(error.status)) {
          throw lastError;
        }
      }

      // Log error for debugging (Phase 6.1.2)
      if (attempt < config.maxRetries) {
        console.warn(
          `[API] Retry attempt ${attempt + 1}/${config.maxRetries}:`,
          lastError.message,
        );
      } else {
        console.error("[API] Request failed after retries:", lastError);
      }

      // Don't retry on last attempt
      if (attempt === config.maxRetries) {
        break;
      }

      // Wait before retrying with exponential backoff
      await new Promise((resolve) =>
        setTimeout(resolve, config.retryDelay * Math.pow(2, attempt)),
      );
    }
  }

  throw lastError || createAPIError(new Error("Request failed after retries"));
}

/**
 * Generate a storyboard from a prompt
 */
export async function generateStoryboard(
  prompt: string,
  targetDuration: number = 15,
  referenceImageUrls?: string[],
): Promise<StoryboardResponse> {
  const url = `${API_BASE_URL}/api/storyboard`;
  return retryRequest(
    async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getRuntimeModelHeaders(),
        },
        credentials: "include", // Ensure cookies are sent with the request
        body: JSON.stringify({
          prompt,
          targetDuration,
          referenceImageUrls,
        } as StoryboardRequest),
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: "Failed to generate storyboard" }));
        throw new Error(error.error || "Failed to generate storyboard");
      }

      return response.json();
    },
    DEFAULT_RETRY_CONFIG,
    { method: "POST", url },
  );
}

/**
 * Create a new project
 */
export async function createProject(
  prompt: string,
  targetDuration: number = 15,
  referenceImageUrls?: string[],
): Promise<{ projectId: string; storyboard: StoryboardResponse }> {
  const storyboard = await generateStoryboard(
    prompt,
    targetDuration,
    referenceImageUrls,
  );

  if (!storyboard.success || !storyboard.scenes) {
    throw new Error(storyboard.error || "Failed to generate storyboard");
  }

  // Project ID will be generated on the client side
  return {
    projectId: "", // Will be set by the store
    storyboard,
  };
}

/**
 * Upload images to the server
 */
export async function uploadImages(
  files: File[],
  projectId: string,
  enableBackgroundRemoval?: boolean,
): Promise<{ urls: string[]; paths: string[]; images?: UploadedImage[] }> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("images", file);
  });
  formData.append("projectId", projectId);

  // Get background removal setting from runtime config if not provided
  if (enableBackgroundRemoval === undefined) {
    try {
      const { getRuntimeConfig } = await import("@/lib/config/model-runtime");
      const config = getRuntimeConfig();
      enableBackgroundRemoval = config.enableBackgroundRemoval !== false;
    } catch {
      // Default to true if config can't be loaded
      enableBackgroundRemoval = true;
    }
  }
  formData.append(
    "enableBackgroundRemoval",
    enableBackgroundRemoval ? "true" : "false",
  );

  // Get edge cleanup iterations from runtime config
  try {
    const { getRuntimeConfig } = await import("@/lib/config/model-runtime");
    const config = getRuntimeConfig();
    const edgeCleanupIterations = config.edgeCleanupIterations ?? 1;
    formData.append("edgeCleanupIterations", edgeCleanupIterations.toString());
  } catch {
    // Default to 1 if config can't be loaded
    formData.append("edgeCleanupIterations", "1");
  }

  const url = `${API_BASE_URL}/api/upload-images`;
  return retryRequest(
    async () => {
      const response = await fetch(url, {
        method: "POST",
        credentials: "include", // Ensure cookies are sent with the request
        body: formData,
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: "Failed to upload images" }));
        throw new Error(error.error || "Failed to upload images");
      }

      const result = await response.json();

      // Extract URLs from uploaded images
      // Prefer the last processed version (most refined background removal) if available
      const urls =
        result.images?.map((img: any) => {
          // If background-removed versions exist, use the last one (most iterations)
          if (img.processedVersions && img.processedVersions.length > 0) {
            const lastProcessed =
              img.processedVersions[img.processedVersions.length - 1];
            return lastProcessed.url;
          }
          // Otherwise use original
          return img.url;
        }) || [];

      const paths =
        result.images?.map((img: any) => {
          // Same logic for paths
          if (img.processedVersions && img.processedVersions.length > 0) {
            const lastProcessed =
              img.processedVersions[img.processedVersions.length - 1];
            return lastProcessed.localPath;
          }
          return img.localPath;
        }) || [];

      return {
        ...result,
        urls,
        paths,
        images: result.images, // Include full image objects with processed versions
      };
    },
    DEFAULT_RETRY_CONFIG,
    { method: "POST", url },
  );
}

/**
 * Generate an image for a scene
 */
export async function generateImage(
  request: ImageGenerationRequest,
  options?: { model?: string },
): Promise<ImageGenerationResponse> {
  const url = `${API_BASE_URL}/api/generate-image`;
  return retryRequest(
    async () => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...getRuntimeModelHeaders(),
      };

      // Override with specific model if provided
      if (options?.model) {
        headers["X-Model-I2I"] = options.model;
        headers["X-Model-T2I"] = options.model;
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
        credentials: "include", // Ensure cookies are sent with the request
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: "Failed to generate image" }));
        throw new Error(error.error || "Failed to generate image");
      }

      return response.json();
    },
    DEFAULT_RETRY_CONFIG,
    { method: "POST", url },
  );
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
  } = {},
): Promise<ImageStatusResponse> {
  const {
    interval = 2000,
    timeout = 300000,
    projectId,
    sceneIndex,
    prompt,
    onProgress,
  } = options; // 5 min default timeout
  const startTime = Date.now();
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3;

  // Helper to check if an error is retryable
  const isRetryableError = (errorMessage: string): boolean => {
    const msg = errorMessage.toLowerCase();
    return (
      msg.includes("director") ||
      msg.includes("e6716") ||
      msg.includes("unexpected error") ||
      msg.includes("network") ||
      msg.includes("timeout") ||
      msg.includes("rate limit") ||
      msg.includes("service unavailable") ||
      msg.includes("internal server error")
    );
  };

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        // Check timeout
        if (Date.now() - startTime > timeout) {
          reject(new Error("Image generation timeout"));
          return;
        }

        // Build URL with query parameters if provided
        let url: string;
        if (API_BASE_URL) {
          const urlObj = new URL(
            `${API_BASE_URL}/api/generate-image/${predictionId}`,
          );
          if (projectId) urlObj.searchParams.set("projectId", projectId);
          if (sceneIndex !== undefined)
            urlObj.searchParams.set("sceneIndex", sceneIndex.toString());
          if (prompt) urlObj.searchParams.set("prompt", prompt);
          url = urlObj.toString();
        } else {
          // Relative URL - build query string manually
          const params = new URLSearchParams();
          if (projectId) params.set("projectId", projectId);
          if (sceneIndex !== undefined)
            params.set("sceneIndex", sceneIndex.toString());
          if (prompt) params.set("prompt", prompt);
          const queryString = params.toString();
          url = `/api/generate-image/${predictionId}${queryString ? `?${queryString}` : ""}`;
        }

        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) {
          const errorText = await response.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { error: errorText || "Failed to fetch image status" };
          }
          throw new Error(
            errorData.error ||
              `HTTP ${response.status}: Failed to fetch image status`,
          );
        }

        const status: ImageStatusResponse = await response.json();

        // Reset consecutive errors on successful poll
        consecutiveErrors = 0;

        // Call progress callback
        if (onProgress) {
          onProgress(status);
        }

        // Check if completed
        if (status.status === "succeeded") {
          resolve(status);
          return;
        }

        if (status.status === "failed" || status.status === "canceled") {
          const errorMsg = status.error || "Image generation failed";

          // Check if this is a retryable Replicate error (like E6716)
          if (
            isRetryableError(errorMsg) &&
            consecutiveErrors < MAX_CONSECUTIVE_ERRORS
          ) {
            consecutiveErrors++;
            console.warn(
              `[pollImageStatus] Retryable error detected (attempt ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${errorMsg}`,
            );
            // Wait a bit longer before retrying on errors
            setTimeout(poll, interval * 2);
            return;
          }

          reject(new Error(errorMsg));
          return;
        }

        // Continue polling
        setTimeout(poll, interval);
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";

        // Check if this is a retryable error
        if (
          isRetryableError(errorMsg) &&
          consecutiveErrors < MAX_CONSECUTIVE_ERRORS
        ) {
          consecutiveErrors++;
          console.warn(
            `[pollImageStatus] Transient error (attempt ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${errorMsg}`,
          );
          // Wait a bit longer before retrying
          setTimeout(poll, interval * 2);
          return;
        }

        reject(error);
      }
    };

    poll();
  });
}

/**
 * Generate video for a scene or subscene
 */
export async function generateVideo(
  imageUrl: string,
  prompt: string,
  projectId: string,
  sceneIndex: number,
  seedFrame?: string,
  duration?: number, // Optional: Scene-specific duration
  subsceneIndex?: number, // Optional: For subscene-based workflow
  modelParameters?: Record<string, any>, // Optional: Model-specific parameters
  referenceImageUrls?: string[], // Optional: Reference images for consistency
): Promise<{ predictionId: string; status: string }> {
  const url = `${API_BASE_URL}/api/generate-video`;
  return retryRequest(
    async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getRuntimeModelHeaders(),
        },
        body: JSON.stringify({
          imageUrl,
          prompt,
          projectId,
          sceneIndex,
          seedFrame,
          duration, // Pass duration if provided
          subsceneIndex, // Pass subscene index if provided
          modelParameters, // Pass model parameters if provided
          referenceImageUrls, // Pass reference images if provided
        }),
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: "Failed to generate video" }));
        throw new Error(error.error || "Failed to generate video");
      }

      const result = await response.json();

      // Extract predictionId from the nested data structure
      if (result.success && result.data?.predictionId) {
        return {
          predictionId: result.data.predictionId,
          status: "starting",
        };
      }

      throw new Error("Invalid response format from video generation API");
    },
    DEFAULT_RETRY_CONFIG,
    { method: "POST", url },
  );
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
  } = {},
): Promise<{
  status: string;
  videoPath?: string;
  actualDuration?: number;
  error?: string;
}> {
  const {
    interval = 5000,
    timeout = 600000,
    onProgress,
    projectId,
    sceneIndex,
  } = options; // 10 min default timeout
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        // Check timeout
        if (Date.now() - startTime > timeout) {
          reject(new Error("Video generation timeout"));
          return;
        }

        // Build URL with query parameters if provided
        let url = `${API_BASE_URL}/api/generate-video/${predictionId}`;
        if (projectId && sceneIndex !== undefined) {
          const params = new URLSearchParams();
          params.set("projectId", projectId);
          params.set("sceneIndex", sceneIndex.toString());
          url += "?" + params.toString();
        }

        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) {
          throw new Error("Failed to fetch video status");
        }

        const status = await response.json();

        // Call progress callback
        if (onProgress) {
          onProgress(status);
        }

        // Check if request failed (success: false means prediction failed)
        if (status.success === false) {
          reject(new Error(status.error || "Video generation failed"));
          return;
        }

        // Extract status from nested data structure if present
        const actualStatus = status.data?.status || status.status;

        // Check if completed (nested in data object)
        if (actualStatus === "succeeded") {
          // Use local path if available, otherwise use Replicate URL as fallback
          const videoPath = status.data?.video?.localPath;
          const replicateUrl = status.data?.output;
          const videoDuration = status.data?.video?.duration;

          resolve({
            status: "succeeded",
            videoPath: videoPath || replicateUrl, // Fallback to Replicate URL if local download failed
            actualDuration: videoDuration,
            error: videoPath ? undefined : status.data?.error, // Include error if no local path
          });
          return;
        }

        // Check if failed or canceled
        if (actualStatus === "failed" || actualStatus === "canceled") {
          reject(
            new Error(
              status.error || status.data?.error || "Video generation failed",
            ),
          );
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
  sceneIndex: number,
): Promise<{ frames: Array<{ id: string; url: string; timestamp: number }> }> {
  return retryRequest(async () => {
    const response = await fetch(`${API_BASE_URL}/api/extract-frames`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        videoPath,
        projectId,
        sceneIndex,
      }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to extract frames" }));
      throw new Error(error.error || "Failed to extract frames");
    }

    const result = await response.json();
    // Unwrap the response structure: { success: true, data: { frames: [...] } }
    if (result.success && result.data?.frames) {
      return { frames: result.data.frames };
    } else {
      throw new Error(
        result.error || "Invalid response structure from frame extraction API",
      );
    }
  });
}

/**
 * Stitch videos together
 */
export async function stitchVideos(
  videoPaths: string[],
  projectId: string,
  style?: "whimsical" | "luxury" | "offroad" | null,
): Promise<{ finalVideoPath: string; s3Url?: string }> {
  return retryRequest(async () => {
    const response = await fetch(`${API_BASE_URL}/api/stitch-videos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        videoPaths,
        projectId,
        style,
      }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to stitch videos" }));
      throw new Error(error.error || "Failed to stitch videos");
    }

    const result = await response.json();
    // Unwrap the response structure: { success: true, data: { finalVideoPath: ..., s3Url: ... } }
    if (result.success && result.data) {
      return {
        finalVideoPath: result.data.finalVideoPath,
        s3Url: result.data.s3Url,
      };
    } else {
      throw new Error(
        result.error || "Invalid response structure from stitch videos API",
      );
    }
  });
}

/**
 * Get project status
 */
export async function getProjectStatus(projectId: string): Promise<any> {
  return retryRequest(async () => {
    const response = await fetch(
      `${API_BASE_URL}/api/project/${projectId}/status`,
    );

    if (!response.ok) {
      // For 404, throw a Response object so statusCode is preserved
      if (response.status === 404) {
        throw response;
      }
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to get project status" }));
      throw new Error(error.error || "Failed to get project status");
    }

    return response.json();
  });
}

/**
 * Apply clip edits (trim/crop) to timeline clips
 */
export async function applyClipEdits(
  clips: Array<{
    id: string;
    videoLocalPath: string;
    trimStart?: number;
    trimEnd?: number;
    sourceDuration: number;
  }>,
  projectId: string,
): Promise<string[]> {
  return retryRequest(async () => {
    const response = await fetch(`${API_BASE_URL}/api/apply-clip-edits`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clips,
        projectId,
      }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to apply clip edits" }));
      throw new Error(error.error || "Failed to apply clip edits");
    }

    const result = await response.json();
    if (result.success && result.data?.editedVideoPaths) {
      return result.data.editedVideoPaths;
    } else {
      throw new Error(
        result.error || "Invalid response structure from apply clip edits API",
      );
    }
  });
}

/**
 * Generate a preview video from timeline clips with edits applied
 * This creates a temporary stitched video for smooth playback
 */
export async function generatePreview(
  clips: Array<{
    id: string;
    videoLocalPath: string;
    trimStart?: number;
    trimEnd?: number;
    sourceDuration: number;
  }>,
  projectId: string,
): Promise<string> {
  return retryRequest(async () => {
    const response = await fetch(`${API_BASE_URL}/api/generate-preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clips,
        projectId,
      }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to generate preview" }));
      throw new Error(error.error || "Failed to generate preview");
    }

    const result = await response.json();
    if (result.success && result.data?.previewVideoPath) {
      return result.data.previewVideoPath;
    } else {
      throw new Error(
        result.error || "Invalid response structure from generate preview API",
      );
    }
  });
}

/**
 * Upload image to S3
 * Returns both the standard S3 URL and a pre-signed URL for external API access
 */
export async function uploadImageToS3(
  imagePath: string,
  projectId: string,
): Promise<{ s3Url: string; s3Key: string; preSignedUrl: string }> {
  return retryRequest(async () => {
    const response = await fetch(`${API_BASE_URL}/api/upload-image-s3`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        imagePath,
        projectId,
      }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to upload image to S3" }));
      throw new Error(error.error || "Failed to upload image to S3");
    }

    const data = await response.json();
    return data.data;
  });
}

/**
 * Fetch user's projects
 */
export async function fetchProjects(
  scope: "mine" | "company" = "mine",
): Promise<any[]> {
  const url = `${API_BASE_URL}/api/projects?scope=${scope}`;
  return retryRequest(
    async () => {
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }

      const data = await response.json();
      return data.projects || [];
    },
    DEFAULT_RETRY_CONFIG,
    { method: "GET", url },
  );
}

/**
 * Create a new project and save it to backend
 */
export async function saveProject(
  name: string,
  prompt: string,
  targetDuration: number,
  characterDescription?: string,
): Promise<any> {
  const url = `${API_BASE_URL}/api/projects`;
  return retryRequest(
    async () => {
      const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          prompt,
          targetDuration,
          characterDescription,
        }),
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: "Failed to create project" }));
        throw new Error(error.error || "Failed to create project");
      }

      const data = await response.json();
      return data.project;
    },
    DEFAULT_RETRY_CONFIG,
    { method: "POST", url },
  );
}

/**
 * Update an existing project
 */
export async function updateProject(
  projectId: string,
  updates: {
    name?: string;
    status?: string;
    characterDescription?: string;
    finalVideoUrl?: string;
    finalVideoS3Key?: string;
  },
): Promise<any> {
  return retryRequest(async () => {
    const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to update project" }));
      throw new Error(error.error || "Failed to update project");
    }

    const data = await response.json();
    return data.project;
  });
}

/**
 * Fetch a specific project with all its data
 */
export async function loadProject(projectId: string): Promise<any> {
  return retryRequest(async () => {
    const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}`, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to load project" }));
      throw new Error(error.error || "Project not found");
    }

    const data = await response.json();
    return data.project;
  });
}

/**
 * Delete a project
 */
export async function deleteProject(projectId: string): Promise<void> {
  return retryRequest(async () => {
    const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to delete project" }));
      throw new Error(error.error || "Failed to delete project");
    }
  });
}

/**
 * Delete a generated image
 */
export async function deleteGeneratedImage(
  imageId: string,
  localPath?: string,
  s3Key?: string,
): Promise<{ success: boolean; message?: string }> {
  return retryRequest(async () => {
    const response = await fetch(`${API_BASE_URL}/api/images/${imageId}`, {
      method: "DELETE",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ localPath, s3Key }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to delete image" }));
      throw new Error(error.error || "Failed to delete image");
    }

    return response.json();
  });
}

/**
 * Generate composite image by inserting reference/subject into background
 */
export async function generateComposite(
  referenceImageUrl: string,
  backgroundImageUrl: string,
  projectId: string,
  sceneIndex: number,
  prompt?: string,
  seed?: number,
): Promise<{
  success: boolean;
  image?: {
    id: string;
    url: string;
    localPath: string;
    s3Key?: string;
    prompt: string;
    replicateId: string;
    createdAt: string;
  };
  error?: string;
  code?: string;
}> {
  return retryRequest(async () => {
    const response = await fetch(`${API_BASE_URL}/api/generate-composite`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...getRuntimeModelHeaders(),
      },
      body: JSON.stringify({
        referenceImageUrl,
        backgroundImageUrl,
        prompt,
        projectId,
        sceneIndex,
        seed,
      }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to generate composite" }));
      throw new Error(error.error || "Failed to generate composite");
    }

    return response.json();
  });
}

/**
 * Duplicate a scene (copies all related data: images, videos, seed frames, files)
 */
export async function duplicateScene(
  projectId: string,
  sceneId: string,
): Promise<{
  success: boolean;
  duplicatedScene?: any;
  duplicatedImages?: any[];
  duplicatedVideos?: any[];
  duplicatedSeedFrames?: any[];
  error?: string;
}> {
  return retryRequest(async () => {
    const response = await fetch(`${API_BASE_URL}/api/scenes/duplicate`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId,
        sceneId,
      }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to duplicate scene" }));
      throw new Error(error.error || "Failed to duplicate scene");
    }

    return response.json();
  });
}

// ============================================================================
// Prompt Enhancement
// ============================================================================

export interface EnhancePromptOptions {
  prompt: string;
  context?: {
    sceneTitle?: string;
    sceneSummary?: string;
    previousPrompt?: string;
    characterDescription?: string;
  };
}

export interface EnhancePromptResponse {
  success: boolean;
  data?: {
    originalPrompt: string;
    enhancedPrompt: string;
  };
  error?: string;
}

/**
 * Enhance a video prompt using Claude Sonnet 4.5
 */
export async function enhancePrompt(
  options: EnhancePromptOptions,
): Promise<EnhancePromptResponse> {
  const url = `${API_BASE_URL}/api/enhance-prompt`;
  return retryRequest(
    async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: "Failed to enhance prompt" }));
        throw new Error(error.error || "Failed to enhance prompt");
      }

      return response.json();
    },
    DEFAULT_RETRY_CONFIG,
    { method: "POST", url },
  );
}

// ============================================================================
// Music Generation
// ============================================================================

export interface MusicGenerationOptions {
  prompt?: string;
  videoUrl?: string;
  mood?: string;
  genre?: string;
  duration?: number;
  temperature?: number;
  modelVersion?:
    | "stereo-melody-large"
    | "stereo-large"
    | "melody-large"
    | "large";
  analyzeVideo?: boolean;
}

export interface MusicGenerationResponse {
  success: boolean;
  data?: {
    predictionId: string;
    status: string;
    prompt: string;
    duration: number;
    analysis?: any;
  };
  error?: string;
}

export interface MusicStatusResponse {
  success: boolean;
  data?: {
    status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
    audioUrl?: string;
    localPath?: string;
    s3Url?: string;
    error?: string;
  };
  error?: string;
}

/**
 * Generate music from a prompt or video analysis
 */
export async function generateMusicTrack(
  options: MusicGenerationOptions,
): Promise<MusicGenerationResponse> {
  return retryRequest(async () => {
    const url = options.analyzeVideo
      ? `${API_BASE_URL}/api/generate-music?analyze=true`
      : `${API_BASE_URL}/api/generate-music`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: options.prompt,
        videoUrl: options.videoUrl,
        mood: options.mood,
        genre: options.genre,
        duration: options.duration,
        temperature: options.temperature,
        modelVersion: options.modelVersion,
      }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to generate music" }));
      throw new Error(error.error || "Failed to generate music");
    }

    return response.json();
  });
}

/**
 * Get all text overlays for a project
 */
export async function getTextOverlays(projectId: string): Promise<any[]> {
  return retryRequest(async () => {
    const response = await fetch(
      `${API_BASE_URL}/api/projects/${projectId}/text-overlays`,
      {
        method: "GET",
        credentials: "include",
      },
    );

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to get text overlays" }));
      throw new Error(error.error || "Failed to get text overlays");
    }

    const data = await response.json();
    return data.textOverlays || [];
  });
}

/**
 * Create a new text overlay
 */
export async function createTextOverlay(
  projectId: string,
  overlayData: any,
): Promise<any> {
  return retryRequest(async () => {
    const response = await fetch(
      `${API_BASE_URL}/api/projects/${projectId}/text-overlays`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(overlayData),
      },
    );

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to create text overlay" }));
      throw new Error(error.error || "Failed to create text overlay");
    }

    const data = await response.json();
    return data.textOverlay;
  });
}

/**
 * Update a text overlay
 */
export async function updateTextOverlay(
  projectId: string,
  overlayId: string,
  updates: any,
): Promise<any> {
  return retryRequest(async () => {
    const response = await fetch(
      `${API_BASE_URL}/api/projects/${projectId}/text-overlays`,
      {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ overlayId, ...updates }),
      },
    );

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to update text overlay" }));
      throw new Error(error.error || "Failed to update text overlay");
    }

    const data = await response.json();
    return data.textOverlay;
  });
}

/**
 * Delete a text overlay
 */
export async function deleteTextOverlay(
  projectId: string,
  overlayId: string,
): Promise<void> {
  return retryRequest(async () => {
    const response = await fetch(
      `${API_BASE_URL}/api/projects/${projectId}/text-overlays?overlayId=${overlayId}`,
      {
        method: "DELETE",
        credentials: "include",
      },
    );

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to delete text overlay" }));
      throw new Error(error.error || "Failed to delete text overlay");
    }
  });
}

/**
 * Poll for music generation status
 */
export async function pollMusicStatus(
  predictionId: string,
  options: {
    interval?: number;
    timeout?: number;
    projectId?: string;
    onProgress?: (status: MusicStatusResponse) => void;
  } = {},
): Promise<MusicStatusResponse> {
  const { interval = 3000, timeout = 180000, projectId, onProgress } = options;
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        if (Date.now() - startTime > timeout) {
          reject(new Error("Music generation timeout"));
          return;
        }

        const params = new URLSearchParams();
        if (projectId) params.set("projectId", projectId);
        const queryString = params.toString();

        const url = `${API_BASE_URL}/api/generate-music/${predictionId}${queryString ? `?${queryString}` : ""}`;
        const response = await fetch(url, { credentials: "include" });

        if (!response.ok) {
          throw new Error("Failed to fetch music status");
        }

        const status: MusicStatusResponse = await response.json();

        if (onProgress) {
          onProgress(status);
        }

        if (status.data?.status === "succeeded") {
          resolve(status);
          return;
        }

        if (
          status.data?.status === "failed" ||
          status.data?.status === "canceled"
        ) {
          reject(new Error(status.data?.error || "Music generation failed"));
          return;
        }

        setTimeout(poll, interval);
      } catch (error) {
        reject(error);
      }
    };

    poll();
  });
}

/**
 * Generate music and wait for completion
 */
export async function generateMusicAndWait(
  options: MusicGenerationOptions & { projectId?: string },
): Promise<{
  audioUrl: string;
  localPath?: string;
  s3Url?: string;
}> {
  const result = await generateMusicTrack(options);

  if (!result.success || !result.data?.predictionId) {
    throw new Error(result.error || "Failed to start music generation");
  }

  const status = await pollMusicStatus(result.data.predictionId, {
    projectId: options.projectId,
  });

  if (!status.success || !status.data?.audioUrl) {
    throw new Error(status.error || "Music generation failed");
  }

  return {
    audioUrl: status.data.audioUrl,
    localPath: status.data.localPath,
    s3Url: status.data.s3Url,
  };
}

// ============================================================================
// Narration Generation
// ============================================================================

export type NarrationVoice =
  | "alloy"
  | "echo"
  | "fable"
  | "onyx"
  | "nova"
  | "shimmer";

export interface NarrationGenerationOptions {
  text: string;
  voice?: NarrationVoice;
  speed?: number; // 0.25 to 4.0, default 1.0
  projectId: string;
}

export interface NarrationGenerationResponse {
  success: boolean;
  data?: {
    audioUrl: string;
    localPath: string;
    duration: number;
    voice: NarrationVoice;
    text: string;
  };
  error?: string;
}

export interface NarrationVoiceInfo {
  name: string;
  description: string;
}

export interface NarrationServiceStatus {
  status: string;
  service: string;
  model: string;
  via: string;
  available: boolean;
  voices: Record<NarrationVoice, NarrationVoiceInfo>;
  supportedSpeeds: {
    min: number;
    max: number;
    default: number;
  };
}

/**
 * Generate narration audio from text using OpenAI TTS HD
 */
export async function generateNarration(
  options: NarrationGenerationOptions,
): Promise<NarrationGenerationResponse> {
  const url = `${API_BASE_URL}/api/generate-narration`;
  return retryRequest(
    async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: "Failed to generate narration" }));
        throw new Error(error.error || "Failed to generate narration");
      }

      return response.json();
    },
    DEFAULT_RETRY_CONFIG,
    { method: "POST", url },
  );
}

/**
 * Get narration service status and available voices
 */
export async function getNarrationServiceStatus(): Promise<NarrationServiceStatus> {
  const url = `${API_BASE_URL}/api/generate-narration`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get narration service status");
  }

  return response.json();
}

/**
 * Update scene settings (including referenceImageUrls)
 */
export async function updateScene(
  sceneId: string,
  updates: Record<string, any>
): Promise<{ success: boolean; scene: any }> {
  return retryRequest(async () => {
    const response = await fetch(`${API_BASE_URL}/api/scenes/${sceneId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to update scene' }));
      throw new Error(error.error || 'Failed to update scene');
    }

    return response.json();
  });
}
