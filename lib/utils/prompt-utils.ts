/**
 * Unified Prompt Utilities
 * Consolidates prompt optimization, enhancement, and building functions
 */

// ============================================================================
// Constants & Patterns
// ============================================================================

export const COLOR_MATERIAL_REGEX = /\b(silver|black|red|blue|white|gray|grey|gold|metal|leather|wood|plastic|stainless steel|matte|glossy|shiny|dull)\s+/gi;
export const OBJECT_TYPE_REGEX = /\b(modern|sleek|luxury|sports|vintage|classic|premium|high-end|budget|affordable)\s+/gi;
export const CAR_REGEX = /\b(car|vehicle|automobile|sedan|suv|coupe|convertible|sports car|luxury car|modern car|vintage car|classic car)\b/gi;
export const WATCH_REGEX = /\b(watch|timepiece|wristwatch|clock)\b/gi;
export const PRODUCT_FEATURES_REGEX = /\b(product|item|object|thing)\s+(with|featuring|showing|displaying)\s+[^,]+/gi;
export const OBJECT_FEATURES_REGEX = /\b(with|featuring|showing|displaying|including)\s+[^,]+(headlights|wheels|tires|doors|windows|buttons|dials|straps|bands|bezels)\b/gi;

const SCENE_WORDS = new Set([
  'at', 'in', 'on', 'with', 'during', 'sunset', 'sunrise', 'background', 'foreground',
  'lighting', 'dramatic', 'soft', 'bright', 'dark', 'golden hour', 'blue hour',
  'mountain', 'beach', 'city', 'street', 'road', 'track', 'studio', 'outdoor', 'indoor',
  'positioned', 'placed', 'situated', 'located', 'standing', 'sitting', 'moving', 'stationary',
  'vibrant', 'muted', 'warm', 'cool', 'natural', 'artificial', 'ambient', 'direct',
  'blurred', 'sharp', 'focused', 'depth of field', 'bokeh', 'shallow', 'wide',
  'atmosphere', 'mood', 'feeling', 'emotion', 'energy', 'dynamic', 'static', 'calm', 'energetic'
]);

const AUTOMOTIVE_KEYWORDS = [
  'car', 'vehicle', 'automobile', 'sedan', 'suv', 'coupe', 'convertible',
  'sports car', 'luxury car', 'truck', 'van', 'motorcycle', 'bike',
  'driving', 'road', 'highway', 'street', 'wheels', 'tires', 'headlights',
  'taillights', 'moving', 'traveling', 'speeding'
];

const ANGLE_PATTERNS: Record<string, RegExp> = {
  front: /\b(front|frontal|forward|face|front[\s-]?angle|front[\s-]?view)\b/i,
  rear: /\b(rear|back|behind|rear[\s-]?angle|rear[\s-]?view|back[\s-]?view)\b/i,
  'left-side': /\b(left|left[\s-]?side|driver[\s-]?side|left[\s-]?profile)\b/i,
  'right-side': /\b(right|right[\s-]?side|passenger[\s-]?side|right[\s-]?profile)\b/i,
  'front-left-45': /\b(front[\s-]?left|three[\s-]?quarter[\s-]?left|45[\s-]?left|diagonal[\s-]?left)\b/i,
  'front-right-45': /\b(front[\s-]?right|three[\s-]?quarter[\s-]?right|45[\s-]?right|diagonal[\s-]?right)\b/i,
  top: /\b(top|overhead|aerial|bird[\s-]?eye|top[\s-]?down|from[\s-]?above)\b/i,
  'low-angle': /\b(low[\s-]?angle|ground[\s-]?level|worm[\s-]?eye|from[\s-]?below)\b/i,
  side: /\b(side|profile|lateral)\b/i,
};

// ============================================================================
// Cache
// ============================================================================

const promptCache = new Map<string, string>();
const MAX_CACHE_SIZE = 100;

// ============================================================================
// Helper Functions
// ============================================================================

function isSceneWord(word: string): boolean {
  const cleaned = word.toLowerCase().replace(/[.,!?;:]/g, '');
  return cleaned.length <= 3 || SCENE_WORDS.has(cleaned) || 
         cleaned.includes('reference') || cleaned.includes('same') || cleaned.includes('object');
}

function isAutomotiveContent(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return AUTOMOTIVE_KEYWORDS.some(k => lower.includes(k));
}

function isIndoorScene(prompt: string): boolean {
  const indoor = ['indoor', 'interior', 'inside', 'garage', 'showroom', 'warehouse',
    'parking garage', 'tunnel', 'covered', 'enclosed space', 'building', 'studio', 'exhibition hall'];
  const lower = prompt.toLowerCase();
  return indoor.some(k => lower.includes(k));
}

function detectMovementDirection(prompt: string): 'forward' | 'backward' | 'left' | 'right' | 'unknown' {
  const lower = prompt.toLowerCase();
  if (lower.includes('forward') || lower.includes('ahead') || lower.includes('driving forward') || lower.includes('moving forward')) return 'forward';
  if (lower.includes('backward') || lower.includes('reversing') || lower.includes('backing up')) return 'backward';
  if (lower.includes('turning left') || lower.includes('left turn')) return 'left';
  if (lower.includes('turning right') || lower.includes('right turn')) return 'right';
  if (lower.includes('driving') || lower.includes('moving') || lower.includes('speeding') || lower.includes('traveling')) return 'forward';
  return 'unknown';
}

