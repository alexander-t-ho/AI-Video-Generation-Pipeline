/**
 * Zustand store for project state management
 */

import { create } from 'zustand';
import { ProjectState, Scene, SceneWithState, GeneratedImage, SeedFrame } from '@/lib/types';
import { ViewMode, MediaDrawerState, DragDropState, ChatMessage } from '@/lib/types/components';
import { v4 as uuidv4 } from 'uuid';

type WorkflowStep = 'idle' | 'generating_image' | 'image_ready' | 'generating_video' | 'video_ready' | 'extracting_frames' | 'frames_ready' | 'completed';

interface ProjectStore {
  // Project state
  project: ProjectState | null;
  
  // UI state
  viewMode: ViewMode;
  currentSceneIndex: number;
  mediaDrawer: MediaDrawerState;
  dragDrop: DragDropState;
  chatMessages: ChatMessage[];
  
  // Scene state (extended scenes with generation state)
  scenes: SceneWithState[];
  
  // Workflow state (Phase 5.1.2)
  currentWorkflowStep: WorkflowStep;
  isWorkflowPaused: boolean;
  processingSceneIndex: number | null;
  
  // Error state (Phase 5.1.3)
  sceneErrors: Record<number, { message: string; timestamp: string; retryable: boolean }>;
  
  // Actions
  createProject: (prompt: string, targetDuration?: number) => void;
  setStoryboard: (scenes: Scene[]) => void;
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
  
  // Navigation
  navigateToWorkspace: (projectId: string) => void;
  loadProject: (projectId: string) => Promise<void>;
  
  reset: () => void;
}

const initialState = {
  project: null,
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
  currentWorkflowStep: 'idle' as WorkflowStep,
  isWorkflowPaused: false,
  processingSceneIndex: null as number | null,
  sceneErrors: {} as Record<number, { message: string; timestamp: string; retryable: boolean }>,
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
        updatedScenes[sceneIndex] = {
          ...updatedScenes[sceneIndex],
          videoLocalPath: videoPath,
          actualDuration,
          status: 'video_ready',
        };
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
      if (!state.project) return state;
      
      // Extract URLs for backward compatibility
      const referenceImageUrls = images.map(img => img.url);
      
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
    
    // Reference images would come from uploaded images for object consistency
    // For now, using empty array as placeholder
    const referenceImageUrls: string[] = [];
    
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
      .map(s => s.videoLocalPath)
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
  
  reset: () => {
    set(initialState);
  },
}));

