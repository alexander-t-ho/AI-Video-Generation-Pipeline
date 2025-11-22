import { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { ProjectStore, ProjectCoreSlice } from '../types';
import { ProjectState, SceneWithState } from '@/lib/types';

const initialCoreState = {
  project: null,
  selectedStyle: null,
  selectedStylePrompt: null,
  needsCharacterValidation: false,
  hasUploadedImages: false,
};

export const createProjectCoreSlice: StateCreator<ProjectStore, [], [], ProjectCoreSlice> = (set, get) => ({
  ...initialCoreState,

  createProject: async (name, prompt, targetDuration = 15, characterDescription) => {
    const project: ProjectState = {
      id: uuidv4(),
      name,
      prompt,
      targetDuration,
      characterDescription,
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

  saveProjectToBackend: async (name, prompt, targetDuration = 15, characterDescription) => {
    try {
      const { saveProject } = await import('@/lib/api-client');
      const backendProject = await saveProject(name, prompt, targetDuration, characterDescription);

      set((state) => ({
        project: state.project ? { ...state.project, id: backendProject.id } : null,
      }));

      return backendProject.id;
    } catch (error) {
      console.error('Failed to save project to backend:', error);
      throw error;
    }
  },

  updateProjectMetadata: async (updates) => {
    const state = get();
    if (!state.project) return;

    try {
      const { updateProject } = await import('@/lib/api-client');
      await updateProject(state.project.id, updates);

      set((state) => {
        if (!state.project) return state;
        const updatedProject = { ...state.project };
        if (updates.name !== undefined) updatedProject.name = updates.name;
        if (updates.characterDescription !== undefined) updatedProject.characterDescription = updates.characterDescription;
        if (updates.status !== undefined) updatedProject.status = updates.status;
        if (updates.finalVideoUrl !== undefined) updatedProject.finalVideoUrl = updates.finalVideoUrl;
        if (updates.finalVideoS3Key !== undefined) updatedProject.finalVideoS3Key = updates.finalVideoS3Key;
        return { project: updatedProject };
      });

      console.log('[Store] Project metadata saved to backend');
    } catch (error) {
      console.error('[Store] Failed to update project metadata:', error);
      throw error;
    }
  },

  setStoryboard: (scenes) => {
    set((state) => {
      if (!state.project) return state;

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

  updateScene: (sceneId, updates) => {
    set((state) => {
      if (!state.project || !state.project.storyboard) return state;

      const updatedStoryboard = state.project.storyboard.map((scene) =>
        scene.id === sceneId ? { ...scene, ...updates } : scene
      );

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

  reorderScenes: (reorderedScenes) => {
    set((state) => {
      if (!state.project) return state;

      const scenesWithOrder = reorderedScenes.map((scene, index) => ({
        ...scene,
        order: index,
      }));

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

  loadProject: async (projectId) => {
    try {
      const { loadProject: loadProjectAPI } = await import('@/lib/api-client');
      const backendProject = await loadProjectAPI(projectId);

      const scenesWithState: SceneWithState[] = (backendProject.scenes || []).map((scene: any) => ({
        ...scene,
        generatedImages: scene.generatedImages || [],
        generatedVideos: scene.generatedVideos || [],
        seedFrames: scene.seedFrames || [],
        status: 'image_ready' as const,
      }));

      set({
        project: {
          id: backendProject.id,
          name: backendProject.name,
          prompt: backendProject.prompt,
          targetDuration: backendProject.targetDuration,
          characterDescription: backendProject.characterDescription,
          status: backendProject.status || 'storyboard',
          createdAt: backendProject.createdAt,
          storyboard: backendProject.scenes || [],
          currentSceneIndex: 0,
          finalVideoUrl: backendProject.finalVideoUrl,
          finalVideoS3Key: backendProject.finalVideoS3Key,
        },
        scenes: scenesWithState,
      });
    } catch (error) {
      console.error('Failed to load project:', error);
      throw error;
    }
  },

  setCharacterReferences: (imageUrls) => {
    set((state) => {
      if (!state.project) return state;
      return {
        project: {
          ...state.project,
          characterReferences: imageUrls,
          referenceImageUrls: imageUrls,
        },
      };
    });
  },

  addCharacterReference: (imageUrl) => {
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

  setCharacterDescription: (description) => {
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

  setNeedsCharacterValidation: (needs) => {
    set({ needsCharacterValidation: needs });
  },

  setHasUploadedImages: (has) => {
    set({ hasUploadedImages: has });
  },

  setUploadedImageUrls: (urls) => {
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

  setUploadedImages: (images) => {
    set((state) => {
      console.log('[ProjectStore] setUploadedImages called', { imageCount: images.length, hasProject: !!state.project });
      if (!state.project) {
        console.warn('[ProjectStore] Cannot set uploaded images - no project exists');
        return state;
      }

      const referenceImageUrls = images.map(img => img.url);
      console.log('[ProjectStore] Setting referenceImageUrls:', referenceImageUrls);

      return {
        project: {
          ...state.project,
          uploadedImages: images,
          referenceImageUrls,
        },
      };
    });
  },

  setSelectedColor: (color) => {
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

  setCurrentReferenceImageUrl: (url) => {
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

  setAssetDescription: (description) => {
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

  setSelectedStyle: (style, prompt) => {
    set({
      selectedStyle: style,
      selectedStylePrompt: prompt,
    });
  },

  addAdditionalMedia: (mediaItem) => {
    set((state) => {
      if (!state.project) return {};

      return {
        project: {
          ...state.project,
          additionalMedia: [...(state.project.additionalMedia || []), mediaItem],
        },
      };
    });
  },

  removeAdditionalMedia: (mediaId) => {
    set((state) => {
      if (!state.project) return {};

      return {
        project: {
          ...state.project,
          additionalMedia: (state.project.additionalMedia || []).filter(m => m.id !== mediaId),
        },
      };
    });
  },

  reset: () => {
    // This should ideally reset other slices too. 
    // Since all slices share `set`, we can pass the global initial state here if we had it,
    // OR rely on each slice's reset method if we added one, OR just reset everything we know about.
    // For now, let's clear the project core state, and ideally the others.
    // But wait, `set(initialState)` in the original file reset everything.
    // Here, `set` is typed to `ProjectStore`, so passing a partial object updates it.
    // I need to manually reset fields from other slices or export an initial state object that combines all.
    // I will address this in the main store file where I combine them.
    
    // For now, empty impl or just reset core fields?
    // The original `reset` action reset EVERYTHING.
    // I will leave it here but actually implement the global reset in the main store assembly or allow this to do it if I import initial states.
    // I'll leave it empty here and override/compose it in the main store.
  },
});



