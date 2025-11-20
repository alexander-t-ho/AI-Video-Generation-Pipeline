/**
 * Style Prompt Enhancer
 * Enhances base prompts with style-specific characteristics for directing styles
 */

import { PRESET_STYLES, type PresetStyle } from '@/lib/types/stylized';

/**
 * Gets a preset style by ID
 */
export function getPresetStyle(styleId: string): PresetStyle | undefined {
  return PRESET_STYLES.find(style => style.id === styleId);
}

/**
 * Enhances a base prompt with style-specific characteristics
 * 
 * @param basePrompt - The base prompt (e.g., "A luxury car driving through a scenic route")
 * @param styleId - The ID of the preset style to apply
 * @returns Enhanced prompt combining base prompt with style characteristics
 */
export function enhancePromptWithStyle(basePrompt: string, styleId: string): string {
  const style = getPresetStyle(styleId);
  
  if (!style) {
    console.warn(`[StylePromptEnhancer] Unknown style ID: ${styleId}, returning base prompt`);
    return basePrompt;
  }

  // If basePrompt is empty or just whitespace, use only style enhancement
  if (!basePrompt || basePrompt.trim() === '') {
    return style.promptEnhancement;
  }

  // Combine base prompt with style enhancement
  // Format: "{basePrompt}, {styleEnhancement}"
  const enhancedPrompt = `${basePrompt}, ${style.promptEnhancement}`;
  
  return enhancedPrompt;
}

/**
 * Generates a default base prompt for automotive content if none is provided
 * 
 * @param subjectDescription - Optional description of the subject (e.g., "luxury sedan", "sports car")
 * @returns Default automotive-focused prompt
 */
export function generateDefaultBasePrompt(subjectDescription?: string): string {
  const subject = subjectDescription || 'luxury car';
  // Style-neutral base prompt - let each style control camera movement and motion
  // Removed "in motion" and "dynamic camera movement" to avoid conflicts with static/controlled styles
  return `A cinematic video of a ${subject}, professional commercial aesthetic, high quality, cinematic composition`;
}

/**
 * Enhances multiple prompts for batch generation
 * 
 * @param basePrompt - The base prompt
 * @param styleIds - Array of style IDs to apply
 * @returns Map of styleId -> enhanced prompt
 */
export function enhancePromptsForStyles(
  basePrompt: string,
  styleIds: string[]
): Map<string, string> {
  const enhancedPrompts = new Map<string, string>();
  
  for (const styleId of styleIds) {
    const enhanced = enhancePromptWithStyle(basePrompt, styleId);
    enhancedPrompts.set(styleId, enhanced);
  }
  
  return enhancedPrompts;
}

