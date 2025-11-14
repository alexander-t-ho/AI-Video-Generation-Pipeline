/**
 * Zustand store for project state management
 */

import { create } from 'zustand';
import { ProjectState, Scene, SceneWithState, GeneratedImage, SeedFrame } from '@/lib/types';
import { ViewMode, MediaDrawerState, DragDropState, ChatMessage } from '@/lib/types/components';
import { v4 as uuidv4 } from 'uuid';

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
  
  // Actions
  createProject: (prompt: string, targetDuration?: number) => void;
  setStoryboard: (scenes: Scene[]) => void;
  setViewMode: (mode: ViewMode) => void;
  setCurrentSceneIndex: (index: number) => void;
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  updateMediaDrawer: (updates: Partial<MediaDrawerState>) => void;
  updateDragDrop: (updates: Partial<DragDropState>) => void;
  
  // Scene generation actions
  setSceneStatus: (sceneIndex: number, status: SceneWithState['status']) => void;
  addGeneratedImage: (sceneIndex: number, image: GeneratedImage) => void;
  selectImage: (sceneIndex: number, imageId: string) => void;
  setVideoPath: (sceneIndex: number, videoPath: string, actualDuration?: number) => void;
  setSeedFrames: (sceneIndex: number, frames: SeedFrame[]) => void;
  selectSeedFrame: (sceneIndex: number, frameIndex: number) => void;
  setFinalVideo: (url: string, s3Key?: string) => void;
  
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
    // TODO: Implement project loading from API/storage
    // For now, this is a placeholder
    console.log('Loading project:', projectId);
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
  
  reset: () => {
    set(initialState);
  },
}));

