/**
 * Rate Limit Configuration for AI Models
 *
 * Defines concurrency limits for different models to prevent rate limiting
 * and optimize parallel generation performance.
 */

export interface RateLimitConfig {
  maxConcurrent: number;        // Maximum concurrent requests
  minDelayBetweenRequests?: number;  // Minimum ms between starting requests
}

/**
 * Image Model Rate Limits
 * Based on Replicate API limits and model-specific constraints
 */
export const IMAGE_RATE_LIMITS: Record<string, RateLimitConfig> = {
  // FLUX models - Generally support high concurrency
  // OPTIMIZED: Increased limits for faster parallel generation
  'black-forest-labs/flux-1.1-pro': {
    maxConcurrent: 15, // OPTIMIZED: 10 → 15
  },
  'black-forest-labs/flux-dev': {
    maxConcurrent: 15, // OPTIMIZED: 10 → 15
  },
  'black-forest-labs/flux-schnell': {
    maxConcurrent: 20, // OPTIMIZED: 15 → 20 (fast model)
  },
  'black-forest-labs/flux-pro': {
    maxConcurrent: 15, // OPTIMIZED: 10 → 15
  },

  // Runway Gen-4 models - More conservative limits
  // OPTIMIZED: Increased concurrency and reduced delays
  'runwayml/gen4-image': {
    maxConcurrent: 8, // OPTIMIZED: 5 → 8
    minDelayBetweenRequests: 250, // OPTIMIZED: 500 → 250
  },
  'runwayml/gen4-image-turbo': {
    maxConcurrent: 12, // OPTIMIZED: 8 → 12
  },

  // Stability AI models
  'stability-ai/sdxl': {
    maxConcurrent: 10,
  },
  'stability-ai/sd3-medium': {
    maxConcurrent: 8,
  },

  // Google models
  'google/imagen-4': {
    maxConcurrent: 5,
    minDelayBetweenRequests: 1000,
  },

  // Default for unknown models
  'default': {
    maxConcurrent: 5,
    minDelayBetweenRequests: 500,
  },
};

/**
 * Video Model Rate Limits
 * Video generation is more expensive, so limits are generally lower
 */
export const VIDEO_RATE_LIMITS: Record<string, RateLimitConfig> = {
  // WAN models - Fast and cheap, can handle more concurrency
  // OPTIMIZED: Increased limits for faster parallel generation
  'wan-video/wan-2.2-i2v-fast': {
    maxConcurrent: 15, // OPTIMIZED: 10 → 15
  },
  'wan-video/wan-2.5-i2v-fast': {
    maxConcurrent: 15, // OPTIMIZED: 10 → 15
  },

  // Google Veo - High quality, moderate concurrency
  // OPTIMIZED: Increased concurrency and reduced delays
  'google/veo-3.1': {
    maxConcurrent: 8, // OPTIMIZED: 5 → 8
    minDelayBetweenRequests: 500, // OPTIMIZED: 1000 → 500
  },
  'google/veo-3.1-fast': {
    maxConcurrent: 12, // OPTIMIZED: 8 → 12
  },

  // Runway Gen-4 - Premium model, conservative limits
  // OPTIMIZED: Increased concurrency and reduced delays
  'runwayml/gen4-turbo': {
    maxConcurrent: 8, // OPTIMIZED: 5 → 8
    minDelayBetweenRequests: 500, // OPTIMIZED: 1000 → 500
  },
  'runwayml/gen4-aleph': {
    maxConcurrent: 5, // OPTIMIZED: 3 → 5
    minDelayBetweenRequests: 1000, // OPTIMIZED: 1500 → 1000
  },

  // Luma Ray - High quality, limited concurrency
  'luma/ray': {
    maxConcurrent: 3,
    minDelayBetweenRequests: 2000,
  },
  'luma/ray-2': {
    maxConcurrent: 3,
    minDelayBetweenRequests: 2000,
  },

  // Kling models
  'kwaivgi/kling-v2.5-turbo-proto': {
    maxConcurrent: 6,
  },
  'kwaivgi/kling-v1.5-pro': {
    maxConcurrent: 4,
  },

  // MiniMax models
  'minimax/video-01': {
    maxConcurrent: 5,
  },
  'minimax/hailuo-2.3-fast': {
    maxConcurrent: 7,
  },

  // OpenAI Sora - Very limited
  'openai/sora-2-pro': {
    maxConcurrent: 2,
    minDelayBetweenRequests: 3000,
  },

  // Default for unknown models
  'default': {
    maxConcurrent: 3,
    minDelayBetweenRequests: 1000,
  },
};

/**
 * Gets rate limit configuration for an image model
 */
export function getImageRateLimit(modelId: string): RateLimitConfig {
  // Try exact match first
  if (IMAGE_RATE_LIMITS[modelId]) {
    return IMAGE_RATE_LIMITS[modelId];
  }

  // Try partial match (for models with version hashes)
  for (const [key, config] of Object.entries(IMAGE_RATE_LIMITS)) {
    if (modelId.includes(key) || key.includes(modelId.split(':')[0])) {
      return config;
    }
  }

  return IMAGE_RATE_LIMITS['default'];
}

/**
 * Gets rate limit configuration for a video model
 */
export function getVideoRateLimit(modelId: string): RateLimitConfig {
  // Try exact match first
  if (VIDEO_RATE_LIMITS[modelId]) {
    return VIDEO_RATE_LIMITS[modelId];
  }

  // Try partial match (for models with version hashes)
  for (const [key, config] of Object.entries(VIDEO_RATE_LIMITS)) {
    if (modelId.includes(key) || key.includes(modelId.split(':')[0])) {
      return config;
    }
  }

  return VIDEO_RATE_LIMITS['default'];
}
