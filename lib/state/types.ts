import { ProjectState, Scene, SceneWithState, GeneratedImage, GeneratedVideo, SeedFrame, AngleType, TimelineClip, AudioTrack, ImageTrack, TextOverlay, NarrationTrack, NarrationVoice } from '@/lib/types';
import { ViewMode, MediaDrawerState, DragDropState, ChatMessage } from '@/lib/types/components';
import { UploadedImage } from '@/lib/storage/image-storage';

export type WorkflowStep = 'idle' | 'generating_image' | 'image_ready' | 'generating_video' | 'video_ready' | 'extracting_frames' | 'frames_ready' | 'completed';

export interface CharacterReferenceImage extends GeneratedImage {
  angleType: AngleType;
  generationModel: string;
  isUpscaled: boolean;
  originalPrompt: string;
  consistencyScore?: number;
}

export interface ProjectCoreSlice {
  project: ProjectState | null;
  selectedStyle: 'whimsical' | 'luxury' | 'offroad' | null;
  selectedStylePrompt: string | null;
  needsCharacterValidation: boolean;
  hasUploadedImages: boolean;

  createProject: (name: string, prompt: string, targetDuration?: number, characterDescription?: string) => Promise<void>;
  saveProjectToBackend: (name: string, prompt: string, targetDuration?: number, characterDescription?: string) => Promise<string>;
  updateProject: (updates: Partial<ProjectState>) => void;
  updateProjectMetadata: (updates: {
    name?: string;
    characterDescription?: string;
    status?: 'STORYBOARD' | 'SCENE_GENERATION' | 'STITCHING' | 'COMPLETED';
    finalVideoUrl?: string;
    finalVideoS3Key?: string;
    targetDuration?: number;
  }) => Promise<void>;
  setStoryboard: (scenes: Scene[]) => void;
  updateScene: (sceneId: string, updates: Partial<Scene>) => void;
  reorderScenes: (scenes: Scene[]) => void;
  loadProject: (projectId: string) => Promise<void>;
  
  // Character reference management
  setCharacterReferences: (imageUrls: string[]) => void;
  addCharacterReference: (imageUrl: string) => void;
  clearReferenceImages: () => void;
  toggleReferenceImage: (imageUrl: string) => void;
  setCharacterDescription: (description: string) => void;
  setNeedsCharacterValidation: (needs: boolean) => void;
  setHasUploadedImages: (has: boolean) => void;
  setUploadedImageUrls: (urls: string[]) => void;
  setUploadedImages: (images: UploadedImage[]) => void;

  // Brand identity
  setSelectedColor: (color: string) => void;
  setCurrentReferenceImageUrl: (url: string) => void;
  setAssetDescription: (description: string) => void;

  // Style
  setSelectedStyle: (style: 'whimsical' | 'luxury' | 'offroad', prompt: string) => void;

  // Additional media management
  addAdditionalMedia: (mediaItem: import('@/lib/types').AdditionalMediaItem) => void;
  removeAdditionalMedia: (mediaId: string) => void;

  // Saved images management
  addSavedImage: (savedImage: import('@/lib/types').SavedImage) => void;
  removeSavedImage: (imageId: string) => void;

  reset: () => void;
}

export interface SceneSlice {
  scenes: SceneWithState[];
  currentWorkflowStep: WorkflowStep;
  isWorkflowPaused: boolean;
  processingSceneIndex: number | null;
  sceneErrors: Record<number, { message: string; timestamp: string; retryable: boolean }>;

  updateScenePrompt: (sceneIndex: number, imagePrompt: string) => void;
  updateSceneVideoPrompt: (sceneIndex: number, videoPrompt: string) => void;
  updateSceneSettings: (sceneIndex: number, settings: {
    imagePrompt?: string;
    videoPrompt?: string;
    negativePrompt?: string;
    customDuration?: number;
    customImageInput?: string | string[];
    useSeedFrame?: boolean;
    modelParameters?: Record<string, any>;
    referenceImageId?: string;
    backgroundImageId?: string;
    compositeImageId?: string;
    referenceImageUrls?: string[];
  }) => void;
  updateSceneModelParameters: (sceneIndex: number, modelParameters: Record<string, any>) => void;
  
  setSceneStatus: (sceneIndex: number, status: SceneWithState['status']) => void;
  addGeneratedImage: (sceneIndex: number, image: GeneratedImage) => void;
  selectImage: (sceneIndex: number, imageId: string) => void;
  deleteGeneratedImage: (sceneIndex: number, imageId: string) => void;
  setVideoPath: (sceneIndex: number, videoPath: string, actualDuration?: number) => void;
  addGeneratedVideo: (sceneIndex: number, video: GeneratedVideo) => void;
  selectVideo: (sceneIndex: number, videoId: string) => void;
  setSeedFrames: (sceneIndex: number, frames: SeedFrame[]) => void;
  selectSeedFrame: (sceneIndex: number, frameIndex: number) => void;
  setFinalVideo: (url: string, s3Key?: string) => void;

