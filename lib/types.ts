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
  description: string;       // Narrative description of the scene
  suggestedDuration: number; // Duration in seconds
  imagePrompt: string;       // Detailed visual prompt for image generation
  negativePrompt?: string;   // Optional: Negative prompt (what to avoid)
  customDuration?: number;   // Optional: Custom duration in seconds (overrides suggestedDuration)
  customImageInput?: string | string[]; // Optional: Custom image input URL(s) for image-to-image generation (up to 3 images)
  useSeedFrame?: boolean;    // Optional: Whether to use seed frame from previous scene (default: true for scenes > 0)
}

export interface StoryboardRequest {
  prompt: string;
  targetDuration?: number;   // Default: 15
  referenceImageUrls?: string[]; // Optional: URLs of uploaded reference images
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
  url: string;               // S3 URL or API URL (for external access)
  localPath: string;         // Full local file path (for server-side use)
  s3Key?: string;            // S3 storage key
  prompt: string;            // Prompt used for generation
  replicateId: string;       // Replicate prediction ID
  createdAt: string;         // ISO 8601 timestamp
}

export interface ImageGenerationRequest {
  prompt: string;
  projectId: string;
  sceneIndex: number;
  seedImage?: string;        // Optional seed image URL for image-to-image
  referenceImageUrls?: string[]; // Optional: URLs of uploaded reference images for style/context
  seedFrame?: string;        // Optional: Seed frame URL for IP-Adapter (for visual continuity in scenes 1-4)
  negativePrompt?: string;   // Optional: Negative prompt (what to avoid)
  promptAdjustmentMode?: 'disabled' | 'less-aggressive' | 'scene-specific'; // Optional: How to adjust prompts when reference images are present
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
  name?: string;
  prompt: string;
  targetDuration: number; // 15, 30, or 60 seconds
  status: 'storyboard' | 'scene_generation' | 'stitching' | 'completed';
  createdAt: string;
  
  storyboard: Scene[];
  currentSceneIndex: number;
  
  finalVideoUrl?: string;
  finalVideoS3Key?: string;
  referenceImageUrls?: string[]; // Optional: URLs of uploaded reference images for object consistency (backward compatibility)
  characterReferences?: string[]; // Optional: URLs of validated character/product reference images
  characterDescription?: string; // Optional: Description of the character/product
  uploadedImageUrls?: string[]; // Optional: Original uploaded image URLs (before background removal)
  uploadedImages?: Array<import('./storage/image-storage').UploadedImage>; // Full uploaded image objects with processed versions
  
  // Brand identity context (for asset-based generation)
  assetDescription?: string; // Description of selected asset (e.g., "Porsche 911 Carrera (2010)")
  selectedColor?: string; // Hex color code of last selected color
  currentReferenceImageUrl?: string; // URL of currently displayed reference image in AssetViewer
}

// Extended Scene type for project state (includes generation state)
export interface SceneWithState extends Scene {
  // Image generation state
  generatedImages: GeneratedImage[];
  selectedImageId?: string;

  // Video generation state
  generatedVideos?: GeneratedVideo[];  // Array of all generated videos (old and new)
  selectedVideoId?: string;             // ID of currently selected video
  videoLocalPath?: string;              // Deprecated: Use selectedVideoId instead (kept for backward compatibility)
  videoS3Key?: string;                  // Deprecated: Use selectedVideoId instead (kept for backward compatibility)
  actualDuration?: number;              // Deprecated: Use selectedVideoId instead (kept for backward compatibility)

  // Seed frames for NEXT scene (not present in Scene 4)
  seedFrames?: SeedFrame[];
  selectedSeedFrameIndex?: number;

  status: 'pending' | 'generating_image' | 'image_ready' | 'generating_video' | 'video_ready' | 'completed';
}

// ============================================================================
// Generated Video Types
// ============================================================================

export interface GeneratedVideo {
  id: string;
  url: string;              // S3 URL or public HTTP/HTTPS URL
  localPath: string;        // Local file path
  s3Key?: string;           // Optional: S3 key if uploaded
  actualDuration?: number;   // Optional: Actual duration in seconds
  timestamp: string;        // ISO timestamp when generated
  prompt?: string;           // Optional: Prompt used for generation
}

// ============================================================================
// Seed Frame Types
// ============================================================================

export interface SeedFrame {
  id: string;
  url: string;              // S3 URL or public HTTP/HTTPS URL (for video generation)
  localPath?: string;       // Optional: Local file path (for reference/fallback)
  s3Key?: string;           // Optional: S3 storage key
  timestamp: number;        // 0.1s, 0.2s, 0.3s, 0.4s, 0.5s from end
}

// ============================================================================
// Timeline Clip Types
// ============================================================================

/**
 * Represents a clip on the timeline that can be edited
 */
export interface TimelineClip {
  id: string;                // UUID v4
  sceneIndex: number;        // Original scene index this clip came from
  sceneId: string;           // Original scene ID
  title: string;             // Clip title (usually scene description)
  videoId: string;           // Reference to GeneratedVideo ID
  videoLocalPath: string;    // Local path to the source video file
  startTime: number;         // Start time in the timeline (seconds)
  duration: number;          // Duration of this clip (seconds)
  
  // Editing properties
  trimStart?: number;        // Trim start point in source video (seconds, default: 0)
  trimEnd?: number;          // Trim end point in source video (seconds, default: full duration)
  isSplit?: boolean;         // Whether this clip was created by splitting
  originalClipId?: string;   // If split, reference to original clip ID
  
  // Computed properties
  endTime: number;           // End time in timeline (startTime + duration)
  sourceDuration: number;   // Original source video duration before trimming
}

/**
 * Timeline editing operations
 */
export type TimelineEditOperation = 
  | { type: 'split'; clipId: string; splitTime: number }      // Split clip at time
  | { type: 'delete'; clipId: string }                        // Delete clip
  | { type: 'crop'; clipId: string; trimStart: number; trimEnd: number }  // Crop/trim clip
  | { type: 'move'; clipId: string; newStartTime: number };   // Move clip position

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

// ============================================================================
// Character Generation Types
// ============================================================================

export interface CharacterGenerationOptions {
  description: string;
  projectId: string;
  count?: number;
  mode: 'batch' | 'single';
  generateTurnaround?: boolean;
  referenceImages?: string[];
  feedback?: string;
  selectedReferenceImage?: string;
  model?: string;
  ipAdapterScale?: number;
}

export interface CharacterVariation {
  id: string;
  url: string;
  type: 'turnaround' | 'closeup' | 'full-body' | 'detail';
  angle: number;
  scale: 'full' | 'medium' | 'close';
  metadata?: {
    prompt: string;
    model: string;
    replicateId: string;
  };
}

// ============================================================================
// Brand Identity / Character Validation Types
// ============================================================================

export type AngleType = 'front' | 'rear' | 'left-side' | 'right-side' | 'front-left-45' | 'front-right-45' | 'top' | 'low-angle';

export interface AngleDefinition {
  label: string;
  prompt: string;
  description?: string;
}

export interface AngleOption extends AngleDefinition {
  id: AngleType;
}

export type ValidationStage = 'confirmation' | 'main-reference' | 'angle-selection' | 'angle-generation' | 'complete';

