/**
 * Comprehensive Model API Input/Output Schemas
 * 
 * This file defines detailed schemas for all AI model inputs and outputs used in the pipeline.
 * Each schema includes parameter definitions, types, defaults, validation rules, and descriptions.
 * 
 * Usage:
 * - Get schema: getModelSchema('black-forest-labs/flux-schnell')
 * - Validate inputs: validateModelInput(modelId, inputParams)
 * - Get defaults: getModelDefaults(modelId)
 * - Check support: getSupportedParameters(modelId)
 */

// ============================================================================
// Base Schema Types
// ============================================================================

/**
 * Base parameter definition for model inputs
 */
export interface ModelParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  default?: any;
  description: string;
  validation?: {
    min?: number;
    max?: number;
    enum?: any[];
    pattern?: string;
  };
  examples?: any[];
}

/**
 * Model input schema definition
 */
export interface ModelInputSchema {
  parameters: Record<string, ModelParameter>;
  requiredParameters: string[];
  optionalParameters: string[];
  validationRules?: {
    mutuallyExclusive?: string[][];
    dependencies?: Record<string, string[]>;
  };
}

/**
 * Model output schema definition
 */
export interface ModelOutputSchema {
  type: 'image' | 'video' | 'text' | 'prediction';
  format: string;
  structure: Record<string, any>;
  examples?: any[];
}

/**
 * Complete model schema combining input and output definitions
 */
export interface ModelSchema {
  id: string;
  name: string;
  provider: string;
  type: 'text-to-image' | 'image-to-image' | 'text-to-video' | 'image-to-video' | 'text-generation' | 'image-processing';
  input: ModelInputSchema;
  output: ModelOutputSchema;
  capabilities: string[];
  limitations?: string[];
  notes?: string[];
}

// ============================================================================
// Common Parameter Definitions
// ============================================================================

const COMMON_PARAMETERS = {
  prompt: {
    name: 'prompt',
    type: 'string' as const,
    required: true,
    description: 'Text prompt describing what to generate',
    validation: {
      min: 1,
      max: 1000
    },
    examples: ['A beautiful sunset over mountains', 'Professional product photography of a luxury watch']
  },

  negative_prompt: {
    name: 'negative_prompt',
    type: 'string' as const,
    required: false,
    description: 'Text describing what to avoid in generation',
    validation: {
      max: 500
    },
    examples: ['blurry, low quality, distorted', 'people, text, logos']
  },

  seed: {
    name: 'seed',
    type: 'number' as const,
    required: false,
    description: 'Random seed for reproducible generation',
    validation: {
      min: 0,
      max: 2147483647
    }
  },

  num_outputs: {
    name: 'num_outputs',
    type: 'number' as const,
    required: false,
    default: 1,
    description: 'Number of images/videos to generate',
    validation: {
      min: 1,
      max: 4
    }
  },

  aspect_ratio: {
    name: 'aspect_ratio',
    type: 'string' as const,
    required: false,
    default: '16:9',
    description: 'Aspect ratio of generated content',
    validation: {
      enum: ['1:1', '4:3', '16:9', '21:9', '3:4', '9:16']
    }
  },

  output_format: {
    name: 'output_format',
    type: 'string' as const,
    required: false,
    default: 'png',
    description: 'Output file format',
    validation: {
      enum: ['png', 'jpg', 'webp']
    }
  },

  output_quality: {
    name: 'output_quality',
    type: 'number' as const,
    required: false,
    default: 90,
    description: 'Output quality (1-100)',
    validation: {
      min: 1,
      max: 100
    }
  },

  guidance_scale: {
    name: 'guidance_scale',
    type: 'number' as const,
    required: false,
    default: 7.5,
    description: 'How closely to follow the prompt (higher = more faithful to prompt)',
    validation: {
      min: 1,
      max: 20
    }
  },

  num_inference_steps: {
    name: 'num_inference_steps',
    type: 'number' as const,
    required: false,
    default: 20,
    description: 'Number of denoising steps (higher = better quality, slower)',
    validation: {
      min: 1,
      max: 100
    }
  },

  image: {
    name: 'image',
    type: 'string' as const,
    required: true,
    description: 'Input image URL or base64 string',
    examples: ['https://example.com/input.jpg', 'data:image/png;base64,...']
  },

  video: {
    name: 'video',
    type: 'string' as const,
    required: true,
    description: 'Input video URL',
    examples: ['https://example.com/input.mp4']
  }
};

// ============================================================================
// Text-to-Image Model Schemas
// ============================================================================

