import type { AngleType, AngleDefinition, AngleOption } from './types';

// ============================================================================
// Angle Definitions and Options
// ============================================================================

export const ANGLE_DEFINITIONS: Record<AngleType, AngleDefinition> = {
  'front': {
    label: 'Front View',
    prompt: 'Front view, head-on, centered, automotive photography, studio lighting, orthographic view'
  },
  'rear': {
    label: 'Rear View',
    prompt: 'Rear view, back angle, centered, automotive photography, studio lighting'
  },
  'left-side': {
    label: 'Left Side Profile',
    prompt: 'Left side profile, 90-degree side view, automotive photography, studio lighting'
  },
  'right-side': {
    label: 'Right Side Profile',
    prompt: 'Right side profile, 90-degree side view, automotive photography, studio lighting'
  },
  'front-left-45': {
    label: 'Front 3/4 Left',
    prompt: 'Front 3/4 view, 45-degree front-left angle, automotive photography'
  },
  'front-right-45': {
    label: 'Front 3/4 Right',
    prompt: 'Front 3/4 view, 45-degree front-right angle, automotive photography'
  },
  'top': {
    label: 'Top View',
    prompt: 'Top-down view, aerial view, bird\'s eye perspective, automotive photography'
  },
  'low-angle': {
    label: 'Low Angle',
    prompt: 'Low angle hero shot, dramatic perspective, automotive photography'
  }
};

export const ANGLE_OPTIONS: AngleOption[] = [
  {
    id: 'front',
    label: 'Front View',
    description: 'Head-on, centered automotive photography',
    prompt: 'Front view, head-on, centered, automotive photography, studio lighting, orthographic view'
  },
  {
    id: 'left-side',
    label: 'Left Side Profile',
    description: 'Driver side, 90-degree profile view',
    prompt: 'Left side profile, 90-degree side view, automotive photography, studio lighting'
  },
  {
    id: 'front-left-45',
    label: 'Front 3/4 Left',
    description: '45-degree front-left angle view',
    prompt: 'Front 3/4 view, 45-degree front-left angle, automotive photography'
  }
];

// ============================================================================
// Polling Configuration
// ============================================================================

export const POLLING_CONFIG = {
  maxAttempts: 70, // ~10 minutes max (with exponential backoff: 2s -> 10s max delay)
  baseDelay: 2000, // Start with 2 seconds
  maxDelay: 10000, // Maximum 10 seconds between attempts
  backoffFactor: 1.3 // Exponential backoff multiplier
} as const;

// ============================================================================
// Generation Prompts and Suffixes
// ============================================================================

export const GENERATION_PROMPTS = {
  automotiveContext: '. Professional automotive photography, studio lighting, clean background, high detail, photorealistic.',
  turnaroundPrefix: 'Professional automotive turnaround reference sheet.',
  turnaroundSuffix: '. Style: Professional car design reference sheet, automotive photography, studio lighting, white/neutral background, orthographic views. Layout: Multiple views arranged horizontally in one image (like a character turnaround sheet in animation/game design). Each view must show the exact same vehicle from a different angle, maintaining consistent lighting and style across all angles. This should look like a professional automotive design turnaround/reference sheet used in car design studios.',
  defaultCharacterFallback: 'Character from your video prompt'
} as const;

// ============================================================================
// UI Constants
// ============================================================================

export const UI_CONFIG = {
  maxRetries: 3,
  uploadTimeout: 30000, // 30 seconds
  generationTimeout: 300000, // 5 minutes
  imagePreviewSize: 'max-w-md',
  gridCols: {
    small: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5',
    medium: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
    large: 'grid-cols-2 md:grid-cols-4'
  }
} as const;
