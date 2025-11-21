/**
 * Zustand store for project state management
 */

import { create } from 'zustand';
import { ProjectState, Scene, SceneWithState, GeneratedImage, GeneratedVideo, SeedFrame, AngleType, TimelineClip } from '@/lib/types';
import { ViewMode, MediaDrawerState, DragDropState, ChatMessage } from '@/lib/types/components';
import { v4 as uuidv4 } from 'uuid';

type WorkflowStep = 'idle' | 'generating_image' | 'image_ready' | 'generating_video' | 'video_ready' | 'extracting_frames' | 'frames_ready' | 'completed';

export interface CharacterReferenceImage extends GeneratedImage {
  angleType: AngleType;
  generationModel: string;
  isUpscaled: boolean;
  originalPrompt: string;
  consistencyScore?: number; // 0-100, for quality checking
}

interface ProjectStore {
  // Project state
  project: ProjectState | null;

  // Style selection state
  selectedStyle: 'whimsical' | 'luxury' | 'offroad' | null;
  selectedStylePrompt: string | null;

  // Character validation state
  needsCharacterValidation: boolean;
  hasUploadedImages: boolean;

  // UI state
  viewMode: ViewMode;
  currentSceneIndex: number;
  mediaDrawer: MediaDrawerState;
  dragDrop: DragDropState;
  chatMessages: ChatMessage[];

  // Scene state (extended scenes with generation state)
  scenes: SceneWithState[];

  // Timeline state
  timelineClips: TimelineClip[];

  // Timeline undo/redo history
  timelineHistory: TimelineClip[][];
  timelineFuture: TimelineClip[][];
  selectedClipId: string | null;
  
  // Workflow state (Phase 5.1.2)
  currentWorkflowStep: WorkflowStep;
  isWorkflowPaused: boolean;
  processingSceneIndex: number | null;
  
  // Error state (Phase 5.1.3)
  sceneErrors: Record<number, { message: string; timestamp: string; retryable: boolean }>;
  
  // Actions
  createProject: (prompt: string, targetDuration?: number) => void;
  setStoryboard: (scenes: Scene[]) => void;
  updateScene: (sceneId: string, updates: Partial<Scene>) => void;
  reorderScenes: (scenes: Scene[]) => void;
  updateScenePrompt: (sceneIndex: number, imagePrompt: string) => void;
  updateSceneSettings: (sceneIndex: number, settings: {
    imagePrompt?: string;
    negativePrompt?: string;
    customDuration?: number;
    customImageInput?: string | string[];
    useSeedFrame?: boolean;
  }) => void;
  setViewMode: (mode: ViewMode) => void;
  setCurrentSceneIndex: (index: number) => void;
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  updateMediaDrawer: (updates: Partial<MediaDrawerState>) => void;
  updateDragDrop: (updates: Partial<DragDropState>) => void;
  setUploadedImages: (images: Array<import('../storage/image-storage').UploadedImage>) => void;
  
  // Scene generation actions
  setSceneStatus: (sceneIndex: number, status: SceneWithState['status']) => void;
  addGeneratedImage: (sceneIndex: number, image: GeneratedImage) => void;
  selectImage: (sceneIndex: number, imageId: string) => void;
  setVideoPath: (sceneIndex: number, videoPath: string, actualDuration?: number) => void;
  addGeneratedVideo: (sceneIndex: number, video: GeneratedVideo) => void;
  selectVideo: (sceneIndex: number, videoId: string) => void;
  setSeedFrames: (sceneIndex: number, frames: SeedFrame[]) => void;
  selectSeedFrame: (sceneIndex: number, frameIndex: number) => void;
  setFinalVideo: (url: string, s3Key?: string) => void;

  // Generation action helpers (Phase 5.1.1)
  generateImageForScene: (sceneIndex: number, prompt?: string, seedFrame?: string) => Promise<void>;
  generateVideoForScene: (sceneIndex: number) => Promise<void>;
  extractFramesForScene: (sceneIndex: number) => Promise<void>;
  stitchAllVideos: () => Promise<void>;
  
  // Workflow state management (Phase 5.1.2)
  setWorkflowStep: (step: WorkflowStep) => void;
  setProcessingSceneIndex: (sceneIndex: number | null) => void;
  pauseWorkflow: () => void;
  resumeWorkflow: () => void;
  
  // Error state management (Phase 5.1.3)
  setSceneError: (sceneIndex: number, error: { message: string; retryable: boolean }) => void;
  clearSceneError: (sceneIndex: number) => void;
  retrySceneGeneration: (sceneIndex: number) => Promise<void>;
  