  // Generation helpers
  generateImageForScene: (sceneIndex: number, prompt?: string, seedFrame?: string) => Promise<void>;
  generateVideoForScene: (sceneIndex: number) => Promise<void>;
  extractFramesForScene: (sceneIndex: number) => Promise<void>;
  stitchAllVideos: () => Promise<void>;

  // Workflow
  setWorkflowStep: (step: WorkflowStep) => void;
  setProcessingSceneIndex: (sceneIndex: number | null) => void;
  pauseWorkflow: () => void;
  resumeWorkflow: () => void;

  // Error handling
  setSceneError: (sceneIndex: number, error: { message: string; retryable: boolean }) => void;
  clearSceneError: (sceneIndex: number) => void;
  retrySceneGeneration: (sceneIndex: number) => Promise<void>;

  // Scene duplication
  duplicateScene: (sceneIndex: number) => Promise<Scene>;
}

export interface TimelineSlice {
  timelineClips: TimelineClip[];
  timelineHistory: TimelineClip[][];
  timelineFuture: TimelineClip[][];
  selectedClipId: string | null;

  // Audio tracks
  audioTracks: AudioTrack[];
  selectedAudioTrackId: string | null;

  // Image tracks
  imageTracks: ImageTrack[];
  selectedImageTrackId: string | null;

  setSelectedClipId: (clipId: string | null) => void;
  initializeTimelineClips: () => void;
  addImageClip: (imageUrl: string, duration: number, title?: string, insertAtTime?: number) => void;
  splitClip: (clipId: string, splitTime: number) => void;
  splitAtPlayhead: (time: number) => void;
  deleteClip: (clipId: string) => void;
  cropClip: (clipId: string, trimStart: number, trimEnd: number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Audio track management
  addAudioTrack: (audioUrl: string, title?: string, duration?: number) => void;
  deleteAudioTrack: (trackId: string) => void;
  updateAudioTrack: (trackId: string, updates: Partial<AudioTrack>) => void;
  setSelectedAudioTrackId: (trackId: string | null) => void;

  // Image track management
  addImageTrack: (imageUrl: string, duration: number, title?: string) => void;
  deleteImageTrack: (trackId: string) => void;
  updateImageTrack: (trackId: string, updates: Partial<ImageTrack>) => void;
  setSelectedImageTrackId: (trackId: string | null) => void;

  // Narration track management
  narrationTracks: NarrationTrack[];
  selectedNarrationTrackId: string | null;
  addNarrationTrack: (audioUrl: string, text: string, voice: NarrationVoice, duration: number, title?: string, speed?: number) => void;
  deleteNarrationTrack: (trackId: string) => void;
  updateNarrationTrack: (trackId: string, updates: Partial<NarrationTrack>) => void;
  setSelectedNarrationTrackId: (trackId: string | null) => void;

  // Text overlay management
  textOverlays: TextOverlay[];
  selectedTextOverlayId: string | null;
  addTextOverlay: (text: string, startTime: number, duration?: number) => void;
  deleteTextOverlay: (overlayId: string) => void;
  updateTextOverlay: (overlayId: string, updates: Partial<TextOverlay>) => void;
  setSelectedTextOverlayId: (overlayId: string | null) => void;
  duplicateTextOverlay: (overlayId: string) => void;
}

export interface LiveEditingPrompts {
  imagePrompt?: string;
  videoPrompt?: string;
  negativePrompt?: string;
}

export interface UISlice {
  viewMode: ViewMode;
  currentSceneIndex: number;
  mediaDrawer: MediaDrawerState;
  dragDrop: DragDropState;
  chatMessages: ChatMessage[];
  liveEditingPrompts: Record<number, LiveEditingPrompts>; // sceneIndex -> prompts being edited

  setViewMode: (mode: ViewMode) => void;
  setCurrentSceneIndex: (index: number) => void;
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  updateMediaDrawer: (updates: Partial<MediaDrawerState>) => void;
  updateDragDrop: (updates: Partial<DragDropState>) => void;
  setLiveEditingPrompts: (sceneIndex: number, prompts: LiveEditingPrompts) => void;
  clearLiveEditingPrompts: (sceneIndex: number) => void;

  // Media organization
  toggleMediaItem: (itemId: string) => void;
  selectMediaItem: (itemId: string) => void;
  deselectMediaItem: (itemId: string) => void;
  clearMediaSelection: () => void;
  setMediaFilter: (filter: MediaDrawerState['filters']) => void;
  setMediaSearchQuery: (query: string) => void;

  navigateToWorkspace: (projectId: string) => void;
}

export type ProjectStore = ProjectCoreSlice & SceneSlice & TimelineSlice & UISlice;


