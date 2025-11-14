/**
 * Shared TypeScript interfaces for the AI Video Generation Pipeline
 * 
 * These types are used across the application for:
 * - Storyboard generation
 * - Image generation
 * - Video generation
 * - Project state management
 */

// ============================================================================
// Storyboard Types
// ============================================================================

export interface Scene {
  id: string;                // UUID v4
  order: number;             // 0-4
  description: string;       // Narrative description
  imagePrompt: string;       // Detailed visual prompt for image generation
  suggestedDuration: number; // 2-4 seconds
}

export interface StoryboardRequest {
  prompt: string;
  targetDuration?: number;   // Default: 15
}

export interface StoryboardResponse {
  success: boolean;
  scenes?: Scene[];
  error?: string;
  code?: string;
  retryable?: boolean;
}

// ============================================================================
// Image Generation Types
// ============================================================================

export interface GeneratedImage {
  id: string;                // UUID v4
  url: string;               // Local file path (for internal use)
  localPath: string;         // Full local file path
  prompt: string;            // Prompt used for generation
  replicateId: string;       // Replicate prediction ID
  createdAt: string;         // ISO 8601 timestamp
}

export interface ImageGenerationRequest {
  prompt: string;
  projectId: string;
  sceneIndex: number;
  seedImage?: string;        // Optional seed image URL for image-to-image
}

export interface ImageGenerationResponse {
  success: boolean;
  predictionId?: string;
  status?: 'starting' | 'processing';
  error?: string;
  code?: string;
  retryable?: boolean;
}

export interface ImageStatusResponse {
  success: boolean;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  image?: GeneratedImage;
  error?: string;
  code?: ErrorCode;
  retryable?: boolean;
  progress?: number;
}

// ============================================================================
// Project State Types
// ============================================================================

export interface ProjectState {
  id: string;
  prompt: string;
  targetDuration: number; // 15, 30, or 60 seconds
  status: 'storyboard' | 'scene_generation' | 'stitching' | 'completed';
  createdAt: string;
  
  storyboard: Scene[];
  currentSceneIndex: number;
  
  finalVideoUrl?: string;
  finalVideoS3Key?: string;
}

// Extended Scene type for project state (includes generation state)
export interface SceneWithState extends Scene {
  // Image generation state
  generatedImages: GeneratedImage[];
  selectedImageId?: string;
  
  // Video generation state
  videoLocalPath?: string;
  videoS3Key?: string;
  actualDuration?: number;
  
  // Seed frames for NEXT scene (not present in Scene 4)
  seedFrames?: SeedFrame[];
  selectedSeedFrameIndex?: number;
  
  status: 'pending' | 'generating_image' | 'image_ready' | 'generating_video' | 'video_ready' | 'completed';
}

// ============================================================================
// Seed Frame Types
// ============================================================================

export interface SeedFrame {
  id: string;
  url: string;              // Local file path
  timestamp: number;        // 0.1s, 0.2s, 0.3s, 0.4s, 0.5s from end
}

// ============================================================================
// Error Types
// ============================================================================

export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'GENERATION_FAILED'
  | 'PREDICTION_FAILED'
  | 'POLLING_FAILED'
  | 'RATE_LIMIT'
  | 'NOT_FOUND'
  | 'TIMEOUT'
  | 'AUTHENTICATION_FAILED'
  | 'NETWORK_ERROR'
  | 'VALIDATION_ERROR'
  | 'DOWNLOAD_FAILED';

export interface APIError {
  success: false;
  error: string;
  code?: ErrorCode;
  retryable?: boolean;
}

