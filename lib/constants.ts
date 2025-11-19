import { AngleType, AngleDefinition, AngleOption } from './types';

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
