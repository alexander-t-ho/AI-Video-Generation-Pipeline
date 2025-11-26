/**
 * Zustand store for project state management
 * Refactored into slices for better maintainability
 */

import { create } from 'zustand';
import { ProjectStore } from './types';
import { createProjectCoreSlice } from './slices/project-core-slice';
import { createSceneSlice } from './slices/scene-slice';
import { createTimelineSlice } from './slices/timeline-slice';
import { createUISlice } from './slices/ui-slice';
import { ViewMode, MediaDrawerState, DragDropState, ChatMessage } from '@/lib/types/components';
import { SceneWithState, TimelineClip } from '@/lib/types';
import { WorkflowStep } from './types';

// Re-export types for backward compatibility
export type { ProjectStore, WorkflowStep, CharacterReferenceImage } from './types';

// Initial state for reset
const initialState = {
  // Core
  project: null,
  selectedStyle: null as 'whimsical' | 'luxury' | 'offroad' | null,
  selectedStylePrompt: null as string | null,
  needsCharacterValidation: false,
  hasUploadedImages: false,

  // UI
  viewMode: 'storyboard' as ViewMode,
  currentSceneIndex: 0,
  mediaDrawer: {
    selectedItems: [],
    seedImageId: null,
    filters: {},
    searchQuery: '',
  } as MediaDrawerState,
  dragDrop: {
    isDragging: false,
  } as DragDropState,
  chatMessages: [] as ChatMessage[],
  liveEditingPrompts: {} as Record<number, import('./types').LiveEditingPrompts>,
  
  // Scene
  scenes: [] as SceneWithState[],
  currentWorkflowStep: 'idle' as WorkflowStep,
  isWorkflowPaused: false,
  processingSceneIndex: null as number | null,
  sceneErrors: {} as Record<number, { message: string; timestamp: string; retryable: boolean }>,
  generationStates: {} as Record<number, import('./types').GenerationState>,
  
  // Timeline
  timelineClips: [] as TimelineClip[],
  timelineHistory: [] as TimelineClip[][],
  timelineFuture: [] as TimelineClip[][],
  selectedClipId: null as string | null,
};

export const useProjectStore = create<ProjectStore>((set, get, store) => ({
  ...createProjectCoreSlice(set, get, store),
  ...createSceneSlice(set, get, store),
  ...createTimelineSlice(set, get, store),
  ...createUISlice(set, get, store),

  // Override reset to handle global reset
  reset: () => {
    set(initialState);
  },
}));

// Helper hooks for gradual migration (Facade Pattern)
// These allow components to import "specific" stores, while actually using the main store
// This prepares the codebase for potential physical separation in the future if needed

export const useSceneStore = useProjectStore;
export const useTimelineStore = useProjectStore;
export const useUIStore = useProjectStore;
export const useProjectCoreStore = useProjectStore;