export const TEXT_TO_IMAGE_SCHEMAS: Record<string, ModelSchema> = {
  'black-forest-labs/flux-1.1-pro': {
    id: 'black-forest-labs/flux-1.1-pro',
    name: 'FLUX 1.1 Pro',
    provider: 'Black Forest Labs',
    type: 'text-to-image',
    input: {
      parameters: {
        prompt: COMMON_PARAMETERS.prompt,
        aspect_ratio: COMMON_PARAMETERS.aspect_ratio,
        output_format: COMMON_PARAMETERS.output_format,
        output_quality: COMMON_PARAMETERS.output_quality,
        safety_tolerance: {
          name: 'safety_tolerance',
          type: 'number' as const,
          required: false,
          default: 2,
          description: 'Safety tolerance level (1-5, higher = more restrictive)',
          validation: { min: 1, max: 5 }
        },
        seed: COMMON_PARAMETERS.seed
      },
      requiredParameters: ['prompt'],
      optionalParameters: ['aspect_ratio', 'output_format', 'output_quality', 'safety_tolerance', 'seed']
    },
    output: {
      type: 'image',
      format: 'url',
      structure: {
        type: 'string',
        description: 'URL of generated image'
      }
    },
    capabilities: ['high-quality', 'photorealistic', 'fast', 'safety-filter'],
    limitations: ['no-ip-adapter', 'no-batch-generation']
  },

  'black-forest-labs/flux-dev': {
    id: 'black-forest-labs/flux-dev',
    name: 'FLUX Dev',
    provider: 'Black Forest Labs',
    type: 'text-to-image',
    input: {
      parameters: {
        prompt: COMMON_PARAMETERS.prompt,
        aspect_ratio: COMMON_PARAMETERS.aspect_ratio,
        output_format: COMMON_PARAMETERS.output_format,
        output_quality: COMMON_PARAMETERS.output_quality,
        num_outputs: COMMON_PARAMETERS.num_outputs,
        seed: COMMON_PARAMETERS.seed
      },
      requiredParameters: ['prompt'],
      optionalParameters: ['aspect_ratio', 'output_format', 'output_quality', 'num_outputs', 'seed']
    },
    output: {
      type: 'image',
      format: 'url',
      structure: {
        type: 'array',
        items: { type: 'string', description: 'URL of generated image' }
      }
    },
    capabilities: ['open-source', 'customizable', 'batch-generation'],
    limitations: []
  },

  'black-forest-labs/flux-schnell': {
    id: 'black-forest-labs/flux-schnell',
    name: 'FLUX Schnell',
    provider: 'Black Forest Labs',
    type: 'text-to-image',
    input: {
      parameters: {
        prompt: COMMON_PARAMETERS.prompt,
        aspect_ratio: COMMON_PARAMETERS.aspect_ratio,
        output_format: COMMON_PARAMETERS.output_format,
        output_quality: COMMON_PARAMETERS.output_quality,
        num_outputs: COMMON_PARAMETERS.num_outputs,
        seed: COMMON_PARAMETERS.seed
      },
      requiredParameters: ['prompt'],
      optionalParameters: ['aspect_ratio', 'output_format', 'output_quality', 'num_outputs', 'seed']
    },
    output: {
      type: 'image',
      format: 'url',
      structure: {
        type: 'array',
        items: { type: 'string', description: 'URL of generated image' }
      }
    },
    capabilities: ['fast', 'reliable', 'cost-effective', 'batch-generation'],
    limitations: ['fixed-steps']
  },

  'stability-ai/sdxl': {
    id: 'stability-ai/sdxl',
    name: 'Stable Diffusion XL',
    provider: 'Stability AI',
    type: 'text-to-image',
    input: {
      parameters: {
        prompt: COMMON_PARAMETERS.prompt,
        negative_prompt: COMMON_PARAMETERS.negative_prompt,
        width: {
          name: 'width',
          type: 'number' as const,
          required: false,
          default: 1024,
          description: 'Width of generated image',
          validation: { min: 512, max: 2048 }
        },
        height: {
          name: 'height',
          type: 'number' as const,
          required: false,
          default: 1024,
          description: 'Height of generated image',
          validation: { min: 512, max: 2048 }
        },
        num_outputs: COMMON_PARAMETERS.num_outputs,
        guidance_scale: COMMON_PARAMETERS.guidance_scale,
        seed: COMMON_PARAMETERS.seed
      },
      requiredParameters: ['prompt'],
      optionalParameters: ['negative_prompt', 'width', 'height', 'num_outputs', 'guidance_scale', 'seed']
    },
    output: {
      type: 'image',
      format: 'url',
      structure: {
        type: 'array',
        items: { type: 'string' }
      }
    },
    capabilities: ['open-source', 'negative-prompt', 'customizable', 'batch-generation'],
    limitations: []
  }
};

// ============================================================================
// Image-to-Image Model Schemas
// ============================================================================

