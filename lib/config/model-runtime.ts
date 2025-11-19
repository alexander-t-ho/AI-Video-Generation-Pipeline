/**
 * Runtime Model Configuration
 *
 * Manages runtime model selection for the dev panel.
 * Allows users to override models without changing environment variables.
 */

import {
  AVAILABLE_TEXT_MODELS,
  AVAILABLE_T2I_MODELS,
  AVAILABLE_I2I_MODELS,
  AVAILABLE_VIDEO_MODELS,
  IMAGE_CONFIG,
  VIDEO_CONFIG,
} from './ai-models';

export type ModelCategory = 'text' | 't2i' | 'i2i' | 'video';

export type PromptAdjustmentMode = 'disabled' | 'less-aggressive' | 'scene-specific';

export interface RuntimeModelConfig {
  text: string;
  t2i: string;
  i2i: string;
  video: string;
  enableBackgroundRemoval?: boolean; // Optional: Enable/disable background removal on upload
  edgeCleanupIterations?: number; // Optional: Number of edge cleanup passes (0-3, default: 1)
  promptAdjustmentMode?: PromptAdjustmentMode; // Optional: How to adjust prompts when reference images are present (default: 'scene-specific')
}

const STORAGE_KEY = 'ai-pipeline-runtime-models';

/**
 * Default runtime configuration
 */
export const DEFAULT_RUNTIME_CONFIG: RuntimeModelConfig = {
  text: AVAILABLE_TEXT_MODELS[1].id, // gpt-4o-mini
  t2i: AVAILABLE_T2I_MODELS[2].id, // flux-schnell (fast and reliable)
  i2i: AVAILABLE_I2I_MODELS[0].id, // runwayml/gen4-image (best for Scene 0 consistency)
  video: AVAILABLE_VIDEO_MODELS[0].id, // wan-2.2 (fast and cost-effective)
  enableBackgroundRemoval: true, // Default: enabled
  edgeCleanupIterations: 1, // Default: 1 iteration
  promptAdjustmentMode: 'scene-specific', // Default: Scene 1 uses full prompt, others use adjusted
};

/**
 * Gets the current runtime model configuration from localStorage
 */
export function getRuntimeConfig(): RuntimeModelConfig {
  if (typeof window === 'undefined') {
    return DEFAULT_RUNTIME_CONFIG;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate that all required fields exist
      if (parsed.text && parsed.t2i && parsed.i2i && parsed.video) {
        // Ensure enableBackgroundRemoval has a default if not present
        if (parsed.enableBackgroundRemoval === undefined) {
          parsed.enableBackgroundRemoval = DEFAULT_RUNTIME_CONFIG.enableBackgroundRemoval;
        }
        // Ensure edgeCleanupIterations has a default if not present
        if (parsed.edgeCleanupIterations === undefined) {
          parsed.edgeCleanupIterations = DEFAULT_RUNTIME_CONFIG.edgeCleanupIterations;
        }
        // Ensure promptAdjustmentMode has a default if not present
        if (parsed.promptAdjustmentMode === undefined) {
          parsed.promptAdjustmentMode = DEFAULT_RUNTIME_CONFIG.promptAdjustmentMode;
        }
        return parsed;
      }
    }
  } catch (error) {
    console.error('Error reading runtime config:', error);
  }

  return DEFAULT_RUNTIME_CONFIG;
}

/**
 * Saves the runtime model configuration to localStorage
 */
export function saveRuntimeConfig(config: RuntimeModelConfig): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('Error saving runtime config:', error);
  }
}

/**
 * Updates a specific model category in the runtime configuration
 */
export function updateRuntimeModel(category: ModelCategory, modelId: string): void {
  const config = getRuntimeConfig();
  config[category] = modelId;
  saveRuntimeConfig(config);
}

/**
 * Gets the active model ID for a specific category
 */
export function getActiveModel(category: ModelCategory): string {
  const config = getRuntimeConfig();
  return config[category];
}

/**
 * Resets runtime configuration to defaults
 */
export function resetRuntimeConfig(): void {
  saveRuntimeConfig(DEFAULT_RUNTIME_CONFIG);
}

/**
 * Gets the effective image model (runtime override or default)
 */
export function getEffectiveImageModel(): string {
  // Priority: Runtime config > Environment variable > Default
  const runtimeModel = getActiveModel('t2i');
  return runtimeModel || IMAGE_CONFIG.model;
}

/**
 * Gets the effective video model (runtime override or default)
 */
export function getEffectiveVideoModel(): string {
  // Priority: Runtime config > Environment variable > Default
  const runtimeModel = getActiveModel('video');
  return runtimeModel || VIDEO_CONFIG.model;
}

/**
 * Gets the effective text model (runtime override or default)
 */
export function getEffectiveTextModel(): string {
  // Priority: Runtime config > Environment variable > Default
  const runtimeModel = getActiveModel('text');
  return runtimeModel || DEFAULT_RUNTIME_CONFIG.text;
}

// For server-side use (API routes) - import this module to get runtime config
