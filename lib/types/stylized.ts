/**
 * Type definitions for stylized preview feature
 */

export interface PresetStyle {
  id: string;
  name: string;
  description: string;
  promptEnhancement: string; // Style-specific prompt additions
  examplePrompt: string; // Example prompt showcasing the style
  colorPalette?: string; // Optional color description
  cameraStyle?: string; // Optional camera movement description
}

export interface StylizedPreview {
  id: string;
  styleId: string;
  styleName: string;
  subjectImageUrl: string;
  prompt: string;
  videoUrl?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  predictionId?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface StylizedPreviewRequest {
  subjectImageUrl: string;
  selectedStyles: string[]; // Array of style IDs
  basePrompt?: string; // Optional base prompt, will be auto-generated if not provided
}

export interface StylizedPreviewResponse {
  success: boolean;
  previews?: StylizedPreview[];
  error?: string;
}

/**
 * Compositing request for car-background compositing
 */
export interface CompositingRequest {
  carImageUrl: string;
  backgroundImageUrl: string;
  styleId: string;
  carPosition?: { x: number; y: number }; // Optional positioning (for future use)
  carScale?: number; // Optional scaling (for future use)
}

/**
 * Compositing result
 */
export interface CompositingResult {
  id: string;
  compositeImageUrl: string;
  processedCarImageUrl: string; // Car after color matching and style effects
  styleId: string;
  styleName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  createdAt: string;
  completedAt?: string;
}

/**
 * Compositing response
 */
export interface CompositingResponse {
  success: boolean;
  result?: CompositingResult;
  error?: string;
}

/**
 * Preset directing styles for automotive commercials
 */
export const PRESET_STYLES: PresetStyle[] = [
  {
    id: 'wes-anderson',
    name: 'Wes Anderson',
    description: 'Symmetrical composition, pastel colors, centered framing, flat depth of field',
    promptEnhancement: 'symmetrical composition, pastel color palette, centered framing, flat depth of field, whimsical aesthetic, STATIC CAMERA SHOT (no panning, no tracking, no dynamic movement), perfectly centered, slow controlled dolly movement only if any movement, retro color grading, NO camera panning, NO dynamic camera movement',
    examplePrompt: 'A luxury car in a perfectly symmetrical shot, pastel pink and mint green color palette, centered framing, flat depth of field, whimsical Wes Anderson aesthetic',
    colorPalette: 'Pastel colors (pink, mint, yellow, blue), soft and muted tones',
    cameraStyle: 'Precise, controlled movements, often static or slow dolly shots, perfectly centered',
  },
  {
    id: 'david-fincher',
    name: 'David Fincher',
    description: 'Dark, high contrast, desaturated colors, precise camera movements, moody atmosphere',
    promptEnhancement: 'dark and moody atmosphere, high contrast lighting, desaturated color palette, precise camera movements, cinematic shadows, dramatic composition',
    examplePrompt: 'A sleek car in dark, moody lighting with high contrast, desaturated colors, precise camera movements, dramatic shadows, David Fincher aesthetic',
    colorPalette: 'Desaturated, dark tones, high contrast, often blue/green tinted',
    cameraStyle: 'Precise, controlled, often slow push-ins or tracking shots, smooth and calculated',
  },
  {
    id: 'denis-villeneuve',
    name: 'Denis Villeneuve',
    description: 'Epic scale, dramatic lighting, slow movements, atmospheric, minimalist composition',
    promptEnhancement: 'epic scale and scope, dramatic natural lighting, slow and deliberate camera movements, atmospheric and minimalist composition, vast landscapes, cinematic grandeur',
    examplePrompt: 'An epic shot of a car in a vast desert landscape, dramatic natural lighting, slow camera movements, atmospheric and minimalist, Denis Villeneuve aesthetic',
    colorPalette: 'Natural, often desaturated, emphasis on earth tones and dramatic skies',
    cameraStyle: 'Slow, deliberate movements, wide shots emphasizing scale, atmospheric',
  },
  {
    id: 'spike-jonze',
    name: 'Spike Jonze',
    description: 'Quirky, dynamic, creative angles, vibrant colors, playful camera work',
    promptEnhancement: 'quirky and dynamic composition, creative camera angles, vibrant color palette, playful camera movements, energetic and creative framing',
    examplePrompt: 'A car in a quirky, dynamic shot with creative angles, vibrant colors, playful camera movements, energetic framing, Spike Jonze aesthetic',
    colorPalette: 'Vibrant, saturated colors, often bold and playful',
    cameraStyle: 'Dynamic, creative angles, often handheld or with creative movement, energetic',
  },
  {
    id: 'greta-gerwig',
    name: 'Greta Gerwig',
    description: 'Natural lighting, warm tones, character-focused, organic movement, authentic feel',
    promptEnhancement: 'natural and warm lighting, warm color tones, character-focused composition, organic camera movements, authentic and genuine feel, soft and inviting atmosphere',
    examplePrompt: 'A car in natural, warm lighting with warm color tones, organic camera movements, authentic and genuine feel, Greta Gerwig aesthetic',
    colorPalette: 'Warm, natural tones, often golden hour lighting, inviting and soft',
    cameraStyle: 'Organic, natural movements, often handheld, character-focused framing',
  },
  {
    id: 'christopher-nolan',
    name: 'Christopher Nolan',
    description: 'Epic scale, dramatic angles, high contrast, cinematic, bold composition',
    promptEnhancement: 'epic scale and dramatic angles, high contrast lighting, bold and cinematic composition, dramatic camera movements, intense and powerful atmosphere',
    examplePrompt: 'An epic shot of a car with dramatic angles, high contrast lighting, bold composition, dramatic camera movements, Christopher Nolan aesthetic',
    colorPalette: 'High contrast, often cool tones with dramatic highlights, cinematic',
    cameraStyle: 'Dramatic, often wide angles, bold movements, epic scale emphasis',
  },
];

