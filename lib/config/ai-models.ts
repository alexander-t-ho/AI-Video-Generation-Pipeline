/**
 * AI Model Configuration
 *
 * Centralized configuration for image and video generation models.
 * Models can be overridden via environment variables.
 */

// ============================================================================
// Available Model Options (for Dev Panel)
// ============================================================================

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  description?: string;
}

/**
 * Text Generation Models (for Storyboard)
 */
export const AVAILABLE_TEXT_MODELS: ModelOption[] = [
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    description: 'Most capable model for complex tasks',
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    description: 'Fast and cost-effective (default)',
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    description: 'Strong reasoning and creative writing',
  },
  {
    id: 'anthropic/claude-3-haiku',
    name: 'Claude 3 Haiku',
    provider: 'Anthropic',
    description: 'Fast and efficient',
  },
];

/**
 * Text-to-Image (T2I) Models
 */
export const AVAILABLE_T2I_MODELS: ModelOption[] = [
  {
    id: 'black-forest-labs/flux-1.1-pro',
    name: 'FLUX 1.1 Pro',
    provider: 'Black Forest Labs',
    description: 'Highest quality, photorealistic (default)',
  },
  {
    id: 'black-forest-labs/flux-dev',
    name: 'FLUX Dev',
    provider: 'Black Forest Labs',
    description: 'Open-weight development model',
  },
  {
    id: 'black-forest-labs/flux-schnell',
    name: 'FLUX Schnell',
    provider: 'Black Forest Labs',
    description: 'Fast generation, lower quality',
  },
  {
    id: 'stability-ai/sdxl',
    name: 'Stable Diffusion XL',
    provider: 'Stability AI',
    description: 'Versatile open-source model',
  },
];

/**
 * Image-to-Image (I2I) Models
 * Note: Currently using T2I models with IP-Adapter for I2I functionality
 */
export const AVAILABLE_I2I_MODELS: ModelOption[] = [
  {
    id: 'black-forest-labs/flux-1.1-pro',
    name: 'FLUX 1.1 Pro (IP-Adapter)',
    provider: 'Black Forest Labs',
    description: 'Best quality with reference images (default)',
  },
  {
    id: 'black-forest-labs/flux-kontext-pro',
    name: 'FLUX Kontext Pro',
    provider: 'Black Forest Labs',
    description: 'Advanced image editing and transformation',
  },
  {
    id: 'black-forest-labs/flux-dev',
    name: 'FLUX Dev (IP-Adapter)',
    provider: 'Black Forest Labs',
    description: 'Open-weight with reference support',
  },
  {
    id: 'stability-ai/sdxl',
    name: 'SDXL (IP-Adapter)',
    provider: 'Stability AI',
    description: 'Versatile image transformation',
  },
];

/**
 * Video Generation Models (Image-to-Video)
 */
export const AVAILABLE_VIDEO_MODELS: ModelOption[] = [
  {
    id: 'wan-video/wan-2.2-i2v-fast',
    name: 'WAN 2.2 (i2v-fast)',
    provider: 'WAN Video',
    description: 'Fast $0.05 per video (default)',
  },
  {
    id: 'wan-video/wan-2.5-i2v-fast:5be8b80ffe74f3d3a731693ddd98e7ee94100a0f4ae704bd58e93565977670f9',
    name: 'WAN 2.5 (i2v-fast)',
    provider: 'WAN Video',
    description: '$0.07/s',
  },
  {
    id: 'google/veo-3.1-fast',
    name: 'Google Veo 3.1 Fast',
    provider: 'Google',
    description: '$0.10/s no audio',
  },
  {
    id: 'google/veo-3.1',
    name: 'Google Veo 3.1',
    provider: 'Google',
    description: 'Premium quality $0.40/s',
  },
  {
    id: 'kwaivgi/kling-v2.5-turbo-proto',
    name: 'Kling V2.5 Turbo Proto',
    provider: 'Kuaishou',
    description: '$0.07/video',
  },
  {
    id: 'minimax/hailuo-2.3-fast',
    name: 'Hailuo 2.3 Fast',
    provider: 'MiniMax',
    description: '$0.19/video',
  },
  {
    id: 'luma/ray',
    name: 'Luma Ray',
    provider: 'Luma AI',
    description: 'Cinematic quality $0.45/video',
  },
];

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
    // Default: WAN 2.2 for fast, cost-effective generation
    return 'wan-video/wan-2.2-i2v-fast';
  }

  // Handle short aliases
  const normalized = envModel.toLowerCase().trim();

  // WAN 2.5 aliases
  if (normalized === 'wan2.5' || normalized === 'wan-2.5') {
    return 'wan-video/wan-2.5-i2v-fast:5be8b80ffe74f3d3a731693ddd98e7ee94100a0f4ae704bd58e93565977670f9';
  }

  // WAN 2.2 aliases (default)
  if (normalized === 'wan2.2' || normalized === 'wan-2.2') {
    return 'wan-video/wan-2.2-i2v-fast';
  }

  // Google Veo aliases
  if (normalized === 'veo' || normalized === 'veo-3.1') {
    return 'google/veo-3.1';
  }

  if (normalized === 'veo-fast' || normalized === 'veo-3.1-fast') {
    return 'google/veo-3.1-fast';
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
  if (model.includes('veo-3.1-fast')) return 'Google Veo 3.1 Fast';
  if (model.includes('veo') || model.includes('google')) return 'Google Veo 3.1';
  if (model.includes('luma') || model.includes('ray')) return 'Luma Ray';
  if (model.includes('kling')) return 'Kling V2.5 Turbo Proto';
  if (model.includes('hailuo')) return 'Hailuo 2.3 Fast';
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
 * - REPLICATE_VIDEO_MODEL: Model identifier or alias (default: wan2.2)
 *   Aliases: wan2.5, wan2.2, veo, veo-fast, luma, ray
 * - VIDEO_DURATION: Duration in seconds (default: 5, supports 5 or 10 for WAN)
 * - VIDEO_RESOLUTION: Resolution (default: 720p, supports 720p, 1080p, 4K)
 *
 * Example .env.local:
 * ```
 * REPLICATE_IMAGE_MODEL=black-forest-labs/flux-1.1-pro
 * REPLICATE_VIDEO_MODEL=wan2.2
 * VIDEO_DURATION=5
 * VIDEO_RESOLUTION=720p
 * ```
 */

