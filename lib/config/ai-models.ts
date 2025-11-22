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
  supportedInputs?: string[]; // List of supported input parameters
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
    id: 'openai/gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'OpenAI',
    description: 'Previous generation flagship model',
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    description: 'Strong reasoning and creative writing',
  },
  {
    id: 'anthropic/claude-3-opus',
    name: 'Claude 3 Opus',
    provider: 'Anthropic',
    description: 'Most capable Claude model',
  },
  {
    id: 'anthropic/claude-3-haiku',
    name: 'Claude 3 Haiku',
    provider: 'Anthropic',
    description: 'Fast and efficient',
  },
  {
    id: 'google/gemini-pro-1.5',
    name: 'Gemini Pro 1.5',
    provider: 'Google',
    description: 'Large context window',
  },
  {
    id: 'meta-llama/llama-3.1-70b-instruct',
    name: 'Llama 3.1 70B',
    provider: 'Meta',
    description: 'Open-source, high performance',
  },
  {
    id: 'mistralai/mistral-large',
    name: 'Mistral Large',
    provider: 'Mistral AI',
    description: 'European AI powerhouse',
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
    description: 'Highest quality, photorealistic',
    supportedInputs: ['prompt', 'aspect_ratio', 'output_format', 'output_quality', 'safety_tolerance', 'seed'],
  },
  {
    id: 'black-forest-labs/flux-dev',
    name: 'FLUX Dev',
    provider: 'Black Forest Labs',
    description: 'Open-weight development model',
    supportedInputs: ['prompt', 'aspect_ratio', 'output_format', 'output_quality', 'num_outputs', 'seed'],
  },
  {
    id: 'black-forest-labs/flux-schnell',
    name: 'FLUX Schnell',
    provider: 'Black Forest Labs',
    description: 'Fast and reliable (default)',
    supportedInputs: ['prompt', 'aspect_ratio', 'output_format', 'output_quality', 'num_outputs', 'seed'],
  },
  {
    id: 'prunaai/flux-fast',
    name: 'FLUX Fast',
    provider: 'PrunaAI',
    description: 'Optimized for speed',
    supportedInputs: ['prompt', 'width', 'height', 'num_outputs', 'guidance_scale', 'num_inference_steps', 'seed'],
  },
  {
    id: 'black-forest-labs/flux-pro',
    name: 'FLUX Pro',
    provider: 'Black Forest Labs',
    description: 'Professional quality generation',
  },
  {
    id: 'stability-ai/sdxl',
    name: 'Stable Diffusion XL',
    provider: 'Stability AI',
    description: 'Versatile open-source model',
    supportedInputs: ['prompt', 'negative_prompt', 'width', 'height', 'num_outputs', 'guidance_scale', 'seed'],
  },
  {
    id: 'stability-ai/sd3-medium',
    name: 'Stable Diffusion 3 Medium',
    provider: 'Stability AI',
    description: 'Latest SD3 architecture',
  },
  {
    id: 'ideogram-ai/ideogram-v2',
    name: 'Ideogram V2',
    provider: 'Ideogram',
    description: 'Excellent text rendering',
  },
  {
    id: 'recraft-ai/recraft-v3',
    name: 'Recraft V3',
    provider: 'Recraft',
    description: 'High-quality vector-style images',
  },
  {
    id: 'google/imagen-4',
    name: 'Imagen 4',
    provider: 'Google',
    description: 'High-quality, fast text-to-image generation',
    supportedInputs: ['prompt', 'aspect_ratio', 'output_format', 'negative_prompt', 'seed'],
  },
];

/**
 * Image-to-Image (I2I) Models
 * Note: Currently using T2I models with IP-Adapter for I2I functionality
 * Runway Gen-4 Image models use reference_images parameter (not IP-Adapter)
 */