export const IMAGE_TO_IMAGE_SCHEMAS: Record<string, ModelSchema> = {
  'runwayml/gen4-image': {
    id: 'runwayml/gen4-image',
    name: 'Runway Gen-4 Image',
    provider: 'Runway',
    type: 'image-to-image',
    input: {
      parameters: {
        image: { ...COMMON_PARAMETERS.image, required: false },
        prompt: COMMON_PARAMETERS.prompt,
        reference_images: {
          name: 'reference_images',
          type: 'array' as const,
          required: false,
          description: 'Array of reference image URLs for object consistency',
          examples: [['https://example.com/ref1.jpg', 'https://example.com/ref2.jpg']]
        },
        aspect_ratio: COMMON_PARAMETERS.aspect_ratio,
        seed: COMMON_PARAMETERS.seed
      },
      requiredParameters: ['prompt'],
      optionalParameters: ['image', 'reference_images', 'aspect_ratio', 'seed']
    },
    output: {
      type: 'image',
      format: 'url',
      structure: {
        type: 'string',
        description: 'URL of generated image'
      }
    },
    capabilities: ['reference-consistency', 'high-quality', 'scene-continuity'],
    limitations: [],
    notes: ['Uses reference_images parameter instead of IP-Adapter', 'Best for Scene 0 with character consistency']
  },

  'black-forest-labs/flux-1.1-pro-i2i': {
    id: 'black-forest-labs/flux-1.1-pro',
    name: 'FLUX 1.1 Pro (IP-Adapter)',
    provider: 'Black Forest Labs',
    type: 'image-to-image',
    input: {
      parameters: {
        prompt: COMMON_PARAMETERS.prompt,
        image: COMMON_PARAMETERS.image,
        ip_adapter_images: {
          name: 'ip_adapter_images',
          type: 'array' as const,
          required: false,
          description: 'Array of reference image URLs for IP-Adapter style transfer',
          examples: [['https://example.com/ref1.jpg']]
        },
        ip_adapter_scale: {
          name: 'ip_adapter_scale',
          type: 'number' as const,
          required: false,
          default: 0.7,
          description: 'IP-Adapter influence strength (0-1, higher = more influence)',
          validation: { min: 0, max: 1 }
        },
        aspect_ratio: COMMON_PARAMETERS.aspect_ratio,
        output_format: COMMON_PARAMETERS.output_format,
        seed: COMMON_PARAMETERS.seed
      },
      requiredParameters: ['prompt', 'image'],
      optionalParameters: ['ip_adapter_images', 'ip_adapter_scale', 'aspect_ratio', 'output_format', 'seed']
    },
    output: {
      type: 'image',
      format: 'url',
      structure: {
        type: 'string'
      }
    },
    capabilities: ['ip-adapter', 'reference-consistency', 'high-quality'],
    limitations: [],
    notes: ['Uses IP-Adapter for reference image influence', 'Can combine with base image for I2I']
  },

  'black-forest-labs/flux-dev-i2i': {
    id: 'black-forest-labs/flux-dev',
    name: 'FLUX Dev (IP-Adapter)',
    provider: 'Black Forest Labs',
    type: 'image-to-image',
    input: {
      parameters: {
        prompt: COMMON_PARAMETERS.prompt,
        image: COMMON_PARAMETERS.image,
        ip_adapter_images: {
          name: 'ip_adapter_images',
          type: 'array' as const,
          required: false,
          description: 'Array of reference image URLs for IP-Adapter',
          examples: [['https://example.com/ref1.jpg']]
        },
        ip_adapter_scale: {
          name: 'ip_adapter_scale',
          type: 'number' as const,
          required: false,
          default: 0.7,
          description: 'IP-Adapter influence strength (0-1)',
          validation: { min: 0, max: 1 }
        },
        aspect_ratio: COMMON_PARAMETERS.aspect_ratio,
        output_format: COMMON_PARAMETERS.output_format,
        seed: COMMON_PARAMETERS.seed
      },
      requiredParameters: ['prompt', 'image'],
      optionalParameters: ['ip_adapter_images', 'ip_adapter_scale', 'aspect_ratio', 'output_format', 'seed']
    },
    output: {
      type: 'image',
      format: 'url',
      structure: {
        type: 'string'
      }
    },
    capabilities: ['ip-adapter', 'reference-consistency', 'open-source'],
    limitations: []
  },

  'black-forest-labs/flux-schnell-i2i': {
    id: 'black-forest-labs/flux-schnell',
    name: 'FLUX Schnell (IP-Adapter)',
    provider: 'Black Forest Labs',
    type: 'image-to-image',
    input: {
      parameters: {
        prompt: COMMON_PARAMETERS.prompt,
        image: COMMON_PARAMETERS.image,
        ip_adapter_images: {
          name: 'ip_adapter_images',
          type: 'array' as const,
          required: false,
          description: 'Array of reference image URLs for IP-Adapter',
          examples: [['https://example.com/ref1.jpg']]
        },
        ip_adapter_scale: {
          name: 'ip_adapter_scale',
          type: 'number' as const,
          required: false,
          default: 0.7,
          description: 'IP-Adapter influence strength (0-1)',
          validation: { min: 0, max: 1 }
        },
        aspect_ratio: COMMON_PARAMETERS.aspect_ratio,
        output_format: COMMON_PARAMETERS.output_format,
        seed: COMMON_PARAMETERS.seed
      },
      requiredParameters: ['prompt', 'image'],
      optionalParameters: ['ip_adapter_images', 'ip_adapter_scale', 'aspect_ratio', 'output_format', 'seed']
    },
    output: {
      type: 'image',
      format: 'url',
      structure: {
        type: 'string'
      }
    },
    capabilities: ['ip-adapter', 'fast', 'cost-effective'],
    limitations: []
  },

  'google/nano-banana': {
    id: 'google/nano-banana',
    name: 'Nano Banana',
    provider: 'Google',
    type: 'image-to-image',
    input: {
      parameters: {
        prompt: COMMON_PARAMETERS.prompt,
        image_input: {
          name: 'image_input',
          type: 'array' as const,
          required: true,
          description: 'Array of input image URLs (typically one image)',
          examples: [['https://example.com/input.jpg']]
        },
        aspect_ratio: {
          name: 'aspect_ratio',
          type: 'string' as const,
          required: false,
          default: 'match_input_image',
          description: 'Aspect ratio or match input',
          validation: { enum: ['1:1', '4:3', '16:9', '21:9', '3:4', '9:16', 'match_input_image'] }
        },
        output_format: {
          name: 'output_format',
          type: 'string' as const,
          required: false,
          default: 'jpg',
          description: 'Output format',
          validation: { enum: ['jpg', 'png'] }
        }
      },
      requiredParameters: ['prompt', 'image_input'],
      optionalParameters: ['aspect_ratio', 'output_format']
    },
    output: {
      type: 'image',
      format: 'url',
      structure: {
        type: 'string'
      }
    },
    capabilities: ['recoloring', 'color-changes', 'precise-edits'],
    limitations: ['no-ip-adapter', 'limited-parameters'],
    notes: ['Specialized for recoloring and color changes', 'Uses image_input array instead of image parameter']
  },

  'stability-ai/sdxl-i2i': {
    id: 'stability-ai/sdxl',
    name: 'SDXL (IP-Adapter)',
    provider: 'Stability AI',
    type: 'image-to-image',
    input: {
      parameters: {
        prompt: COMMON_PARAMETERS.prompt,
        image: COMMON_PARAMETERS.image,
        negative_prompt: COMMON_PARAMETERS.negative_prompt,
        strength: {
          name: 'strength',
          type: 'number' as const,
          required: false,
          default: 0.8,
          description: 'How much to transform the image (0-1, higher = more change)',
          validation: { min: 0, max: 1 }
        },
        guidance_scale: COMMON_PARAMETERS.guidance_scale,
        num_outputs: COMMON_PARAMETERS.num_outputs,
        seed: COMMON_PARAMETERS.seed
      },
      requiredParameters: ['prompt', 'image'],
      optionalParameters: ['negative_prompt', 'strength', 'guidance_scale', 'num_outputs', 'seed']
    },
    output: {
      type: 'image',
      format: 'url',
      structure: {
        type: 'array',
        items: { type: 'string' }
      }
    },
    capabilities: ['negative-prompt', 'strength-control', 'batch-generation'],
    limitations: []
  }
};

