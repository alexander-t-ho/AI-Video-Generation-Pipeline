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
  videoPrompt: string;       // Detailed prompt for video generation (motion/action description)
  negativePrompt?: string;   // Optional: Negative prompt (what to avoid)
  customDuration?: number;   // Optional: Custom duration in seconds (overrides suggestedDuration)
  customImageInput?: string | string[]; // Optional: Custom image input URL(s) for image-to-image generation (up to 3 images)
  useSeedFrame?: boolean;    // Optional: Whether to use seed frame from previous scene (default: true for scenes > 0)
  modelParameters?: Record<string, any>; // Optional: Model-specific parameters for video generation (e.g., aspect_ratio, resolution, seed, etc.)
  referenceImageId?: string; // Optional: ID of selected reference/seed image
  backgroundImageId?: string; // Optional: ID of selected background image
  compositeImageId?: string;  // Optional: ID of generated composite image (reference + background)
  referenceImageUrls?: string[]; // Optional: Per-scene reference image URLs (up to 3) - AI-selected based on scene type
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

/**
 * Image Generation Request
 * 
 * Parameters for generating images with AI models.
 * 
 * Media Drawer Mapping:
 * - seedImage: Receives URL from PURPLE-highlighted image (mediaDrawer.seedImageId)
 *   This maps to model-specific parameters in image-generator.ts:
 *   * Runway Gen-4 Image → 'image' parameter
 *   * FLUX models → 'image' parameter  
 *   * Nano Banana → 'image_input' array parameter
 * 
 * - referenceImageUrls: Receives URLs from YELLOW-highlighted images (mediaDrawer.selectedItems)
 *   Used for IP-Adapter or reference consistency
 */
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
  status: 'STORYBOARD' | 'SCENE_GENERATION' | 'STITCHING' | 'COMPLETED';
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
  backgroundImages?: Array<import('./storage/image-storage').UploadedImage>; // Background images uploaded separately

  // Brand identity context (for asset-based generation)
  assetDescription?: string; // Description of selected asset (e.g., "Porsche 911 Carrera (2010)")
  selectedColor?: string; // Hex color code of last selected color
  currentReferenceImageUrl?: string; // URL of currently displayed reference image in AssetViewer

  // Additional media (user-uploaded images, videos, audio for custom use)
  additionalMedia?: AdditionalMediaItem[];

  // Saved images (images saved from generated content to media drawer for reuse across scenes)
  savedImages?: SavedImage[];
}

// Additional media item (for user-uploaded custom media)
export interface AdditionalMediaItem {
  id: string;
  type: 'image' | 'video' | 'audio';
  url: string;
  localPath?: string;
  s3Key?: string;
  originalName?: string;
  createdAt: string;
  fileSize?: number;
  duration?: number; // For video/audio
  thumbnailUrl?: string; // For video
}

// Saved image item (images saved from generated content for reuse)
export interface SavedImage {
  id: string;                // UUID v4
  url: string;               // S3 URL or API URL (for external access)
  localPath: string;         // Full local file path (for server-side use)
  s3Key?: string;            // S3 storage key
  prompt?: string;           // Original prompt used for generation
  sourceSceneIndex?: number; // Scene index where this was originally generated
  sourceType: 'generated' | 'seed-frame' | 'uploaded' | 'background'; // Source of the image
  savedAt: string;           // ISO 8601 timestamp when saved
  name?: string;             // Optional custom name for the saved image
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
  timestamp: number;        // 0.0s (last frame from video)
}

// ============================================================================
// Timeline Clip Types
// ============================================================================

/**
 * Represents a clip on the timeline that can be edited
 * Can be either a video clip or an image clip
 */
export interface TimelineClip {
  id: string;                // UUID v4
  type: 'video' | 'image';   // Type of clip
  sceneIndex: number;        // Original scene index this clip came from (or -1 for added images)
  sceneId: string;           // Original scene ID (or generated ID for images)
  title: string;             // Clip title (usually scene description)

  // Video clip properties
  videoId?: string;          // Reference to GeneratedVideo ID (for video clips)
  videoLocalPath?: string;   // Local path to the source video file (for video clips)

  // Image clip properties
  imageUrl?: string;         // URL to image file (for image clips)
  imageLocalPath?: string;   // Local path to image file (for image clips)
  animation?: 'none' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'fade'; // Animation for image clips

  startTime: number;         // Start time in the timeline (seconds)
  duration: number;          // Duration of this clip (seconds)

  // Editing properties
  trimStart?: number;        // Trim start point in source video (seconds, default: 0)
  trimEnd?: number;          // Trim end point in source video (seconds, default: full duration)
  isSplit?: boolean;         // Whether this clip was created by splitting
  originalClipId?: string;   // If split, reference to original clip ID