export const AVAILABLE_I2I_MODELS: ModelOption[] = [
  {
    id: 'runwayml/gen4-image',
    name: 'Runway Gen-4 Image',
    provider: 'Runway',
    description: 'Maximum consistency with reference images, best for Scene 0',
    supportedInputs: ['image', 'prompt', 'reference_image', 'aspect_ratio', 'seed'],
  },
  {
    id: 'runwayml/gen4-image-turbo',
    name: 'Runway Gen-4 Image Turbo',
    provider: 'Runway',
    description: 'Fast Gen-4 image generation with good consistency',
  },
  {
    id: 'black-forest-labs/flux-1.1-pro',
    name: 'FLUX 1.1 Pro (IP-Adapter)',
    provider: 'Black Forest Labs',
    description: 'Best quality with reference images',
    supportedInputs: ['prompt', 'image', 'ip_adapter_images', 'ip_adapter_scale', 'aspect_ratio', 'output_format', 'seed'],
  },
  {
    id: 'black-forest-labs/flux-kontext-pro',
    name: 'FLUX Kontext Pro',
    provider: 'Black Forest Labs',
    description: 'Advanced image editing and transformation',
    supportedInputs: ['prompt', 'image', 'mask', 'strength', 'output_format', 'guidance_scale', 'seed'],
  },
  {
    id: 'black-forest-labs/flux-dev',
    name: 'FLUX Dev (IP-Adapter)',
    provider: 'Black Forest Labs',
    description: 'Open-weight with reference support (default)',
    supportedInputs: ['prompt', 'image', 'ip_adapter_images', 'ip_adapter_scale', 'aspect_ratio', 'output_format', 'seed'],
  },
  {
    id: 'black-forest-labs/flux-schnell',
    name: 'FLUX Schnell (IP-Adapter)',
    provider: 'Black Forest Labs',
    description: 'Fast reference-based generation',
  },
  {
    id: 'black-forest-labs/flux-pro',
    name: 'FLUX Pro (IP-Adapter)',
    provider: 'Black Forest Labs',
    description: 'Professional quality with references',
  },
  {
    id: 'stability-ai/sdxl',
    name: 'SDXL (IP-Adapter)',
    provider: 'Stability AI',
    description: 'Versatile image transformation',
    supportedInputs: ['prompt', 'image', 'negative_prompt', 'strength', 'guidance_scale', 'num_outputs', 'seed'],
  },
  {
    id: 'google/nano-banana-pro',
    name: 'Nano Banana',
    provider: 'Google',
    description: 'Specialized for precise recoloring and color changes',
    supportedInputs: ['prompt', 'image'],
  },
  {
    id: 'stability-ai/sd3-medium',
    name: 'SD3 Medium (IP-Adapter)',
    provider: 'Stability AI',
    description: 'Latest architecture with references',
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
    supportedInputs: ['image', 'prompt', 'duration', 'resolution', 'negative_prompt', 'enable_prompt_expansion', 'seed'],
  },
  {
    id: 'wan-video/wan-2.5-i2v-fast:5be8b80ffe74f3d3a731693ddd98e7ee94100a0f4ae704bd58e93565977670f9',
    name: 'WAN 2.5 (i2v-fast)',
    provider: 'WAN Video',
    description: '$0.07/s improved quality',
    supportedInputs: ['image', 'prompt', 'duration', 'resolution', 'negative_prompt', 'enable_prompt_expansion', 'seed'],
  },
  {
    id: 'minimax/video-01',
    name: 'MiniMax Video-01',
    provider: 'MiniMax',
    description: 'High quality 6s videos',
  },
  {
    id: 'minimax/hailuo-2.3-fast',
    name: 'Hailuo 2.3 Fast',
    provider: 'MiniMax',
    description: '$0.19/video fast generation',
    supportedInputs: ['image', 'prompt', 'duration'],
  },
  {
    id: 'kwaivgi/kling-v2.5-turbo-proto',
    name: 'Kling V2.5 Turbo',
    provider: 'Kuaishou',
    description: '$0.07/video Chinese AI',
    supportedInputs: ['image', 'prompt', 'aspect_ratio', 'duration', 'negative_prompt', 'seed'],
  },
  {
    id: 'kwaivgi/kling-v1.5-pro',
    name: 'Kling V1.5 Pro',
    provider: 'Kuaishou',
    description: 'Professional quality 10s videos',
  },
  {
    id: 'luma/ray',
    name: 'Luma Ray',
    provider: 'Luma AI',
    description: 'Cinematic quality $0.45/video',
    supportedInputs: ['image', 'prompt', 'last_frame', 'aspect_ratio', 'loop'],
  },
  {
    id: 'luma/ray-2',
    name: 'Luma Ray 2',
    provider: 'Luma AI',
    description: 'Next-gen cinematic quality',
  },
  {
    id: 'google/veo-3.1',
    name: 'Google Veo 3.1',
    provider: 'Google',
    description: 'Premium quality $0.40/s (default)',
    supportedInputs: ['image', 'prompt', 'last_frame', 'aspect_ratio', 'duration', 'seed', 'reference_images'],
  },
  {
    id: 'google/veo-3.1-fast',
    name: 'Google Veo 3.1 Fast',
    provider: 'Google',
    description: '$0.10/s no audio',
    supportedInputs: ['image', 'prompt', 'last_frame', 'aspect_ratio', 'duration', 'seed', 'reference_images'],
  },
  {
    id: 'runwayml/gen4-turbo',
    name: 'Runway Gen-4 Turbo',
    provider: 'Runway',
    description: 'Fast image-to-video $0.05/s',
    supportedInputs: ['image', 'prompt', 'aspect_ratio', 'duration', 'seed'],
  },
  {
    id: 'runwayml/gen4-aleph',
    name: 'Runway Gen-4 Aleph',
    provider: 'Runway',
    description: 'Video editing & transformation $0.18/s',
    supportedInputs: ['video', 'prompt', 'aspect_ratio', 'reference_image', 'seed'],
  },
  {
    id: 'runway/gen-3-alpha-turbo',
    name: 'Runway Gen-3 Alpha Turbo',
    provider: 'Runway',
    description: 'Fast creative generation',
  },
  {
    id: 'stability-ai/stable-video-diffusion',
    name: 'Stable Video Diffusion',
    provider: 'Stability AI',
    description: 'Open-source video generation',
  },
  {
    id: 'openai/sora-2-pro',
    name: 'Sora 2 Pro',
    provider: 'OpenAI',
    description: 'Advanced video generation with high realism',
    supportedInputs: ['image', 'prompt', 'duration', 'aspect_ratio', 'seed'],
  },
];