function angleToDescription(angle: string): string {
  const descriptions: Record<string, string> = {
    'front': 'front view, straight on',
    'rear': 'rear view, from behind',
    'left-side': 'left side profile view',
    'right-side': 'right side profile view',
    'front-left-45': 'three-quarter front left view at 45 degrees',
    'front-right-45': 'three-quarter front right view at 45 degrees',
    'top': 'top-down aerial view',
    'low-angle': 'low angle view from ground level',
    'side': 'side profile view',
  };
  return descriptions[angle] || 'view';
}

function colorToDescription(hexColor: string): string {
  const colorNames: Record<string, string> = {
    '#000000': 'black', '#FFFFFF': 'white', '#FF0000': 'red', '#00FF00': 'green',
    '#0000FF': 'blue', '#FFFF00': 'yellow', '#FF00FF': 'magenta', '#00FFFF': 'cyan',
    '#C0C0C0': 'silver', '#808080': 'gray', '#800000': 'maroon', '#808000': 'olive',
    '#008000': 'dark green', '#800080': 'purple', '#008080': 'teal', '#000080': 'navy',
  };
  return colorNames[hexColor.toUpperCase()] || `${hexColor} color`;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Adjusts prompt for reference image usage
 */
export function adjustPromptForReferenceImage(originalPrompt: string): string {
  if (promptCache.has(originalPrompt)) {
    return promptCache.get(originalPrompt)!;
  }

  let adjustedPrompt = originalPrompt
    .replace(COLOR_MATERIAL_REGEX, '')
    .replace(OBJECT_TYPE_REGEX, '')
    .replace(CAR_REGEX, 'the same object from the reference image')
    .replace(WATCH_REGEX, 'the same object from the reference image')
    .replace(PRODUCT_FEATURES_REGEX, 'the same object from the reference image')
    .replace(OBJECT_FEATURES_REGEX, '');

  const words = adjustedPrompt.split(/\s+/);
  const filteredWords = words.filter(isSceneWord);

  adjustedPrompt = `The same object from the reference image, ${filteredWords.join(' ')}`
    .replace(/\bthe same\s+the same\b/gi, 'the same')
    .replace(/\bthe same\s+object\s+from\s+the\s+reference\s+image\s+the\s+same\s+object\s+from\s+the\s+reference\s+image\b/gi, 'the same object from the reference image')
    .replace(/\s+/g, ' ')
    .replace(/,\s*,/g, ',')
    .trim();

  if (promptCache.size >= MAX_CACHE_SIZE) {
    const firstKey = promptCache.keys().next().value;
    if (firstKey) promptCache.delete(firstKey);
  }
  promptCache.set(originalPrompt, adjustedPrompt);

  return adjustedPrompt;
}

/**
 * Adjusts prompts for character generation
 */
export function adjustPromptForCharacterReference(
  baseDescription: string,
  hasReferenceImages: boolean,
  feedback?: string
): string {
  let prompt = baseDescription;
  if (feedback?.trim()) prompt += `. ${feedback.trim()}`;
  if (hasReferenceImages) prompt = adjustPromptForReferenceImage(prompt);
  if (!hasReferenceImages) {
    prompt += ', isolated subject on clean white background, no shadows, even studio lighting, clear edges for easy extraction';
  }
  return prompt;
}

/**
 * Enhances video prompts for automotive content
 */
export function enhanceVideoPrompt(
  originalPrompt: string,
  options: {
    ensureHeadlights?: boolean;
    ensureCorrectWheelRotation?: boolean;
    addMotionDetails?: boolean;
    useNegativePrompt?: boolean;
  } = {}
): { enhancedPrompt: string; negativePrompt?: string } {
  const {
    ensureHeadlights = true,
    ensureCorrectWheelRotation = true,
    addMotionDetails = true,
    useNegativePrompt = true,
  } = options;

  if (!isAutomotiveContent(originalPrompt)) {
    return { enhancedPrompt: originalPrompt };
  }

  const enhancements: string[] = [];
  const lower = originalPrompt.toLowerCase();

  // Headlights
  if (ensureHeadlights && !lower.includes('headlight')) {
    const isDark = lower.includes('night') || lower.includes('dark') || lower.includes('dusk') || 
                   lower.includes('dawn') || lower.includes('evening') || lower.includes('twilight');
    const isIndoor = isIndoorScene(originalPrompt);
    
    if (isDark || isIndoor) {
      enhancements.push('headlights are on and properly lit, illuminating the area ahead');
    } else {
      enhancements.push('headlights are visible and properly positioned on the vehicle');
    }
  }

  // Indoor lighting
  if (isIndoorScene(originalPrompt)) {
    if (!lower.includes('lighting') && !lower.includes('light')) {
      enhancements.push('well-lit indoor environment with professional overhead lighting');
    }
    if (!lower.includes('floor') && !lower.includes('ground')) {
      enhancements.push('smooth polished floor with realistic reflections');
    }
  }

  // Wheel rotation
  if (ensureCorrectWheelRotation) {
    const direction = detectMovementDirection(originalPrompt);
    if (direction === 'forward') {
      if (!lower.includes('wheel') && !lower.includes('tire') && !lower.includes('rotating')) {
        enhancements.push('wheels rotate forward in the direction of travel, creating realistic motion blur');
      }
    } else if (direction === 'backward') {
      enhancements.push('wheels rotate backward as the vehicle reverses');
    } else if (direction === 'left' || direction === 'right') {
      enhancements.push(`wheels rotate appropriately for a ${direction} turn, with proper steering angle`);
    }
  }

  // Motion details
  if (addMotionDetails && !lower.includes('motion blur') && !lower.includes('movement')) {
    enhancements.push('smooth, realistic motion with appropriate motion blur');
  }

  // Physical consistency
  if (!lower.includes('consistent') && !lower.includes('realistic')) {
    enhancements.push('physically consistent movement, maintaining vehicle proportions and details');
  }

  const enhancedPrompt = enhancements.length > 0 
    ? `${originalPrompt}, ${enhancements.join(', ')}`
    : originalPrompt;

  const result: { enhancedPrompt: string; negativePrompt?: string } = { enhancedPrompt };

  if (useNegativePrompt) {
    result.negativePrompt = [
      'missing headlights', 'headlights not lit', 'incorrect headlight placement',
      'wheels spinning backwards', 'wheels rotating in wrong direction', 'unrealistic wheel rotation',
      'disconnected wheels', 'floating wheels', 'wheels not touching ground',
      'inconsistent motion', 'jerky movement', 'unnatural motion', 'physics errors',
      'distorted vehicle', 'missing vehicle parts', 'broken geometry',
      'artifacts', 'glitches', 'low quality', 'blurry', 'distorted',
    ].join(', ');
  }

  return result;
}

/**
 * Parses asset request to check if it's a generation request
 */
export function parseAssetRequest(request: string): {
  isGenerationRequest: boolean;
  angle?: string;
  usesColor: boolean;
  originalRequest: string;
} {
  const isGenerationRequest = /\b(create|generate|make|show|produce|render|build|give\s+me|show\s+me|get\s+me)\b/i.test(request);
  
  let angle: string | undefined;
  for (const [angleKey, pattern] of Object.entries(ANGLE_PATTERNS)) {
    if (pattern.test(request)) {
      angle = angleKey;
      break;
    }
  }
  
  const usesColor = /\b(in\s+this\s+color|with\s+this\s+color|using\s+this\s+color|same\s+color|in\s+that\s+color|with\s+that\s+color|using\s+that\s+color|colored|recolor|paint|painted)\b/i.test(request);
  
  return {
    isGenerationRequest,
    angle,
    usesColor,
    originalRequest: request,
  };
}

/**
 * Builds asset-based prompts from natural language
 */
export function buildAssetPrompt(
  request: string,
  assetDescription: string,
  color?: string
): string {
  const parsed = parseAssetRequest(request);
  
  if (!parsed.isGenerationRequest) return request;

  let prompt = `A ${assetDescription}`;

  // Add color
  if (color && parsed.usesColor) {
    prompt += ` in ${colorToDescription(color)}`;
  }

  // Add angle
  if (parsed.angle) {
    prompt += `, ${angleToDescription(parsed.angle)}`;
  } else {
    const viewDescription = request
      .replace(/\b(create|generate|make|show|produce|render|build|give\s+me|show\s+me|get\s+me)\b/gi, '')
      .replace(/\b(a|an|the)\b/gi, '')
      .replace(/\b(of\s+this\s+car|of\s+the\s+car)\b/gi, '')
      .trim();
    if (viewDescription) prompt += `, ${viewDescription}`;
  }

  prompt += ', professional product photography, studio lighting, clean background, high detail, 4K resolution';
  return prompt;
}

/**
 * Summarizes scene descriptions
 */
export function summarizeSceneDescription(description: string, maxLength: number = 60): string {
  if (description.length <= maxLength) return description;

  const parts = description.split(' + ');
  if (parts.length > 0) {
    const firstPart = parts[0].trim();
    const secondPart = parts[1]?.trim() || '';
    const combined = secondPart ? `${firstPart} + ${secondPart}` : firstPart;
    
    if (combined.length <= maxLength) return combined;
    
    const truncated = combined.substring(0, maxLength - 3);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.7) {
      return truncated.substring(0, lastSpace) + '...';
    }
    return truncated + '...';
  }
  
  return description.substring(0, maxLength - 3) + '...';
}

/**
 * Validates asset context for generation
 */
export function validateAssetContext(
  assetDescription?: string,
  currentReferenceImageUrl?: string
): { valid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];
  if (!assetDescription) missingFields.push('asset description (no asset selected)');
  if (!currentReferenceImageUrl) missingFields.push('reference image (no image displayed)');
  return { valid: missingFields.length === 0, missingFields };
}