  // Computed properties
  endTime: number;           // End time in timeline (startTime + duration)
  sourceDuration: number;   // Original source video/image duration before trimming
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
// Audio Track Types
// ============================================================================

/**
 * Represents an audio track on the timeline
 */
export interface AudioTrack {
  id: string;                // UUID v4
  title: string;             // Track name/title
  audioUrl: string;          // URL to audio file
  audioLocalPath?: string;   // Local path to audio file
  s3Key?: string;            // S3 storage key
  startTime: number;         // Start time in timeline (seconds)
  duration: number;          // Duration of audio (seconds)
  volume: number;            // Volume level (0-100)
  fadeIn?: number;           // Fade in duration (seconds)
  fadeOut?: number;          // Fade out duration (seconds)
  trimStart?: number;        // Trim start point in source audio (seconds)
  trimEnd?: number;          // Trim end point in source audio (seconds)

  // Computed properties
  endTime: number;           // End time in timeline (startTime + duration)
  sourceDuration: number;    // Original source audio duration before trimming
}

// ============================================================================
// Narration Track Types
// ============================================================================

/**
 * Available OpenAI TTS HD voices
 */
export type NarrationVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

/**
 * Represents a narration track on the timeline
 */
export interface NarrationTrack {
  id: string;                // UUID v4
  title: string;             // Track name/title
  text: string;              // Original narration text
  audioUrl: string;          // URL to audio file
  audioLocalPath?: string;   // Local path to audio file
  s3Key?: string;            // S3 storage key
  startTime: number;         // Start time in timeline (seconds)
  duration: number;          // Duration of narration (seconds)
  volume: number;            // Volume level (0-100)
  voice: NarrationVoice;     // Voice used for TTS
  speed: number;             // Speed multiplier (0.25-4.0)
  fadeIn?: number;           // Fade in duration (seconds)
  fadeOut?: number;          // Fade out duration (seconds)
  trimStart?: number;        // Trim start point in source audio (seconds)
  trimEnd?: number;          // Trim end point in source audio (seconds)

  // Computed properties
  endTime: number;           // End time in timeline (startTime + duration)
  sourceDuration: number;    // Original source audio duration before trimming
}

// ============================================================================
// Image Track Types
// ============================================================================

/**
 * Represents an image track on the timeline
 */
export interface ImageTrack {
  id: string;                // UUID v4
  title: string;             // Track name/title
  imageUrl: string;          // URL to image file
  imageLocalPath?: string;   // Local path to image file
  s3Key?: string;            // S3 storage key
  startTime: number;         // Start time in timeline (seconds)
  duration: number;          // Duration to display image (seconds)

  // Animation properties
  animation?: 'none' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'fade'; // Ken Burns effect

  // Computed properties
  endTime: number;           // End time in timeline (startTime + duration)
}

// ============================================================================
// Text Overlay Types
// ============================================================================

/**
 * Animation types for text overlays
 */
export type TextOverlayAnimation = 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down';

/**
 * Text alignment options
 */
export type TextAlign = 'left' | 'center' | 'right';

/**
 * Font weight options
 */
export type FontWeight = 'normal' | 'bold';

/**
 * Represents a text overlay on the timeline
 */
export interface TextOverlay {
  id: string;                       // UUID v4
  text: string;                     // Text content
  startTime: number;                // Start time in timeline (seconds)
  duration: number;                 // Duration to display overlay (seconds)

  // Position (0-1, percentage of video dimensions)
  x: number;                        // X position (0 = left, 1 = right)
  y: number;                        // Y position (0 = top, 1 = bottom)

  // Text styling
  fontSize: number;                 // Font size in pixels (default: 48)
  fontFamily: string;               // Font family (default: "Arial")
  fontColor: string;                // Hex color code (default: "#FFFFFF")
  fontWeight: FontWeight;           // Font weight (default: "normal")
  textAlign: TextAlign;             // Text alignment (default: "center")
  opacity: number;                  // Text opacity 0-1 (default: 1.0)
  rotation: number;                 // Rotation in degrees (default: 0.0)

  // Background styling
  backgroundColor?: string;         // Optional background color (hex)
  backgroundOpacity: number;        // Background opacity 0-1 (default: 0.0)

  // Border/outline styling
  borderWidth: number;              // Border/outline width (default: 0)
  borderColor?: string;             // Border/outline color (hex)

  // Shadow styling
  shadowEnabled: boolean;           // Enable drop shadow (default: false)
  shadowOffsetX: number;            // Shadow X offset in pixels (default: 2)
  shadowOffsetY: number;            // Shadow Y offset in pixels (default: 2)
  shadowBlur: number;               // Shadow blur radius in pixels (default: 4)
  shadowColor: string;              // Shadow color (hex, default: "#000000")

  // Animations
  animationIn?: TextOverlayAnimation;  // Entry animation
  animationOut?: TextOverlayAnimation; // Exit animation

  // Layering
  order: number;                    // Z-index for layering

  // Computed properties
  endTime: number;                  // End time in timeline (startTime + duration)
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

