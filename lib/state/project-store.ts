/**
 * Zustand store for project state management
 */

import { create } from 'zustand';
import { ProjectState, Scene, SceneWithState } from '@/lib/types';
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
  
  // Actions
  createProject: (prompt: string, targetDuration?: number) => void;
  setStoryboard: (scenes: Scene[]) => void;
  setViewMode: (mode: ViewMode) => void;
  setCurrentSceneIndex: (index: number) => void;
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  updateMediaDrawer: (updates: Partial<MediaDrawerState>) => void;
  updateDragDrop: (updates: Partial<DragDropState>) => void;
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
      
      return {
        project: {
          ...state.project,
          storyboard: scenes,
          status: 'scene_generation',
        },
      };
    });
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

