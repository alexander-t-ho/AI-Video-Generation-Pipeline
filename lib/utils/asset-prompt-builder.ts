/**
 * Asset Prompt Builder Utility
 * 
 * Parses natural language requests and builds prompts for asset-based image generation
 */

// View angle keywords and their variations
// Only include standard automotive angles - other requests will pass through as natural language
const ANGLE_PATTERNS = {
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

// Action keywords that indicate a generation request
const ACTION_PATTERNS = [
  /\b(create|generate|make|show|produce|render|build)\b/i,
  /\b(give\s+me|show\s+me|get\s+me)\b/i,
];

// Color reference patterns
const COLOR_REFERENCE_PATTERNS = [
  /\b(in\s+this\s+color|with\s+this\s+color|using\s+this\s+color|same\s+color)\b/i,
  /\b(in\s+that\s+color|with\s+that\s+color|using\s+that\s+color)\b/i,
  /\b(colored|recolor|paint|painted)\b/i,
];

interface ParsedRequest {
  isGenerationRequest: boolean;
  angle?: string;
  usesColor: boolean;
  originalRequest: string;
}

/**
 * Parses a natural language request to extract intent and parameters
 */
export function parseAssetRequest(request: string): ParsedRequest {
  const lowerRequest = request.toLowerCase();
  
  // Check if it's a generation request
  const isGenerationRequest = ACTION_PATTERNS.some(pattern => pattern.test(request));
  
  // Extract view angle
  let angle: string | undefined;
  for (const [angleKey, pattern] of Object.entries(ANGLE_PATTERNS)) {
    if (pattern.test(request)) {
      angle = angleKey;
      break;
    }
  }
  
  // Check if color is referenced
  const usesColor = COLOR_REFERENCE_PATTERNS.some(pattern => pattern.test(request));
  
  return {
    isGenerationRequest,
    angle,
    usesColor,
    originalRequest: request,
  };
}

/**
 * Converts angle type to natural language description for prompt
 */
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

/**
 * Converts hex color to natural language description
 */
function colorToDescription(hexColor: string): string {
  // Map hex colors to common color names
  const colorNames: Record<string, string> = {
    '#000000': 'black',
    '#FFFFFF': 'white',
    '#FF0000': 'red',
    '#00FF00': 'green',
    '#0000FF': 'blue',
    '#FFFF00': 'yellow',
    '#FF00FF': 'magenta',
    '#00FFFF': 'cyan',
    '#C0C0C0': 'silver',
    '#808080': 'gray',
    '#800000': 'maroon',
    '#808000': 'olive',
    '#008000': 'dark green',
    '#800080': 'purple',
    '#008080': 'teal',
    '#000080': 'navy',
  };
  
  // Try exact match first
  const upperHex = hexColor.toUpperCase();
  if (colorNames[upperHex]) {
    return colorNames[upperHex];
  }
  
  // Otherwise, use the hex color directly
  return `${hexColor} color`;
}

/**
 * Builds a prompt for asset-based image generation
 * 
 * @param request - Natural language request from user
 * @param assetDescription - Description of the asset (e.g., "Porsche 911 Carrera (2010)")
 * @param color - Hex color code (e.g., "#FF0000")
 * @returns Formatted prompt for image generation
 */
export function buildAssetPrompt(
  request: string,
  assetDescription: string,
  color?: string
): string {
  const parsed = parseAssetRequest(request);
  
  // If not a generation request, return the original request
  if (!parsed.isGenerationRequest) {
    return request;
  }
  
  // Build the base prompt with asset description
  let prompt = `A ${assetDescription}`;
  
  // Add color if specified and referenced in the request
  if (color && parsed.usesColor) {
    const colorDesc = colorToDescription(color);
    prompt += ` in ${colorDesc}`;
  }
  
  // Add angle/view description
  if (parsed.angle) {
    // Use predefined angle description
    const angleDesc = angleToDescription(parsed.angle);
    prompt += `, ${angleDesc}`;
  } else {
    // No predefined angle matched - pass through user's natural language description
    // Extract the view/perspective description from the original request
    // Remove action words and keep the descriptive part
    let viewDescription = request
      .replace(/\b(create|generate|make|show|produce|render|build|give\s+me|show\s+me|get\s+me)\b/gi, '')
      .replace(/\b(a|an|the)\b/gi, '')
      .replace(/\b(of\s+this\s+car|of\s+the\s+car)\b/gi, '')
      .trim();
    
    if (viewDescription) {
      prompt += `, ${viewDescription}`;
    }
  }
  
  // Add quality and style descriptors
  prompt += ', professional product photography, studio lighting, clean background, high detail, 4K resolution';
  
  return prompt;
}

/**
 * Validates that all required context is available for generation
 */
export function validateAssetContext(
  assetDescription?: string,
  currentReferenceImageUrl?: string
): { valid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];
  
  if (!assetDescription) {
    missingFields.push('asset description (no asset selected)');
  }
  
  if (!currentReferenceImageUrl) {
    missingFields.push('reference image (no image displayed)');
  }
  
  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}


