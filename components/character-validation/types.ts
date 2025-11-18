// ============================================================================
// Types and Interfaces for Character Validation
// ============================================================================

// Re-export types from project store
export type ValidationStage = 'confirmation' | 'main-reference' | 'angle-selection' | 'angle-generation' | 'complete';
export type AngleType = 'front' | 'rear' | 'left-side' | 'right-side' | 'front-left-45' | 'front-right-45' | 'top' | 'low-angle';
export type { CharacterReferenceImage } from '@/lib/state/project-store';

// ============================================================================
// Stage Props Interfaces
// ============================================================================

export interface ProgressIndicatorProps {
  currentStage: ValidationStage;
  totalStages: number;
}

export interface ConfirmationStageProps {
  onContinue: () => void;
}

export interface MainReferenceStageProps {
  onContinue: () => void;
}

export interface AngleSelectionStageProps {
  onContinue: () => void;
}

export interface AngleGenerationStageProps {
  onComplete: () => void;
}

// ============================================================================
// Generation State Interfaces
// ============================================================================

export interface GenerationState {
  isGenerating: boolean;
  generatedImage: string | null;
  error: string | null;
}

export interface ProcessingState {
  isProcessing: boolean;
  error: string | null;
}

// ============================================================================
// Angle Definition Interfaces
// ============================================================================

export interface AngleDefinition {
  label: string;
  prompt: string;
  description?: string;
}

export interface AngleOption extends AngleDefinition {
  id: AngleType;
}

// ============================================================================
// Hook Parameter Interfaces
// ============================================================================

export interface ImageGenerationParams {
  prompt: string;
  projectId: string;
  sceneIndex?: number;
  referenceImageUrls?: string[];
  model?: string;
}

export interface ImageProcessingParams {
  imageUrls: string[];
  projectId: string;
}

export interface PollingParams {
  predictionId: string;
  projectId: string;
  sceneIndex: number;
  onSuccess: (imageUrl: string) => void;
  onError: (error: string) => void;
  onStatus?: (status: string) => void;
}

// ============================================================================
// UI Component Props
// ============================================================================

export interface ErrorDisplayProps {
  error: string | null;
  onDismiss: () => void;
}

export interface ImagePreviewProps {
  src: string;
  alt: string;
  badge?: string;
  className?: string;
  onClick?: () => void;
}

export interface ActionButtonsProps {
  onSkip?: () => void;
  onContinue?: () => void;
  continueDisabled?: boolean;
  continueText?: string;
  showSkip?: boolean;
}
