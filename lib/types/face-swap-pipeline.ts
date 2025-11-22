/**
 * Type definitions for Face Swap Video Pipeline
 */

export type PipelinePhase = 
  | 'idle'
  | 'extracting_frames'
  | 'classifying_frames'
  | 'detecting_key_frames'
  | 'swapping_faces'
  | 'replacing_person'
  | 'replacing_car'
  | 'enhancing'
  | 'reconstructing_video'
  | 'completed'
  | 'failed';

export type FrameClassification = 
  | 'face_closeup'
  | 'full_body'
  | 'car_visible'
  | 'environment_only'
  | 'unknown';

export interface FrameMetadata {
  frameNumber: number;
  timestamp: number; // in seconds
  path: string;
  url?: string; // S3 URL if uploaded
  classification?: FrameClassification;
  isKeyFrame?: boolean;
}

export interface VideoProcessingRequest {
  videoFile: File;
  referenceFaceImage?: File;
  referencePersonImage?: File;
  referenceCarImage?: File;
  processingOptions: ProcessingOptions;
}

export interface ProcessingOptions {
  frameExtractionRate?: number; // Extract every Nth frame, or by time interval
  extractByTimeInterval?: number; // Extract frame every N seconds
  processKeyFramesOnly?: boolean;
  enableFaceSwap?: boolean;
  enablePersonReplacement?: boolean;
  enableCarReplacement?: boolean;
  enableEnhancement?: boolean;
  enableUpscaling?: boolean;
  enableColorMatching?: boolean;
  enableFrameInterpolation?: boolean;
  faceSwapModel?: 'simple' | 'advanced';
  faceEnhancementModel?: 'gfpgan' | 'codeformer';
  upscalingModel?: 'real-esrgan' | 'realesrgan';
  personReplacementPrompt?: string; // Custom prompt for person replacement
  carReplacementPrompt?: string; // Custom prompt for car replacement
}

export interface ProcessingJob {
  id: string;
  projectId: string;
  phase: PipelinePhase;
  progress: number; // 0-100
  totalFrames: number;
  processedFrames: number;
  frames: FrameMetadata[];
  keyFrames: number[]; // Frame numbers that are key frames
  errors: string[];
  resultVideoUrl?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ProcessingStatus {
  jobId: string;
  phase: PipelinePhase;
  progress: number;
  totalFrames: number;
  processedFrames: number;
  currentFrame?: number;
  errors: string[];
  resultVideoUrl?: string;
}

export interface SceneClassificationResult {
  frameNumber: number;
  classification: FrameClassification;
  confidence?: number;
  detectedObjects?: string[];
}