// ============================================================================
// Video Generation Model Schemas
// ============================================================================

export const VIDEO_SCHEMAS: Record<string, ModelSchema> = {
  'wan-video/wan-2.2-i2v-fast': {
    id: 'wan-video/wan-2.2-i2v-fast',
    name: 'WAN 2.2 (i2v-fast)',
    provider: 'WAN Video',
    type: 'image-to-video',
    input: {
      parameters: {
        image: COMMON_PARAMETERS.image,
        prompt: COMMON_PARAMETERS.prompt,
        duration: {
          name: 'duration',
          type: 'number' as const,
          required: false,
          default: 5,
          description: 'Video duration in seconds (5 or 10)',
          validation: { enum: [5, 10] }
        },
        resolution: {
          name: 'resolution',
          type: 'string' as const,
          required: false,
          default: '720p',
          description: 'Video resolution',
          validation: { enum: ['720p', '1080p', '4K'] }
        },
        negative_prompt: COMMON_PARAMETERS.negative_prompt,
        enable_prompt_expansion: {
          name: 'enable_prompt_expansion',
          type: 'boolean' as const,
          required: false,
          default: true,
          description: 'Enable automatic prompt optimization'
        },
        seed: COMMON_PARAMETERS.seed
      },
      requiredParameters: ['image', 'prompt'],
      optionalParameters: ['duration', 'resolution', 'negative_prompt', 'enable_prompt_expansion', 'seed']
    },
    output: {
      type: 'video',
      format: 'mp4',
      structure: {
        type: 'string',
        description: 'URL of generated video'
      }
    },
    capabilities: ['fast', 'cost-effective', 'motion-from-image', 'prompt-expansion'],
    limitations: ['fixed-duration-options'],
    notes: ['Cost: $0.05 per video', 'Duration limited to 5 or 10 seconds']
  },

  'wan-video/wan-2.5-i2v-fast': {
    id: 'wan-video/wan-2.5-i2v-fast:5be8b80ffe74f3d3a731693ddd98e7ee94100a0f4ae704bd58e93565977670f9',
    name: 'WAN 2.5 (i2v-fast)',
    provider: 'WAN Video',
    type: 'image-to-video',
    input: {
      parameters: {
        image: COMMON_PARAMETERS.image,
        prompt: COMMON_PARAMETERS.prompt,
        duration: {
          name: 'duration',
          type: 'number' as const,
          required: false,
          default: 5,
          description: 'Video duration in seconds (5 or 10)',
          validation: { enum: [5, 10] }
        },
        resolution: {
          name: 'resolution',
          type: 'string' as const,
          required: false,
          default: '720p',
          description: 'Video resolution',
          validation: { enum: ['720p', '1080p', '4K'] }
        },
        negative_prompt: COMMON_PARAMETERS.negative_prompt,
        enable_prompt_expansion: {
          name: 'enable_prompt_expansion',
          type: 'boolean' as const,
          required: false,
          default: true,
          description: 'Enable automatic prompt optimization'
        },
        seed: COMMON_PARAMETERS.seed
      },
      requiredParameters: ['image', 'prompt'],
      optionalParameters: ['duration', 'resolution', 'negative_prompt', 'enable_prompt_expansion', 'seed']
    },
    output: {
      type: 'video',
      format: 'mp4',
      structure: {
        type: 'string'
      }
    },
    capabilities: ['fast', 'improved-quality', 'motion-from-image', 'prompt-expansion'],
    limitations: ['fixed-duration-options'],
    notes: ['Cost: $0.07 per second', 'Improved quality over 2.2']
  },

  'runwayml/gen4-turbo': {
    id: 'runwayml/gen4-turbo',
    name: 'Runway Gen-4 Turbo',
    provider: 'Runway',
    type: 'image-to-video',
    input: {
      parameters: {
        image: COMMON_PARAMETERS.image,
        prompt: COMMON_PARAMETERS.prompt,
        aspect_ratio: COMMON_PARAMETERS.aspect_ratio,
        duration: {
          name: 'duration',
          type: 'number' as const,
          required: false,
          default: 5,
          description: 'Video duration in seconds',
          validation: { min: 5, max: 10 }
        },
        seed: COMMON_PARAMETERS.seed
      },
      requiredParameters: ['image', 'prompt'],
      optionalParameters: ['aspect_ratio', 'duration', 'seed']
    },
    output: {
      type: 'video',
      format: 'mp4',
      structure: {
        type: 'string'
      }
    },
    capabilities: ['fast', 'high-quality', 'flexible-duration'],
    limitations: [],
    notes: ['Cost: $0.05 per second', 'Fast image-to-video generation']
  },

  'runwayml/gen4-aleph': {
    id: 'runwayml/gen4-aleph',
    name: 'Runway Gen-4 Aleph',
    provider: 'Runway',
    type: 'image-to-video',
    input: {
      parameters: {
        video: COMMON_PARAMETERS.video,
        prompt: COMMON_PARAMETERS.prompt,
        aspect_ratio: COMMON_PARAMETERS.aspect_ratio,
        reference_image: {
          name: 'reference_image',
          type: 'string' as const,
          required: false,
          description: 'Reference image URL for style transfer or character consistency'
        },
        seed: COMMON_PARAMETERS.seed
      },
      requiredParameters: ['video', 'prompt'],
      optionalParameters: ['aspect_ratio', 'reference_image', 'seed']
    },
    output: {
      type: 'video',
      format: 'mp4',
      structure: {
        type: 'string'
      }
    },
    capabilities: ['video-editing', 'style-transfer', 'high-quality', 'reference-consistency'],
    limitations: ['requires-input-video'],
    notes: ['Cost: $0.18 per second', 'Video editing and transformation', 'Best for Scene 0→1 transitions']
  },

  'luma/ray': {
    id: 'luma/ray',
    name: 'Luma Ray',
    provider: 'Luma AI',
    type: 'image-to-video',
    input: {
      parameters: {
        image: COMMON_PARAMETERS.image,
        prompt: COMMON_PARAMETERS.prompt,
        last_frame: {
          name: 'last_frame',
          type: 'string' as const,
          required: false,
          description: 'URL of the last frame for guided motion'
        },
        aspect_ratio: COMMON_PARAMETERS.aspect_ratio,
        loop: {
          name: 'loop',
          type: 'boolean' as const,
          required: false,
          default: false,
          description: 'Create a looping video'
        }
      },
      requiredParameters: ['image', 'prompt'],
      optionalParameters: ['last_frame', 'aspect_ratio', 'loop']
    },
    output: {
      type: 'video',
      format: 'mp4',
      structure: {
        type: 'string'
      }
    },
    capabilities: ['cinematic-quality', 'last-frame-control', 'looping'],
    limitations: [],
    notes: ['Cost: $0.45 per video', 'High cinematic quality', 'Supports guided motion with last frame']
  },

  'google/veo-3.1-fast': {
    id: 'google/veo-3.1-fast',
    name: 'Google Veo 3.1 Fast',
    provider: 'Google',
    type: 'image-to-video',
    input: {
      parameters: {
        image: COMMON_PARAMETERS.image,
        prompt: COMMON_PARAMETERS.prompt,
        last_frame: {
          name: 'last_frame',
          type: 'string' as const,
          required: false,
          description: 'URL of the last frame for guided motion'
        },
        aspect_ratio: COMMON_PARAMETERS.aspect_ratio,
        duration: {
          name: 'duration',
          type: 'number' as const,
          required: false,
          default: 5,
          description: 'Video duration in seconds',
          validation: { min: 2, max: 8 }
        },
        seed: COMMON_PARAMETERS.seed
      },
      requiredParameters: ['image', 'prompt'],
      optionalParameters: ['last_frame', 'aspect_ratio', 'duration', 'seed']
    },
    output: {
      type: 'video',
      format: 'mp4',
      structure: {
        type: 'string'
      }
    },
    capabilities: ['fast', 'flexible-duration', 'last-frame-control'],
    limitations: ['no-audio'],
    notes: ['Cost: $0.10 per second', 'No audio generation']
  },

  'minimax/hailuo-2.3-fast': {
    id: 'minimax/hailuo-2.3-fast',
    name: 'Hailuo 2.3 Fast',
    provider: 'MiniMax',
    type: 'image-to-video',
    input: {
      parameters: {
        image: COMMON_PARAMETERS.image,
        prompt: COMMON_PARAMETERS.prompt,
        duration: {
          name: 'duration',
          type: 'number' as const,
          required: false,
          default: 5,
          description: 'Video duration in seconds',
          validation: { min: 3, max: 6 }
        }
      },
      requiredParameters: ['image', 'prompt'],
      optionalParameters: ['duration']
    },
    output: {
      type: 'video',
      format: 'mp4',
      structure: {
        type: 'string'
      }
    },
    capabilities: ['fast', 'cost-effective'],
    limitations: ['limited-duration'],
    notes: ['Cost: $0.19 per video', 'Fast generation speed']
  },

  'openai/sora-2-pro': {
    id: 'openai/sora-2-pro',
    name: 'Sora 2 Pro',
    provider: 'OpenAI',
    type: 'image-to-video',
    input: {
      parameters: {
        image: COMMON_PARAMETERS.image,
        prompt: COMMON_PARAMETERS.prompt,
        duration: {
          name: 'duration',
          type: 'number' as const,
          required: false,
          default: 5,
          description: 'Video duration in seconds',
          validation: { min: 2, max: 20 }
        },
        aspect_ratio: COMMON_PARAMETERS.aspect_ratio,
        seed: COMMON_PARAMETERS.seed
      },
      requiredParameters: ['image', 'prompt'],
      optionalParameters: ['duration', 'aspect_ratio', 'seed']
    },
    output: {
      type: 'video',
      format: 'mp4',
      structure: {
        type: 'string',
        description: 'URL of generated video'
      }
    },
    capabilities: ['high-realism', 'flexible-duration', 'advanced-motion'],
    limitations: [],
    notes: ['Advanced video generation from OpenAI', 'High realism and coherent motion']
  }
};