// ============================================================================
// Image Generation Configuration
// ============================================================================

export const IMAGE_CONFIG = {
  // Model identifier for Replicate
  // Note: FLUX models on Replicate require the full version hash
  // flux-schnell is the fastest and most reliable for testing
  model: process.env.REPLICATE_IMAGE_MODEL || 'black-forest-labs/flux-schnell',
  
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
    // Default: Google Veo 3.1 for high quality generation
    return 'google/veo-3.1';
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

  // Runway Gen-4 aliases
  if (normalized === 'gen4' || normalized === 'gen4-aleph' || normalized === 'runway-gen4') {
    return 'runwayml/gen4-aleph';
  }

  if (normalized === 'gen4-turbo' || normalized === 'runway-gen4-turbo') {
    return 'runwayml/gen4-turbo';
  }

  // OpenAI Sora aliases
  if (normalized === 'sora' || normalized === 'sora-2-pro' || normalized === 'sora-2') {
    return 'openai/sora-2-pro';
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
    provider: getVideoModelProvider(VIDEO_CONFIG.model),
    type: 'image-to-video',
    description: 'Image-to-video generation with motion',
  },
} as const;

function getVideoModelProvider(model: string): string {
  if (model.includes('veo') || model.includes('google')) return 'Google';
  if (model.includes('gen4') || model.includes('runway')) return 'Runway';
  if (model.includes('wan')) return 'WAN Video';
  if (model.includes('luma') || model.includes('ray')) return 'Luma AI';
  if (model.includes('kling')) return 'Kuaishou';
  if (model.includes('hailuo') || model.includes('minimax')) return 'MiniMax';
  if (model.includes('sora') || model.includes('openai')) return 'OpenAI';
  return 'Replicate';
}

function getVideoModelName(model: string): string {
  // Check specific versions first, then fall back to generic matches
  if (model.includes('veo-3.1-fast')) return 'Google Veo 3.1 Fast';
  if (model.includes('veo') || model.includes('google')) return 'Google Veo 3.1';
  if (model.includes('gen4-aleph')) return 'Runway Gen-4 Aleph';
  if (model.includes('gen4-turbo')) return 'Runway Gen-4 Turbo';
  if (model.includes('gen4') || model.includes('runway')) return 'Runway Gen-4';
  if (model.includes('wan-2.5')) return 'WAN 2.5 (i2v-fast)';
  if (model.includes('wan-2.2')) return 'WAN 2.2 (i2v-fast)';
  if (model.includes('luma') || model.includes('ray')) return 'Luma Ray';
  if (model.includes('kling')) return 'Kling V2.5 Turbo Proto';
  if (model.includes('hailuo')) return 'Hailuo 2.3 Fast';
  if (model.includes('sora')) return 'Sora 2 Pro';
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
 * - REPLICATE_VIDEO_MODEL: Model identifier or alias (default: google/veo-3.1)
 *   Aliases: veo, veo-3.1, veo-fast, wan2.5, wan2.2, luma, ray, gen4, gen4-turbo, sora
 * - VIDEO_DURATION: Duration in seconds (default: 8 for Veo, 5 for others; Veo accepts only 4, 6, or 8)
 * - VIDEO_RESOLUTION: Resolution (default: 720p, supports 720p, 1080p, 4K)
 *
 * Example .env.local:
 * ```
 * REPLICATE_IMAGE_MODEL=black-forest-labs/flux-1.1-pro
 * REPLICATE_VIDEO_MODEL=google/veo-3.1
 * VIDEO_DURATION=8
 * VIDEO_RESOLUTION=720p
 * ```
 */

