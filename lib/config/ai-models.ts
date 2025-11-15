/**
 * AI Model Configuration
 * 
 * Centralized configuration for image and video generation models.
 * Models can be overridden via environment variables.
 */

// ============================================================================
// Image Generation Configuration
// ============================================================================

export const IMAGE_CONFIG = {
  // Model identifier for Replicate
  model: process.env.REPLICATE_IMAGE_MODEL || 'black-forest-labs/flux-1.1-pro',
  
  // Image generation parameters
  aspectRatio: '16:9' as const,
  outputFormat: 'png' as const,
  outputQuality: 90,
  safetyTolerance: 2,
  
  // Polling configuration
  pollInterval: 2000, // 2 seconds
  pollTimeout: 300000, // 5 minutes
  maxRetries: 3,
} as const;

// ============================================================================
// Video Generation Configuration
// ============================================================================

/**
 * Resolves video model aliases to full Replicate model identifiers
 */
function resolveVideoModel(envModel?: string): string {
  if (!envModel) {
    // Default: WAN 2.5 with pinned version for stability
    return 'wan-video/wan-2.5-i2v-fast:5be8b80ffe74f3d3a731693ddd98e7ee94100a0f4ae704bd58e93565977670f9';
  }
  
  // Handle short aliases
  const normalized = envModel.toLowerCase().trim();
  
  // WAN 2.5 aliases
  if (normalized === 'wan2.5' || normalized === 'wan-2.5') {
    return 'wan-video/wan-2.5-i2v-fast:5be8b80ffe74f3d3a731693ddd98e7ee94100a0f4ae704bd58e93565977670f9';
  }
  
  // WAN 2.2 aliases
  if (normalized === 'wan2.2' || normalized === 'wan-2.2') {
    return 'wan-video/wan-2.2-i2v-fast';
  }
  
  // WAN 2.1 aliases
  if (normalized === 'wan2.1' || normalized === 'wan-2.1') {
    return 'wan-video/wan-2.1-i2v-fast';
  }
  
  // Luma Ray aliases
  if (normalized === 'luma' || normalized === 'ray') {
    return 'luma/ray';
  }
  
  // Return as-is if it's already a full identifier
  return envModel;
}

export const VIDEO_CONFIG = {
  // Model identifier for Replicate (supports aliases)
  model: resolveVideoModel(process.env.REPLICATE_VIDEO_MODEL),
  
  // Video generation parameters
  duration: parseInt(process.env.VIDEO_DURATION || '5', 10), // 5 or 10 seconds for WAN models
  resolution: (process.env.VIDEO_RESOLUTION || '720p') as '720p' | '1080p' | '4K',
  
  // Polling configuration
  pollInterval: 2000, // 2 seconds
  pollTimeout: 600000, // 10 minutes (videos take longer)
  maxPollAttempts: 300, // 10 minutes total (300 * 2s)
  maxRetries: 2,
  
  // Download configuration
  downloadRetries: 3,
} as const;

// ============================================================================
// Model Information
// ============================================================================

export const MODEL_INFO = {
  image: {
    name: 'FLUX 1.1 Pro',
    provider: 'Black Forest Labs',
    type: 'text-to-image',
    description: 'High-quality text-to-image generation',
  },
  video: {
    name: getVideoModelName(VIDEO_CONFIG.model),
    provider: 'Replicate',
    type: 'image-to-video',
    description: 'Image-to-video generation with motion',
  },
} as const;

function getVideoModelName(model: string): string {
  if (model.includes('wan-2.5')) return 'WAN 2.5 (i2v-fast)';
  if (model.includes('wan-2.2')) return 'WAN 2.2 (i2v-fast)';
  if (model.includes('wan-2.1')) return 'WAN 2.1 (i2v-fast)';
  if (model.includes('luma') || model.includes('ray')) return 'Luma Ray';
  return 'Custom Model';
}

// ============================================================================
// Environment Variable Documentation
// ============================================================================

/**
 * Environment Variables:
 * 
 * Image Generation:
 * - REPLICATE_IMAGE_MODEL: Full model identifier (default: black-forest-labs/flux-1.1-pro)
 * 
 * Video Generation:
 * - REPLICATE_VIDEO_MODEL: Model identifier or alias (default: wan2.5)
 *   Aliases: wan2.5, wan2.2, wan2.1, luma, ray
 * - VIDEO_DURATION: Duration in seconds (default: 5, supports 5 or 10 for WAN)
 * - VIDEO_RESOLUTION: Resolution (default: 720p, supports 720p, 1080p, 4K)
 * 
 * Example .env.local:
 * ```
 * REPLICATE_IMAGE_MODEL=black-forest-labs/flux-1.1-pro
 * REPLICATE_VIDEO_MODEL=wan2.5
 * VIDEO_DURATION=5
 * VIDEO_RESOLUTION=720p
 * ```
 */