// ============================================================================
// Image Processing Model Schemas
// ============================================================================

export const IMAGE_PROCESSING_SCHEMAS: Record<string, ModelSchema> = {
  'cjwbw/rembg': {
    id: 'cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003',
    name: 'RemBG',
    provider: 'cjwbw',
    type: 'image-processing',
    input: {
      parameters: {
        image: COMMON_PARAMETERS.image
      },
      requiredParameters: ['image'],
      optionalParameters: []
    },
    output: {
      type: 'image',
      format: 'url',
      structure: {
        type: 'string',
        description: 'URL of image with background removed'
      }
    },
    capabilities: ['background-removal', 'transparency'],
    limitations: [],
    notes: ['Removes background from images', 'Returns PNG with transparency']
  }
};

// ============================================================================
// Text Generation Model Schemas
// ============================================================================

export const TEXT_GENERATION_SCHEMAS: Record<string, ModelSchema> = {
  'openai/gpt-4o': {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    type: 'text-generation',
    input: {
      parameters: {
        messages: {
          name: 'messages',
          type: 'array' as const,
          required: true,
          description: 'Array of message objects for conversation',
          examples: [[
            { role: 'system', content: 'You are a helpful assistant' },
            { role: 'user', content: 'Hello!' }
          ]]
        },
        model: {
          name: 'model',
          type: 'string' as const,
          required: true,
          description: 'Model identifier',
          validation: { enum: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] }
        },
        temperature: {
          name: 'temperature',
          type: 'number' as const,
          required: false,
          default: 0.7,
          description: 'Creativity/randomness (0-2)',
          validation: { min: 0, max: 2 }
        },
        max_tokens: {
          name: 'max_tokens',
          type: 'number' as const,
          required: false,
          default: 1000,
          description: 'Maximum response length',
          validation: { min: 1, max: 4096 }
        },
        response_format: {
          name: 'response_format',
          type: 'object' as const,
          required: false,
          description: 'Response format specification (e.g., { type: "json_object" })'
        }
      },
      requiredParameters: ['messages', 'model'],
      optionalParameters: ['temperature', 'max_tokens', 'response_format']
    },
    output: {
      type: 'text',
      format: 'json',
      structure: {
        type: 'object',
        properties: {
          choices: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                message: {
                  type: 'object',
                  properties: {
                    content: { type: 'string' },
                    role: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    capabilities: ['json-mode', 'function-calling', 'multimodal', 'vision'],
    limitations: ['token-limits'],
    notes: ['Supports vision with image URLs in messages', 'Can output structured JSON']
  },

  'anthropic/claude-3.5-sonnet': {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    type: 'text-generation',
    input: {
      parameters: {
        messages: {
          name: 'messages',
          type: 'array' as const,
          required: true,
          description: 'Array of message objects'
        },
        model: {
          name: 'model',
          type: 'string' as const,
          required: true,
          description: 'Model identifier',
          validation: { enum: ['claude-3.5-sonnet', 'claude-3-opus', 'claude-3-haiku'] }
        },
        temperature: {
          name: 'temperature',
          type: 'number' as const,
          required: false,
          default: 1.0,
          description: 'Creativity/randomness (0-1)',
          validation: { min: 0, max: 1 }
        },
        max_tokens: {
          name: 'max_tokens',
          type: 'number' as const,
          required: true,
          description: 'Maximum response length',
          validation: { min: 1, max: 4096 }
        }
      },
      requiredParameters: ['messages', 'model', 'max_tokens'],
      optionalParameters: ['temperature']
    },
    output: {
      type: 'text',
      format: 'json',
      structure: {
        type: 'object',
        properties: {
          content: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' }
              }
            }
          }
        }
      }
    },
    capabilities: ['long-context', 'reasoning', 'vision'],
    limitations: ['max_tokens-required'],
    notes: ['Strong reasoning and creative writing', 'Requires max_tokens parameter']
  }
};

// ============================================================================
// Master Model Registry
// ============================================================================

/**
 * Complete registry of all model schemas
 */
export const MODEL_SCHEMAS: Record<string, ModelSchema> = {
  // Text-to-Image Models
  ...TEXT_TO_IMAGE_SCHEMAS,
  
  // Image-to-Image Models
  ...IMAGE_TO_IMAGE_SCHEMAS,
  
  // Video Models
  ...VIDEO_SCHEMAS,
  
  // Image Processing Models
  ...IMAGE_PROCESSING_SCHEMAS,
  
  // Text Generation Models
  ...TEXT_GENERATION_SCHEMAS
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get schema for a specific model
 * Handles version hashes in model IDs (e.g., "owner/model:hash")
 */
export function getModelSchema(modelId: string): ModelSchema | undefined {
  // Try exact match first
  if (MODEL_SCHEMAS[modelId]) {
    return MODEL_SCHEMAS[modelId];
  }
  
  // Try without version hash
  const baseModelId = modelId.split(':')[0];
  if (MODEL_SCHEMAS[baseModelId]) {
    return MODEL_SCHEMAS[baseModelId];
  }
  
  // Try I2I variant (for models that have both T2I and I2I schemas)
  const i2iVariant = baseModelId + '-i2i';
  if (MODEL_SCHEMAS[i2iVariant]) {
    return MODEL_SCHEMAS[i2iVariant];
  }
  
  return undefined;
}

/**
 * Get all models of a specific type
 */
export function getModelsByType(type: ModelSchema['type']): ModelSchema[] {
  return Object.values(MODEL_SCHEMAS).filter(schema => schema.type === type);
}

/**
 * Validate model input parameters against schema
 */
export function validateModelInput(
  modelId: string, 
  input: Record<string, any>
): { valid: boolean; errors: string[] } {
  const schema = getModelSchema(modelId);
  if (!schema) {
    return { valid: false, errors: [`Unknown model: ${modelId}`] };
  }

  const errors: string[] = [];
  const { parameters, requiredParameters } = schema.input;

  // Check required parameters
  for (const param of requiredParameters) {
    if (!(param in input) || input[param] === undefined || input[param] === null) {
      errors.push(`Missing required parameter: ${param}`);
    }
  }

  // Validate parameter types and values
  for (const [paramName, paramValue] of Object.entries(input)) {
    if (paramName in parameters) {
      const paramDef = parameters[paramName];
      const validation = validateParameter(paramValue, paramDef);
      if (!validation.valid) {
        errors.push(`${paramName}: ${validation.error}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a single parameter against its definition
 */
function validateParameter(value: any, paramDef: ModelParameter): { valid: boolean; error?: string } {
  const { type, validation } = paramDef;

  // Type validation
  switch (type) {
    case 'string':
      if (typeof value !== 'string') {
        return { valid: false, error: `Expected string, got ${typeof value}` };
      }
      if (validation?.min && value.length < validation.min) {
        return { valid: false, error: `String length ${value.length} is below minimum ${validation.min}` };
      }
      if (validation?.max && value.length > validation.max) {
        return { valid: false, error: `String length ${value.length} exceeds maximum ${validation.max}` };
      }
      break;
    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        return { valid: false, error: `Expected number, got ${typeof value}` };
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') {
        return { valid: false, error: `Expected boolean, got ${typeof value}` };
      }
      break;
    case 'array':
      if (!Array.isArray(value)) {
        return { valid: false, error: `Expected array, got ${typeof value}` };
      }
      break;
  }

  // Value validation
  if (validation) {
    if (validation.min !== undefined && value < validation.min) {
      return { valid: false, error: `Value ${value} is below minimum ${validation.min}` };
    }
    if (validation.max !== undefined && value > validation.max) {
      return { valid: false, error: `Value ${value} is above maximum ${validation.max}` };
    }
    if (validation.enum && !validation.enum.includes(value)) {
      return { valid: false, error: `Value ${value} not in allowed values: ${validation.enum.join(', ')}` };
    }
    if (validation.pattern && !new RegExp(validation.pattern).test(value)) {
      return { valid: false, error: `Value ${value} does not match pattern ${validation.pattern}` };
    }
  }

  return { valid: true };
}

/**
 * Get default values for model parameters
 */
export function getModelDefaults(modelId: string): Record<string, any> {
  const schema = getModelSchema(modelId);
  if (!schema) return {};

  const defaults: Record<string, any> = {};
  for (const [paramName, paramDef] of Object.entries(schema.input.parameters)) {
    if (paramDef.default !== undefined) {
      defaults[paramName] = paramDef.default;
    }
  }
  return defaults;
}

/**
 * Get supported parameters for a model
 */
export function getSupportedParameters(modelId: string): string[] {
  const schema = getModelSchema(modelId);
  if (!schema) return [];
  
  return [...schema.input.requiredParameters, ...schema.input.optionalParameters];
}

/**
 * Check if a model supports a specific parameter
 */
export function modelSupportsParameter(modelId: string, parameter: string): boolean {
  const schema = getModelSchema(modelId);
  if (!schema) return false;
  
  return parameter in schema.input.parameters;
}

/**
 * Get parameter definition for a specific parameter
 */
export function getParameterDefinition(modelId: string, parameter: string): ModelParameter | undefined {
  const schema = getModelSchema(modelId);
  if (!schema) return undefined;
  
  return schema.input.parameters[parameter];
}

/**
 * Check if a model has a specific capability
 */
export function modelHasCapability(modelId: string, capability: string): boolean {
  const schema = getModelSchema(modelId);
  if (!schema) return false;
  
  return schema.capabilities.includes(capability);
}

/**
 * Get all models with a specific capability
 */
export function getModelsByCapability(capability: string): ModelSchema[] {
  return Object.values(MODEL_SCHEMAS).filter(schema => 
    schema.capabilities.includes(capability)
  );
}

/**
 * Build model input with defaults
 * Merges provided parameters with model defaults
 */
export function buildModelInput(modelId: string, params: Record<string, any>): Record<string, any> {
  const defaults = getModelDefaults(modelId);
  return { ...defaults, ...params };
}

