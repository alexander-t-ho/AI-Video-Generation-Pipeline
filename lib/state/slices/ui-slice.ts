import { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { ProjectStore, UISlice } from '../types';
import { ViewMode } from '@/lib/types/components';

export const createUISlice: StateCreator<ProjectStore, [], [], UISlice> = (set) => ({
  viewMode: 'storyboard' as ViewMode,
  currentSceneIndex: 0,
  mediaDrawer: {
    selectedItems: [],
    seedImageId: null,
    filters: {},
    searchQuery: '',
  },
  dragDrop: {
    isDragging: false,
  },
  chatMessages: [],

  setViewMode: (mode) => {
    set({ viewMode: mode });
  },
  
  setCurrentSceneIndex: (index) => {
    set({ currentSceneIndex: index });
  },
  
  addChatMessage: (message) => {
    const chatMessage = {
      ...message,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
    };
    
    set((state) => ({
      chatMessages: [...state.chatMessages, chatMessage],
    }));
  },
  
  updateMediaDrawer: (updates) => {
    set((state) => ({
      mediaDrawer: { ...state.mediaDrawer, ...updates },
    }));
  },
  
  updateDragDrop: (updates) => {
    set((state) => ({
      dragDrop: { ...state.dragDrop, ...updates },
    }));
  },
  
  toggleMediaItem: (itemId) => {
    set((state) => {
      const { selectedItems, seedImageId } = state.mediaDrawer;
      const isReference = selectedItems.includes(itemId);
      const isSeed = seedImageId === itemId;

      let newSelectedItems = [...selectedItems];
      let newSeedImageId = seedImageId;

      if (isSeed) {
        // Cycle: Seed -> Unselected
        newSeedImageId = null;
        // Item is already NOT in selectedItems if it was seed
      } else if (isReference) {
        // Cycle: Reference -> Seed
        newSelectedItems = selectedItems.filter(id => id !== itemId);
        newSeedImageId = itemId;
        
        // If there was another seed, demote it to reference
        if (seedImageId && seedImageId !== itemId) {
           newSelectedItems.push(seedImageId);
        }
      } else {
        // Cycle: Unselected -> Reference
        newSelectedItems.push(itemId);
      }

      return {
        mediaDrawer: {
          ...state.mediaDrawer,
          selectedItems: newSelectedItems,
          seedImageId: newSeedImageId,
        }
      };
    });
  },

  selectMediaItem: (itemId) => {
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
  
  deselectMediaItem: (itemId) => {
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
  
  setMediaFilter: (filter) => {
    set((state) => ({
      mediaDrawer: {
        ...state.mediaDrawer,
        filters: { ...state.mediaDrawer.filters, ...filter },
      },
    }));
  },
  
  setMediaSearchQuery: (query) => {
    set((state) => ({
      mediaDrawer: {
        ...state.mediaDrawer,
        searchQuery: query,
      },
    }));
  },
  
  navigateToWorkspace: (projectId) => {
    if (typeof window !== 'undefined') {
      window.location.href = `/workspace?projectId=${projectId}`;
    }
  },
});


