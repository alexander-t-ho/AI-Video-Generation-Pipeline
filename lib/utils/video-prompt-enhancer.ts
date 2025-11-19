/**
 * Video Prompt Enhancer
 * Enhances prompts for video generation, especially for automotive content
 * to address common issues like missing headlights, incorrect wheel rotation, etc.
 */

/**
 * Detects if a prompt contains automotive/vehicle content
 */
function isAutomotiveContent(prompt: string): boolean {
  const automotiveKeywords = [
    'car', 'vehicle', 'automobile', 'sedan', 'suv', 'coupe', 'convertible',
    'sports car', 'luxury car', 'truck', 'van', 'motorcycle', 'bike',
    'driving', 'road', 'highway', 'street', 'wheels', 'tires', 'headlights',
    'taillights', 'driving', 'moving', 'traveling', 'speeding'
  ];
  
  const lowerPrompt = prompt.toLowerCase();
  return automotiveKeywords.some(keyword => lowerPrompt.includes(keyword));
}

/**
 * Detects movement direction from prompt
 */
function detectMovementDirection(prompt: string): 'forward' | 'backward' | 'left' | 'right' | 'unknown' {
  const lowerPrompt = prompt.toLowerCase();
  
  if (lowerPrompt.includes('forward') || lowerPrompt.includes('ahead') || 
      lowerPrompt.includes('driving forward') || lowerPrompt.includes('moving forward')) {
    return 'forward';
  }
  if (lowerPrompt.includes('backward') || lowerPrompt.includes('reversing') || 
      lowerPrompt.includes('backing up')) {
    return 'backward';
  }
  if (lowerPrompt.includes('turning left') || lowerPrompt.includes('left turn')) {
    return 'left';
  }
  if (lowerPrompt.includes('turning right') || lowerPrompt.includes('right turn')) {
    return 'right';
  }
  
  // Default to forward if car is moving but direction not specified
  if (lowerPrompt.includes('driving') || lowerPrompt.includes('moving') || 
      lowerPrompt.includes('speeding') || lowerPrompt.includes('traveling')) {
    return 'forward';
  }
  
  return 'unknown';
}

/**
 * Enhances a video prompt for automotive content
 */
export function enhanceVideoPromptForAutomotive(
  originalPrompt: string,
  options: {
    ensureHeadlights?: boolean;
    ensureCorrectWheelRotation?: boolean;
    addMotionDetails?: boolean;
  } = {}
): string {
  const {
    ensureHeadlights = true,
    ensureCorrectWheelRotation = true,
    addMotionDetails = true,
  } = options;

  if (!isAutomotiveContent(originalPrompt)) {
    return originalPrompt;
  }

  const enhancements: string[] = [];
  const lowerPrompt = originalPrompt.toLowerCase();

  // Add headlight instructions
  if (ensureHeadlights && !lowerPrompt.includes('headlight')) {
    // Check if it's likely a night/dark scene
    const isDarkScene = lowerPrompt.includes('night') || 
                       lowerPrompt.includes('dark') || 
                       lowerPrompt.includes('dusk') || 
                       lowerPrompt.includes('dawn') ||
                       lowerPrompt.includes('evening') ||
                       lowerPrompt.includes('twilight');
    
    if (isDarkScene) {
      enhancements.push('headlights are on and properly lit, illuminating the road ahead');
    } else {
      enhancements.push('headlights are visible and properly positioned on the vehicle');
    }
  }

  // Add wheel rotation instructions
  if (ensureCorrectWheelRotation) {
    const direction = detectMovementDirection(originalPrompt);
    
    if (direction === 'forward') {
      if (!lowerPrompt.includes('wheel') && !lowerPrompt.includes('tire') && !lowerPrompt.includes('rotating')) {
        enhancements.push('wheels rotate forward in the direction of travel, creating realistic motion blur');
      } else if (!lowerPrompt.includes('forward') && !lowerPrompt.includes('correct direction')) {
        enhancements.push('wheels rotate forward in the correct direction matching the car\'s movement');
      }
    } else if (direction === 'backward') {
      enhancements.push('wheels rotate backward as the vehicle reverses');
    } else if (direction === 'left' || direction === 'right') {
      enhancements.push(`wheels rotate appropriately for a ${direction} turn, with proper steering angle`);
    }
  }

  // Add motion details for better video generation
  if (addMotionDetails && !lowerPrompt.includes('motion blur') && !lowerPrompt.includes('movement')) {
    enhancements.push('smooth, realistic motion with appropriate motion blur');
  }

  // Add physical consistency
  if (!lowerPrompt.includes('consistent') && !lowerPrompt.includes('realistic')) {
    enhancements.push('physically consistent movement, maintaining vehicle proportions and details');
  }

  // Combine original prompt with enhancements
  if (enhancements.length > 0) {
    const enhancementText = enhancements.join(', ');
    return `${originalPrompt}, ${enhancementText}`;
  }

  return originalPrompt;
}

/**
 * Creates a negative prompt for automotive video generation
 * to avoid common issues
 */
export function createAutomotiveNegativePrompt(): string {
  return [
    'missing headlights',
    'headlights not lit',
    'incorrect headlight placement',
    'wheels spinning backwards',
    'wheels rotating in wrong direction',
    'wheels spinning opposite to movement',
    'unrealistic wheel rotation',
    'disconnected wheels',
    'floating wheels',
    'wheels not touching ground',
    'inconsistent motion',
    'jerky movement',
    'unnatural motion',
    'physics errors',
    'distorted vehicle',
    'missing vehicle parts',
    'broken geometry',
    'artifacts',
    'glitches',
    'low quality',
    'blurry',
    'distorted',
  ].join(', ');
}

/**
 * Main function to enhance any video prompt
 * Automatically detects content type and applies appropriate enhancements
 */
export function enhanceVideoPrompt(
  originalPrompt: string,
  options: {
    ensureHeadlights?: boolean;
    ensureCorrectWheelRotation?: boolean;
    addMotionDetails?: boolean;
    useNegativePrompt?: boolean;
  } = {}
): {
  enhancedPrompt: string;
  negativePrompt?: string;
} {
  const enhancedPrompt = enhanceVideoPromptForAutomotive(originalPrompt, options);
  
  const result: { enhancedPrompt: string; negativePrompt?: string } = {
    enhancedPrompt,
  };

  if (options.useNegativePrompt !== false && isAutomotiveContent(originalPrompt)) {
    result.negativePrompt = createAutomotiveNegativePrompt();
  }

  return result;
}