  // Media organization
  selectMediaItem: (itemId: string) => void;
  deselectMediaItem: (itemId: string) => void;
  clearMediaSelection: () => void;
  setMediaFilter: (filter: MediaDrawerState['filters']) => void;
  setMediaSearchQuery: (query: string) => void;
  
  // Timeline management
  setSelectedClipId: (clipId: string | null) => void;
  initializeTimelineClips: () => void;
  splitClip: (clipId: string, splitTime: number) => void;
  splitAtPlayhead: (time: number) => void;
  deleteClip: (clipId: string) => void;
  cropClip: (clipId: string, trimStart: number, trimEnd: number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  
  // Navigation
  navigateToWorkspace: (projectId: string) => void;
  loadProject: (projectId: string) => Promise<void>;
  
  // Character reference management
  setCharacterReferences: (imageUrls: string[]) => void;
  addCharacterReference: (imageUrl: string) => void;
  setCharacterDescription: (description: string) => void;
  setNeedsCharacterValidation: (needs: boolean) => void;
  setHasUploadedImages: (has: boolean) => void;
  setUploadedImageUrls: (urls: string[]) => void;
  
  // Brand identity asset management
  setSelectedColor: (color: string) => void;
  setCurrentReferenceImageUrl: (url: string) => void;
  setAssetDescription: (description: string) => void;
  
  // Style selection management
  setSelectedStyle: (style: 'whimsical' | 'luxury' | 'offroad', prompt: string) => void;
  
  reset: () => void;
}

const initialState = {
  project: null,
  selectedStyle: null as 'whimsical' | 'luxury' | 'offroad' | null,
  selectedStylePrompt: null as string | null,
  viewMode: 'storyboard' as ViewMode,
  currentSceneIndex: 0,
  mediaDrawer: {
    selectedItems: [],
    filters: {},
    searchQuery: '',
  },
  dragDrop: {
    isDragging: false,
  },
  chatMessages: [],
  scenes: [] as SceneWithState[],
  timelineClips: [] as TimelineClip[],
  timelineHistory: [] as TimelineClip[][],
  timelineFuture: [] as TimelineClip[][],
  selectedClipId: null as string | null,
  currentWorkflowStep: 'idle' as WorkflowStep,
  isWorkflowPaused: false,
  processingSceneIndex: null as number | null,
  sceneErrors: {} as Record<number, { message: string; timestamp: string; retryable: boolean }>,
  needsCharacterValidation: false,
  hasUploadedImages: false,
};

export const useProjectStore = create<ProjectStore>((set) => ({
  ...initialState,
  
  createProject: (prompt: string, targetDuration = 15) => {
    const project: ProjectState = {
      id: uuidv4(),
      prompt,
      targetDuration,
      status: 'storyboard',
      createdAt: new Date().toISOString(),
      storyboard: [],
      currentSceneIndex: 0,
    };
    
    set({
      project,
      chatMessages: [
        {
          id: uuidv4(),
          role: 'user',
          content: prompt,
          timestamp: new Date().toISOString(),
          type: 'message',
        },
      ],
    });
  },
  
  setStoryboard: (scenes: Scene[]) => {
    set((state) => {
      if (!state.project) return state;

      // Convert scenes to SceneWithState
      const scenesWithState: SceneWithState[] = scenes.map((scene) => ({
        ...scene,
        generatedImages: [],
        status: 'pending',
      }));

      return {
        project: {
          ...state.project,
          storyboard: scenes,
          status: 'scene_generation',
        },
        scenes: scenesWithState,
      };
    });
  },

  updateScene: (sceneId: string, updates: Partial<Scene>) => {
    set((state) => {
      if (!state.project || !state.project.storyboard) return state;

      // Update the scene in the storyboard
      const updatedStoryboard = state.project.storyboard.map((scene) =>
        scene.id === sceneId ? { ...scene, ...updates } : scene
      );

      // Update the scene in scenes array (SceneWithState)
      const updatedScenes = state.scenes.map((sceneWithState) =>
        sceneWithState.id === sceneId
          ? { ...sceneWithState, ...updates }
          : sceneWithState
      );

      return {
        project: {
          ...state.project,
          storyboard: updatedStoryboard,
        },
        scenes: updatedScenes,
      };
    });
  },

  reorderScenes: (reorderedScenes: Scene[]) => {
    set((state) => {
      if (!state.project) return state;

      // Update order property for each scene
      const scenesWithOrder = reorderedScenes.map((scene, index) => ({
        ...scene,
        order: index,
      }));

      // Convert to SceneWithState, preserving existing state
      const scenesWithState: SceneWithState[] = scenesWithOrder.map((scene) => {
        const existingSceneState = state.scenes.find(s => s.id === scene.id);
        return existingSceneState
          ? { ...existingSceneState, ...scene }
          : { ...scene, generatedImages: [], status: 'pending' as const };
      });

      return {
        project: {
          ...state.project,
          storyboard: scenesWithOrder,
        },
        scenes: scenesWithState,
      };
    });
  },
  
  updateScenePrompt: (sceneIndex: number, imagePrompt: string) => {
    set((state) => {
      if (!state.project || !state.project.storyboard[sceneIndex]) return state;
      
      // Update the scene in the storyboard
      const updatedStoryboard = [...state.project.storyboard];
      updatedStoryboard[sceneIndex] = {
        ...updatedStoryboard[sceneIndex],
        imagePrompt,
      };
      
      // Update the scene in scenes array (SceneWithState)
      const updatedScenes = [...state.scenes];
      if (updatedScenes[sceneIndex]) {
        updatedScenes[sceneIndex] = {
          ...updatedScenes[sceneIndex],
          imagePrompt,
        };
      }
      
      return {
        project: {
          ...state.project,
          storyboard: updatedStoryboard,
        },
        scenes: updatedScenes,
      };
    });
  },
  
  updateSceneSettings: (sceneIndex: number, settings: {
    imagePrompt?: string;
    negativePrompt?: string;
    customDuration?: number;
    customImageInput?: string | string[];
    useSeedFrame?: boolean;
  }) => {
    set((state) => {
      if (!state.project || !state.project.storyboard[sceneIndex]) return state;
      
      // Update the scene in the storyboard
      const updatedStoryboard = [...state.project.storyboard];
      updatedStoryboard[sceneIndex] = {
        ...updatedStoryboard[sceneIndex],
        ...settings,
      };
      
      // Update the scene in scenes array (SceneWithState)
      const updatedScenes = [...state.scenes];
      if (updatedScenes[sceneIndex]) {
        updatedScenes[sceneIndex] = {
          ...updatedScenes[sceneIndex],
          ...settings,
        };
      }
      
      return {
        project: {
          ...state.project,
          storyboard: updatedStoryboard,
        },
        scenes: updatedScenes,
      };
    });
  },
  
  setSceneStatus: (sceneIndex: number, status: SceneWithState['status']) => {
    set((state) => {
      const updatedScenes = [...state.scenes];
      if (updatedScenes[sceneIndex]) {
        updatedScenes[sceneIndex] = {
          ...updatedScenes[sceneIndex],
          status,
        };
      }
      return { scenes: updatedScenes };
    });
  },
  
  addGeneratedImage: (sceneIndex: number, image: GeneratedImage) => {
    set((state) => {
      const updatedScenes = [...state.scenes];
      if (updatedScenes[sceneIndex]) {
        updatedScenes[sceneIndex] = {
          ...updatedScenes[sceneIndex],
          generatedImages: [...updatedScenes[sceneIndex].generatedImages, image],
          status: 'image_ready',
        };
      }
      return { scenes: updatedScenes };
    });
  },
  
  selectImage: (sceneIndex: number, imageId: string) => {
    set((state) => {
      const updatedScenes = [...state.scenes];
      if (updatedScenes[sceneIndex]) {
        updatedScenes[sceneIndex] = {
          ...updatedScenes[sceneIndex],
          selectedImageId: imageId,
        };
      }
      return { scenes: updatedScenes };
    });
  },
  
  setVideoPath: (sceneIndex: number, videoPath: string, actualDuration?: number) => {
    set((state) => {
      const updatedScenes = [...state.scenes];
      if (updatedScenes[sceneIndex]) {
        // Create a GeneratedVideo object for the new video
        const videoId = uuidv4();
        const newVideo: GeneratedVideo = {
          id: videoId,
          url: videoPath.startsWith('http://') || videoPath.startsWith('https://') 
            ? videoPath 
            : `/api/serve-video?path=${encodeURIComponent(videoPath)}`,
          localPath: videoPath,
          actualDuration,
          timestamp: new Date().toISOString(),
        };
        
        // Add to generatedVideos array (or create array if it doesn't exist)
        const existingVideos = updatedScenes[sceneIndex].generatedVideos || [];
        
        updatedScenes[sceneIndex] = {
          ...updatedScenes[sceneIndex],
          generatedVideos: [...existingVideos, newVideo],
          selectedVideoId: videoId, // Auto-select the newly generated video
          // Keep backward compatibility
          videoLocalPath: videoPath,
          actualDuration,
          status: 'video_ready',
        };
      }
      return { scenes: updatedScenes };
    });
  },
  
  addGeneratedVideo: (sceneIndex: number, video: GeneratedVideo) => {
    set((state) => {
      const updatedScenes = [...state.scenes];
      if (updatedScenes[sceneIndex]) {
        const existingVideos = updatedScenes[sceneIndex].generatedVideos || [];
        updatedScenes[sceneIndex] = {
          ...updatedScenes[sceneIndex],
          generatedVideos: [...existingVideos, video],
          // Auto-select if no video is currently selected
          selectedVideoId: updatedScenes[sceneIndex].selectedVideoId || video.id,
          // Update backward compatibility fields if this is the selected video
          ...(updatedScenes[sceneIndex].selectedVideoId === video.id || !updatedScenes[sceneIndex].selectedVideoId ? {
            videoLocalPath: video.localPath,
            actualDuration: video.actualDuration,
          } : {}),
        };
      }
      return { scenes: updatedScenes };
    });
  },
  
  selectVideo: (sceneIndex: number, videoId: string) => {
    set((state) => {
      const updatedScenes = [...state.scenes];
      if (updatedScenes[sceneIndex]) {
        // If videoId is empty string, deselect
        if (!videoId) {
          updatedScenes[sceneIndex] = {
            ...updatedScenes[sceneIndex],
            selectedVideoId: undefined,
            // Keep backward compatibility but clear it
            videoLocalPath: undefined,
            actualDuration: undefined,
            videoS3Key: undefined,
          };
        } else {
          const video = updatedScenes[sceneIndex].generatedVideos?.find(v => v.id === videoId);
          if (video) {
            updatedScenes[sceneIndex] = {
              ...updatedScenes[sceneIndex],
              selectedVideoId: videoId,
              // Update backward compatibility fields
              videoLocalPath: video.localPath,
              actualDuration: video.actualDuration,
              videoS3Key: video.s3Key,
            };
          }
        }
      }
      return { scenes: updatedScenes };
    });
  },
  
  setSeedFrames: (sceneIndex: number, frames: SeedFrame[]) => {
    set((state) => {
      const updatedScenes = [...state.scenes];
      if (updatedScenes[sceneIndex]) {
        updatedScenes[sceneIndex] = {
          ...updatedScenes[sceneIndex],
          seedFrames: frames,
        };
      }
      return { scenes: updatedScenes };
    });
  },
  
  selectSeedFrame: (sceneIndex: number, frameIndex: number) => {
    set((state) => {
      const updatedScenes = [...state.scenes];
      if (updatedScenes[sceneIndex]) {
        updatedScenes[sceneIndex] = {
          ...updatedScenes[sceneIndex],
          selectedSeedFrameIndex: frameIndex,
          status: 'completed',
        };
      }
      return { scenes: updatedScenes };
    });
  },
  
  setFinalVideo: (url: string, s3Key?: string) => {
    set((state) => {
      if (!state.project) return state;
      return {
        project: {
          ...state.project,
          finalVideoUrl: url,
          finalVideoS3Key: s3Key,
          status: 'completed',
        },
      };
    });
  },

  selectMediaItem: (itemId: string) => {
    set((state) => {
      const selectedItems = state.mediaDrawer.selectedItems.includes(itemId)
        ? state.mediaDrawer.selectedItems
        : [...state.mediaDrawer.selectedItems, itemId];
      return {
        mediaDrawer: {
          ...state.mediaDrawer,
          selectedItems,
        },
      };
    });
  },
  
  deselectMediaItem: (itemId: string) => {
    set((state) => ({
      mediaDrawer: {
        ...state.mediaDrawer,
        selectedItems: state.mediaDrawer.selectedItems.filter((id) => id !== itemId),
      },
    }));
  },
  
  clearMediaSelection: () => {
    set((state) => ({
      mediaDrawer: {
        ...state.mediaDrawer,
        selectedItems: [],
      },
    }));
  },
  
  setMediaFilter: (filter: MediaDrawerState['filters']) => {
    set((state) => ({
      mediaDrawer: {
        ...state.mediaDrawer,
        filters: { ...state.mediaDrawer.filters, ...filter },
      },
    }));
  },
  
  setMediaSearchQuery: (query: string) => {
    set((state) => ({
      mediaDrawer: {
        ...state.mediaDrawer,
        searchQuery: query,
      },
    }));
  },
  
  navigateToWorkspace: (projectId: string) => {
    // This will be handled by the router in the component
    // Store the project ID for navigation
    if (typeof window !== 'undefined') {
      window.location.href = `/workspace?projectId=${projectId}`;
    }
  },
  
  loadProject: async (projectId: string) => {
    // Check if project is already in store and matches
    const currentProject = useProjectStore.getState().project;
    if (currentProject && currentProject.id === projectId) {
      // Project already loaded
      return;
    }
    
    // TODO: Implement project loading from API/storage
    // For now, projects are only in-memory, so if not in store, it doesn't exist
    // Throw error to trigger redirect to home
    throw new Error('Project not found. Projects are currently only available in the current session.');
  },
  
  setViewMode: (mode: ViewMode) => {
    set({ viewMode: mode });
  },
  
  setCurrentSceneIndex: (index: number) => {
    set({ currentSceneIndex: index });
  },
  
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const chatMessage: ChatMessage = {
      ...message,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
    };
    
    set((state) => ({
      chatMessages: [...state.chatMessages, chatMessage],
    }));
  },
  
  updateMediaDrawer: (updates: Partial<MediaDrawerState>) => {
    set((state) => ({
      mediaDrawer: { ...state.mediaDrawer, ...updates },
    }));
  },
  
  updateDragDrop: (updates: Partial<DragDropState>) => {
    set((state) => ({
      dragDrop: { ...state.dragDrop, ...updates },
    }));
  },

  setUploadedImages: (images) => {
    set((state) => {
      console.log('[ProjectStore] setUploadedImages called', { imageCount: images.length, hasProject: !!state.project });
      if (!state.project) {
        console.warn('[ProjectStore] Cannot set uploaded images - no project exists');
        return state;
      }

      // Extract URLs for backward compatibility
      const referenceImageUrls = images.map(img => img.url);
      console.log('[ProjectStore] Setting referenceImageUrls:', referenceImageUrls);

      return {
        project: {
          ...state.project,
          uploadedImages: images,
          referenceImageUrls, // Keep for backward compatibility
        },
      };
    });
  },
  
  // Generation action helpers (Phase 5.1.1)
  generateImageForScene: async (sceneIndex: number, prompt?: string, seedFrame?: string) => {
    const state = useProjectStore.getState();
    if (!state.project) throw new Error('No project found');
    
    const { generateImage, pollImageStatus } = await import('@/lib/api-client');
    const scene = state.project.storyboard[sceneIndex];
    if (!scene) throw new Error('Invalid scene');
    
    // Use character references as reference images for object consistency
    const referenceImageUrls: string[] = state.project.characterReferences || [];
    
    // OPTION 1: Reference image is the PRIMARY driver for ALL scenes
    // Use reference image as seed (primary) + seed frame via IP-Adapter (for continuity in scenes 1-4)
    const seedImage = referenceImageUrls.length > 0 ? referenceImageUrls[0] : undefined;
    
    const request = {
      prompt: prompt || scene.imagePrompt,
      projectId: state.project.id,
      sceneIndex,
      seedImage, // Reference image as seed (PRIMARY driver for object consistency)
      referenceImageUrls, // Always pass reference images (also used in IP-Adapter)
      seedFrame: sceneIndex > 0 ? seedFrame : undefined, // Seed frame for IP-Adapter (for visual continuity in scenes 1-4)
    };
    
    const response = await generateImage(request);
    if (!response.success || !response.predictionId) {
      throw new Error(response.error || 'Failed to start image generation');
    }
    
    const status = await pollImageStatus(response.predictionId);
    if (status.success && status.image) {
      useProjectStore.getState().addGeneratedImage(sceneIndex, status.image);
    } else {
      throw new Error(status.error || 'Image generation failed');
    }
  },
  
  generateVideoForScene: async (sceneIndex: number) => {
    const state = useProjectStore.getState();
    if (!state.project) throw new Error('No project found');
    
    const { generateVideo, pollVideoStatus } = await import('@/lib/api-client');
    const sceneState = state.scenes[sceneIndex];
    const selectedImage = sceneState?.selectedImageId
      ? sceneState.generatedImages.find(img => img.id === sceneState.selectedImageId)
      : sceneState?.generatedImages[0];
    
    if (!selectedImage) throw new Error('No image available');
    
    const scene = state.project.storyboard[sceneIndex];
    const seedFrameUrl = sceneIndex > 0 && state.scenes[sceneIndex - 1]?.selectedSeedFrameIndex !== undefined
      ? state.scenes[sceneIndex - 1].seedFrames?.[state.scenes[sceneIndex - 1].selectedSeedFrameIndex!]?.url
      : undefined;
    
    const response = await generateVideo(
      selectedImage.url,
      scene.imagePrompt,
      state.project.id,
      sceneIndex,
      seedFrameUrl
    );
    
    if (!response.predictionId) throw new Error('Failed to start video generation');
    
    const status = await pollVideoStatus(response.predictionId);
    if (status.status === 'succeeded' && status.videoPath) {
      useProjectStore.getState().setVideoPath(sceneIndex, status.videoPath);
    } else {
      throw new Error(status.error || 'Video generation failed');
    }
  },
  
  extractFramesForScene: async (sceneIndex: number) => {
    const state = useProjectStore.getState();
    if (!state.project) throw new Error('No project found');
    
    const { extractFrames } = await import('@/lib/api-client');
    const sceneState = state.scenes[sceneIndex];
    if (!sceneState?.videoLocalPath) throw new Error('No video available');
    
    const response = await extractFrames(sceneState.videoLocalPath, state.project.id, sceneIndex);
    if (response.frames && response.frames.length > 0) {
      const seedFrames = response.frames.map(frame => ({
        id: frame.id,
        url: frame.url,
        timestamp: frame.timestamp,
      }));
      useProjectStore.getState().setSeedFrames(sceneIndex, seedFrames);
    } else {
      throw new Error('No frames extracted');
    }
  },
  
  stitchAllVideos: async () => {
    const state = useProjectStore.getState();
    if (!state.project) throw new Error('No project found');
    
    const { stitchVideos } = await import('@/lib/api-client');
    const videoPaths = state.scenes
      .map(s => {
        // Use selected video if available, otherwise fallback to videoLocalPath for backward compatibility
        if (s.selectedVideoId && s.generatedVideos) {
          const selectedVideo = s.generatedVideos.find(v => v.id === s.selectedVideoId);
          return selectedVideo?.localPath;
        }
        return s.videoLocalPath;
      })
      .filter((path): path is string => !!path);
    
    if (videoPaths.length === 0) throw new Error('No videos available');
    
    const response = await stitchVideos(videoPaths, state.project.id);
    if (response.finalVideoPath) {
      const finalVideoUrl = response.finalVideoPath.startsWith('http')
        ? response.finalVideoPath
        : `/api/serve-video?path=${encodeURIComponent(response.finalVideoPath)}`;
      useProjectStore.getState().setFinalVideo(finalVideoUrl, response.s3Url);
    } else {
      throw new Error('Failed to stitch videos');
    }
  },
  
  // Workflow state management (Phase 5.1.2)
  setWorkflowStep: (step: WorkflowStep) => {
    set({ currentWorkflowStep: step });
  },
  
  setProcessingSceneIndex: (sceneIndex: number | null) => {
    set({ processingSceneIndex: sceneIndex });
  },
  
  pauseWorkflow: () => {
    set({ isWorkflowPaused: true });
  },
  
  resumeWorkflow: () => {
    set({ isWorkflowPaused: false });
  },
  
  // Error state management (Phase 5.1.3)
  setSceneError: (sceneIndex: number, error: { message: string; retryable: boolean }) => {
    set((state) => ({
      sceneErrors: {
        ...state.sceneErrors,
        [sceneIndex]: {
          ...error,
          timestamp: new Date().toISOString(),
        },
      },
    }));
  },
  
  clearSceneError: (sceneIndex: number) => {
    set((state) => {
      const newErrors = { ...state.sceneErrors };
      delete newErrors[sceneIndex];
      return { sceneErrors: newErrors };
    });
  },
  
  retrySceneGeneration: async (sceneIndex: number) => {
    const state = useProjectStore.getState();
    state.clearSceneError(sceneIndex);
    
    try {
      // Retry based on current scene state
      const sceneState = state.scenes[sceneIndex];
      if (!sceneState?.generatedImages.length) {
        await state.generateImageForScene(sceneIndex);
      } else if (!sceneState.videoLocalPath) {
        await state.generateVideoForScene(sceneIndex);
      } else if (sceneIndex < 4 && !sceneState.seedFrames?.length) {
        await state.extractFramesForScene(sceneIndex);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Retry failed';
      state.setSceneError(sceneIndex, { message: errorMessage, retryable: true });
      throw error;
    }
  },
  
  // Character reference management
  setCharacterReferences: (imageUrls: string[]) => {
    set((state) => {
      if (!state.project) return state;
      return {
        project: {
          ...state.project,
          characterReferences: imageUrls,
          referenceImageUrls: imageUrls, // Also set as reference images for scene generation
        },
      };
    });
  },
  
  addCharacterReference: (imageUrl: string) => {
    set((state) => {
      if (!state.project) return state;
      const characterReferences = state.project.characterReferences || [];
      const referenceImageUrls = state.project.referenceImageUrls || [];
      return {
        project: {
          ...state.project,
          characterReferences: [...characterReferences, imageUrl],
          referenceImageUrls: [...referenceImageUrls, imageUrl],
        },
      };
    });
  },
  
  setCharacterDescription: (description: string) => {
    set((state) => {
      if (!state.project) return state;
      return {
        project: {
          ...state.project,
          characterDescription: description,
        },
      };
    });
  },
  
  setNeedsCharacterValidation: (needs: boolean) => {
    set({ needsCharacterValidation: needs });
  },
  
  setHasUploadedImages: (has: boolean) => {
    set({ hasUploadedImages: has });
  },
  
  setUploadedImageUrls: (urls: string[]) => {
    set((state) => {
      if (!state.project) return state;
      return {
        project: {
          ...state.project,
          uploadedImageUrls: urls,
        },
      };
    });
  },
  
  // Brand identity asset management
  setSelectedColor: (color: string) => {
    set((state) => {
      if (!state.project) return state;
      return {
        project: {
          ...state.project,
          selectedColor: color,
        },
      };
    });
  },
  
  setCurrentReferenceImageUrl: (url: string) => {
    set((state) => {
      if (!state.project) return state;
      return {
        project: {
          ...state.project,
          currentReferenceImageUrl: url,
        },
      };
    });
  },
  
  setAssetDescription: (description: string) => {
    set((state) => {
      if (!state.project) return state;
      return {
        project: {
          ...state.project,
          assetDescription: description,
        },
      };
    });
  },
  
  // Style selection management
  setSelectedStyle: (style: 'whimsical' | 'luxury' | 'offroad', prompt: string) => {
    set({
      selectedStyle: style,
      selectedStylePrompt: prompt,
    });
  },
  
  // Timeline management
  setSelectedClipId: (clipId: string | null) => {
    set({ selectedClipId: clipId });
  },
  
  initializeTimelineClips: () => {
    set((state) => {
      if (!state.project) return state;

      const clips: TimelineClip[] = [];
      let currentTime = 0;

      state.scenes.forEach((scene, sceneIndex) => {
        let video: GeneratedVideo | undefined;
        if (scene.selectedVideoId && scene.generatedVideos) {
          video = scene.generatedVideos.find(v => v.id === scene.selectedVideoId);
        }

        if (!video && scene.videoLocalPath) {
          video = {
            id: uuidv4(),
            url: scene.videoLocalPath.startsWith('http')
              ? scene.videoLocalPath
              : `/api/serve-video?path=${encodeURIComponent(scene.videoLocalPath)}`,
            localPath: scene.videoLocalPath,
            actualDuration: scene.actualDuration,
            timestamp: new Date().toISOString(),
          };
        }

        if (video && video.localPath) {
          const duration = video.actualDuration || scene.suggestedDuration || 3;

          clips.push({
            id: uuidv4(),
            sceneIndex,
            sceneId: scene.id,
            title: scene.description,
            videoId: video.id,
            videoLocalPath: video.localPath,
            startTime: currentTime,
            duration,
            trimStart: 0,
            trimEnd: duration,
            sourceDuration: duration,
            endTime: currentTime + duration,
          });
          currentTime += duration;
        }
      });

      return {
        timelineClips: clips,
        timelineHistory: [clips],
        timelineFuture: [],
      };
    });
  },
  
  splitClip: (clipId: string, splitTime: number) => {
    set((state) => {
      const clip = state.timelineClips.find(c => c.id === clipId);
      if (!clip) return state;
      
      // Calculate split point relative to clip start
      const relativeSplitTime = splitTime - clip.startTime;
      if (relativeSplitTime <= 0 || relativeSplitTime >= clip.duration) return state;
      
      // Save current state to history
      const newHistory = [...state.timelineHistory, state.timelineClips];
      
      // Create two clips
      const firstClip: TimelineClip = {
        ...clip,
        duration: relativeSplitTime,
        trimEnd: (clip.trimStart || 0) + relativeSplitTime,
        endTime: clip.startTime + relativeSplitTime,
      };
      
      const secondClip: TimelineClip = {
        ...clip,
        id: uuidv4(),
        startTime: clip.startTime + relativeSplitTime,
        duration: clip.duration - relativeSplitTime,
        trimStart: (clip.trimStart || 0) + relativeSplitTime,
        isSplit: true,
        originalClipId: clipId,
        endTime: clip.endTime,
      };
      
      const newClips = state.timelineClips
        .filter(c => c.id !== clipId)
        .map(c => {
          // Adjust start times for clips after the split
          if (c.startTime > clip.startTime) {
            return { ...c, startTime: c.startTime, endTime: c.startTime + c.duration };
          }
          return c;
        });
      
      // Insert the two new clips in the correct position
      const insertIndex = newClips.findIndex(c => c.startTime > clip.startTime);
      if (insertIndex === -1) {
        newClips.push(firstClip, secondClip);
      } else {
        newClips.splice(insertIndex, 0, firstClip, secondClip);
      }
      
      return {
        timelineClips: newClips,
        timelineHistory: newHistory,
        timelineFuture: [],
      };
    });
  },
  
  splitAtPlayhead: (time: number) => {
    const state = useProjectStore.getState();
    const clip = state.timelineClips.find(
      c => time >= c.startTime && time < c.endTime
    );
    if (clip) {
      useProjectStore.getState().splitClip(clip.id, time);
    }
  },
  
  deleteClip: (clipId: string) => {
    set((state) => {
      const clip = state.timelineClips.find(c => c.id === clipId);
      if (!clip) return state;
      
      // Save current state to history
      const newHistory = [...state.timelineHistory, state.timelineClips];
      
      // Remove the clip and adjust start times
      const newClips = state.timelineClips
        .filter(c => c.id !== clipId)
        .map((c, index, arr) => {
          // Recalculate start times sequentially
          const prevClip = index > 0 ? arr[index - 1] : null;
          const newStartTime = prevClip ? prevClip.endTime : 0;
          return {
            ...c,
            startTime: newStartTime,
            endTime: newStartTime + c.duration,
          };
        });
      
      return {
        timelineClips: newClips,
        timelineHistory: newHistory,
        timelineFuture: [],
        selectedClipId: state.selectedClipId === clipId ? null : state.selectedClipId,
      };
    });
  },
  
  cropClip: (clipId: string, trimStart: number, trimEnd: number) => {
    set((state) => {
      const clip = state.timelineClips.find(c => c.id === clipId);
      if (!clip) return state;
      
      // Save current state to history
      const newHistory = [...state.timelineHistory, state.timelineClips];
      
      // Validate trim values
      const sourceDuration = clip.sourceDuration;
      const validTrimStart = Math.max(0, Math.min(trimStart, sourceDuration));
      const validTrimEnd = Math.max(validTrimStart, Math.min(trimEnd, sourceDuration));
      const newDuration = validTrimEnd - validTrimStart;
      
      const newClips = state.timelineClips.map(c => {
        if (c.id === clipId) {
          return {
            ...c,
            trimStart: validTrimStart,
            trimEnd: validTrimEnd,
            duration: newDuration,
            endTime: c.startTime + newDuration,
          };
        }
        // Adjust subsequent clips
        if (c.startTime > clip.startTime) {
          const offset = clip.duration - newDuration;
          return {
            ...c,
            startTime: c.startTime - offset,
            endTime: c.endTime - offset,
          };
        }
        return c;
      });
      
      return {
        timelineClips: newClips,
        timelineHistory: newHistory,
        timelineFuture: [],
      };
    });
  },
  
  undo: () => {
    set((state) => {
      if (state.timelineHistory.length <= 1) return state;
      
      const previousState = state.timelineHistory[state.timelineHistory.length - 1];
      const newHistory = state.timelineHistory.slice(0, -1);
      const newFuture = [state.timelineClips, ...state.timelineFuture];
      
      return {
        timelineClips: previousState,
        timelineHistory: newHistory,
        timelineFuture: newFuture,
      };
    });
  },
  
  redo: () => {
    set((state) => {
      if (state.timelineFuture.length === 0) return state;
      
      const nextState = state.timelineFuture[0];
      const newFuture = state.timelineFuture.slice(1);
      const newHistory = [...state.timelineHistory, state.timelineClips];
      
      return {
        timelineClips: nextState,
        timelineHistory: newHistory,
        timelineFuture: newFuture,
      };
    });
  },
  
  canUndo: () => {
    const state = useProjectStore.getState();
    return state.timelineHistory.length > 1;
  },
  
  canRedo: () => {
    const state = useProjectStore.getState();
    return state.timelineFuture.length > 0;
  },
  
  reset: () => {
    set(initialState);
  },
}));

