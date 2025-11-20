/**
 * Prompt Optimizer - Advanced Prompt Processing with Caching
 *
 * This module handles prompt optimization for AI image generation, including
 * reference image adjustments, scene word filtering, and caching for performance.
 */

// ============================================================================
// Pre-compiled Regex Patterns (OPTIMIZED: Cached for performance)
// ============================================================================

export const COLOR_MATERIAL_REGEX = /\b(silver|black|red|blue|white|gray|grey|gold|metal|leather|wood|plastic|stainless steel|matte|glossy|shiny|dull)\s+/gi;
export const OBJECT_TYPE_REGEX = /\b(modern|sleek|luxury|sports|vintage|classic|premium|high-end|budget|affordable)\s+/gi;
export const CAR_REGEX = /\b(car|vehicle|automobile|sedan|suv|coupe|convertible|sports car|luxury car|modern car|vintage car|classic car)\b/gi;
export const WATCH_REGEX = /\b(watch|timepiece|wristwatch|clock)\b/gi;
export const PRODUCT_FEATURES_REGEX = /\b(product|item|object|thing)\s+(with|featuring|showing|displaying)\s+[^,]+/gi;
export const OBJECT_FEATURES_REGEX = /\b(with|featuring|showing|displaying|including)\s+[^,]+(headlights|wheels|tires|doors|windows|buttons|dials|straps|bands|bezels)\b/gi;
export const DUPLICATE_SAME_REGEX = /\bthe same\s+the same\b/gi;
export const DUPLICATE_REFERENCE_REGEX = /\bthe same\s+object\s+from\s+the\s+reference\s+image\s+the\s+same\s+object\s+from\s+the\s+reference\s+image\b/gi;
export const MULTIPLE_SPACES_REGEX = /\s+/g;
export const MULTIPLE_COMMAS_REGEX = /,\s*,/g;

// ============================================================================
// Scene Word Detection (OPTIMIZED: Set-based lookup)
// ============================================================================

/**
 * Pre-defined scene words as a Set for O(1) lookup
 * These words are typically scene-related and should be preserved in prompts
 */
export const SCENE_WORDS = new Set([
  'at', 'in', 'on', 'with', 'during', 'sunset', 'sunrise', 'background', 'foreground',
  'lighting', 'dramatic', 'soft', 'bright', 'dark', 'golden hour', 'blue hour',
  'mountain', 'beach', 'city', 'street', 'road', 'track', 'studio', 'outdoor', 'indoor',
  'positioned', 'placed', 'situated', 'located', 'standing', 'sitting', 'moving', 'stationary',
  'vibrant', 'muted', 'warm', 'cool', 'natural', 'artificial', 'ambient', 'direct',
  'blurred', 'sharp', 'focused', 'depth of field', 'bokeh', 'shallow', 'wide',
  'atmosphere', 'mood', 'feeling', 'emotion', 'energy', 'dynamic', 'static', 'calm', 'energetic'
]);

/**
 * Checks if a word is scene-related and should be preserved in prompts
 * OPTIMIZATION: O(1) Set lookup instead of O(n) array search
 */
export function isSceneWord(word: string): boolean {
  const cleaned = word.toLowerCase().replace(/[.,!?;:]/g, '');
  return cleaned.length <= 3 || // Short words (prepositions, articles)
         SCENE_WORDS.has(cleaned) ||
         cleaned.includes('reference') ||
         cleaned.includes('same') ||
         cleaned.includes('object');
}

// ============================================================================
// LRU Cache for Prompt Adjustments
// ============================================================================

/**
 * Simple LRU cache for prompt adjustments
 * Prevents recomputing expensive regex operations for repeated prompts
 */
const promptCache = new Map<string, string>();
const MAX_CACHE_SIZE = 100;

// ============================================================================
// Prompt Adjustment Functions
// ============================================================================

/**
 * Adjusts the prompt to be less specific about object details when a reference image is present.
 * This allows the reference image to define the object while the prompt focuses on scene composition.
 *
 * OPTIMIZATIONS:
 * - Pre-compiled regex patterns (defined at module level)
 * - Set-based word lookup (O(1) instead of O(n))
 * - LRU cache for repeated prompts
 *
 * Strategy:
 * - Replace specific object descriptions with generic references
 * - Keep scene composition, lighting, and background details
 * - Let the reference image define the object's appearance
 *
 * @param originalPrompt The original prompt from the storyboard
 * @returns Adjusted prompt that prioritizes reference image
 */
export function adjustPromptForReferenceImage(originalPrompt: string): string {
  // OPTIMIZATION: Check cache first
  if (promptCache.has(originalPrompt)) {
    return promptCache.get(originalPrompt)!;
  }

  // Apply all replacements in sequence (using pre-compiled regex)
  let adjustedPrompt = originalPrompt
    .replace(COLOR_MATERIAL_REGEX, '')
    .replace(OBJECT_TYPE_REGEX, '')
    .replace(CAR_REGEX, 'the same object from the reference image')
    .replace(WATCH_REGEX, 'the same object from the reference image')
    .replace(PRODUCT_FEATURES_REGEX, 'the same object from the reference image')
    .replace(OBJECT_FEATURES_REGEX, '');

  // Filter words (single pass using optimized helper)
  const words = adjustedPrompt.split(MULTIPLE_SPACES_REGEX);
  const filteredWords = words.filter(isSceneWord);

  // Build final prompt
  adjustedPrompt = `The same object from the reference image, ${filteredWords.join(' ')}`
    .replace(DUPLICATE_SAME_REGEX, 'the same')
    .replace(DUPLICATE_REFERENCE_REGEX, 'the same object from the reference image')
    .replace(MULTIPLE_SPACES_REGEX, ' ')
    .replace(MULTIPLE_COMMAS_REGEX, ',')
    .trim();

  // OPTIMIZATION: Cache result with LRU eviction
  if (promptCache.size >= MAX_CACHE_SIZE) {
    const firstKey = promptCache.keys().next().value;
    if (firstKey) {
      promptCache.delete(firstKey);
    }
  }
  promptCache.set(originalPrompt, adjustedPrompt);

  return adjustedPrompt;
}

/**
 * Adjusts prompts specifically for character generation with reference images.
 * Combines character description with feedback and optimizes for reference image consistency.
 *
 * @param baseDescription Character description (e.g., "A young professional in business attire")
 * @param hasReferenceImages Whether reference images are being used
 * @param feedback Optional user feedback to incorporate
 * @returns Optimized prompt for character generation
 */
export function adjustPromptForCharacterReference(
  baseDescription: string,
  hasReferenceImages: boolean,
  feedback?: string
): string {
  let prompt = baseDescription;

  // Incorporate user feedback if provided
  if (feedback && feedback.trim()) {
    prompt += `. ${feedback.trim()}`;
  }

  // If using reference images, optimize for consistency
  if (hasReferenceImages) {
    prompt = adjustPromptForReferenceImage(prompt);
  }

  // Add character-specific optimizations for clean extraction
  if (!hasReferenceImages) {
    // When no reference images, add background and lighting context
    prompt += ', isolated subject on clean white background, no shadows, even studio lighting, clear edges for easy extraction';
  }

  return prompt;
}






