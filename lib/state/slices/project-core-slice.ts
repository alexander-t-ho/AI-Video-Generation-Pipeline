import { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { ProjectStore, ProjectCoreSlice } from '../types';
import { ProjectState, SceneWithState } from '@/lib/types';
import { UploadedImage } from '@/lib/storage/image-storage';

const initialCoreState = {
  project: null,
  selectedStyle: null,
  selectedStylePrompt: null,
  needsCharacterValidation: false,
  hasUploadedImages: false,
};

/**
 * Smart reference image selection based on AI-powered prompt analysis
 * Uses Claude API to analyze scene prompts and determine interior vs exterior
 */
async function selectSceneReferenceImages(
  images: UploadedImage[],
  scenePrompt: string
): Promise<string[]> {
  if (images.length === 0) return [];
  if (images.length <= 3) return images.map(img => img.url);

  let shouldIncludeInterior = false;

  try {
    // Call AI analysis API
    const response = await fetch('/api/analyze-scene', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenePrompt })
    });

    const data = await response.json();
    shouldIncludeInterior = data.sceneType === 'interior';

    console.log('[AI SceneSmartSelection] AI analysis:', {
      prompt: scenePrompt.substring(0, 100),
      sceneType: data.sceneType,
      confidence: data.confidence,
      shouldIncludeInterior
    });
  } catch (error) {
    console.error('[AI SceneSmartSelection] AI analysis failed, using keyword fallback:', error);

    // Fallback to keyword-based detection
    const promptText = scenePrompt.toLowerCase();
    const strongInteriorKeywords = [
      'interior', 'inside cabin', 'dashboard', 'cockpit',
      'steering wheel', 'driver seat', 'passenger seat',
      'center console', 'infotainment', 'instrument cluster',
      'seats', 'inside the car'
    ];
    const exteriorIndicators = [
      'front', 'back', 'rear', 'side', 'exterior',
      'outside', 'aerial', 'overhead', 'approach',
      'silhouette', 'profile', 'angle',
      'headlight', 'taillight', 'grille', 'hood', 'body'
    ];

    const hasStrongInterior = strongInteriorKeywords.some(keyword => promptText.includes(keyword));
    const hasExteriorIndicator = exteriorIndicators.some(keyword => promptText.includes(keyword));
    shouldIncludeInterior = hasStrongInterior && !hasExteriorIndicator;

    console.log('[AI SceneSmartSelection] Keyword fallback:', {
      hasStrongInterior,
      hasExteriorIndicator,
      shouldIncludeInterior
    });
  }

  // Categorize images by their originalName or path
  const interiorImages: UploadedImage[] = [];
  const exteriorImages: UploadedImage[] = [];
  const uncategorizedImages: UploadedImage[] = [];

  images.forEach(img => {
    const imgName = (img.originalName || '').toLowerCase();
    if (imgName.includes('interior') || imgName.includes('cabin') || imgName.includes('dashboard')) {
      interiorImages.push(img);
    } else if (imgName.includes('exterior') || imgName.includes('front') || imgName.includes('back') ||
               imgName.includes('side') || imgName.includes('aerial') || imgName.includes('profile')) {
      exteriorImages.push(img);
    } else {
      uncategorizedImages.push(img);
    }
  });

  console.log('[AI SceneSmartSelection] Categorized:', {
    interior: interiorImages.length,
    exterior: exteriorImages.length,
    uncategorized: uncategorizedImages.length
  });

  const selected: string[] = [];

  // Only include interior if AI determined this is an interior scene
  if (shouldIncludeInterior && interiorImages.length > 0) {
    selected.push(interiorImages[0].url);
    const remainingExterior = [...exteriorImages, ...uncategorizedImages].slice(0, 2);
    selected.push(...remainingExterior.map(img => img.url));
  }
  // Default: pick 3 exterior images only (safer default)
  else {
    // Try to get diverse exterior shots (front, side, back, aerial)
    const priorityOrder = ['front', 'side', 'back', 'aerial', 'profile'];
    const selectedExterior: UploadedImage[] = [];

    priorityOrder.forEach(angle => {
      if (selectedExterior.length >= 3) return;
      const match = exteriorImages.find(img =>
        (img.originalName || '').toLowerCase().includes(angle) &&
        !selectedExterior.includes(img)
      );
      if (match) selectedExterior.push(match);
    });

    // Fill remaining slots with any available exterior images
    while (selectedExterior.length < 3 && exteriorImages.length > selectedExterior.length) {
      const next = exteriorImages.find(img => !selectedExterior.includes(img));
      if (next) selectedExterior.push(next);
      else break;
    }

    // If still not enough, add from uncategorized
    while (selectedExterior.length < 3 && uncategorizedImages.length > 0) {
      selectedExterior.push(uncategorizedImages[selectedExterior.length - exteriorImages.length]);
    }

    selected.push(...selectedExterior.map(img => img.url));
  }

  console.log('[AI SceneSmartSelection] Selected:', selected.length, 'images');
  return selected.slice(0, 3);
}

function selectSmartReferenceImages(
  images: UploadedImage[],
  projectPrompt: string,
  storyboard: any[] = []
): string[] {
  if (images.length === 0) return [];
  if (images.length <= 3) return images.map(img => img.url);

  // Combine project prompt and scene prompts for analysis
  const allText = [
    projectPrompt,
    ...storyboard.map(scene => scene.imagePrompt || scene.description || '')
  ].join(' ').toLowerCase();

  // Keywords to detect interior vs exterior scenes
  const interiorKeywords = ['interior', 'inside', 'cabin', 'dashboard', 'cockpit', 'seats', 'steering wheel'];
  const exteriorKeywords = ['exterior', 'outside', 'front', 'back', 'side', 'aerial', 'profile'];

  const hasInterior = interiorKeywords.some(keyword => allText.includes(keyword));
  const hasExterior = exteriorKeywords.some(keyword => allText.includes(keyword));

  console.log('[SmartSelection] Analysis:', { hasInterior, hasExterior, totalImages: images.length });

  // Categorize images by their originalName or path
  const interiorImages: UploadedImage[] = [];
  const exteriorImages: UploadedImage[] = [];
  const uncategorizedImages: UploadedImage[] = [];

  images.forEach(img => {
    const imgName = (img.originalName || '').toLowerCase();
    if (imgName.includes('interior') || imgName.includes('cabin') || imgName.includes('dashboard')) {
      interiorImages.push(img);
    } else if (imgName.includes('exterior') || imgName.includes('front') || imgName.includes('back') ||
               imgName.includes('side') || imgName.includes('aerial') || imgName.includes('profile')) {
      exteriorImages.push(img);
    } else {
      uncategorizedImages.push(img);
    }
  });

  console.log('[SmartSelection] Categorized:', {
    interior: interiorImages.length,
    exterior: exteriorImages.length,
    uncategorized: uncategorizedImages.length
  });

  const selected: string[] = [];

  // Strategy 1: If prompt mentions interior, prioritize 1 interior + 2 exterior
  if (hasInterior && interiorImages.length > 0) {
    selected.push(interiorImages[0].url);
    const remainingExterior = [...exteriorImages, ...uncategorizedImages].slice(0, 2);
    selected.push(...remainingExterior.map(img => img.url));
  }
  // Strategy 2: If only exterior mentioned or default case, pick 3 different exterior angles
  else {
    // Try to get diverse exterior shots (front, side, back, aerial)
    const priorityOrder = ['front', 'side', 'back', 'aerial', 'profile'];
    const selectedExterior: UploadedImage[] = [];

    priorityOrder.forEach(angle => {
      if (selectedExterior.length >= 3) return;
      const match = exteriorImages.find(img =>
        (img.originalName || '').toLowerCase().includes(angle) &&
        !selectedExterior.includes(img)
      );
      if (match) selectedExterior.push(match);
    });

    // Fill remaining slots with any available images
    while (selectedExterior.length < 3 && exteriorImages.length > selectedExterior.length) {
      const next = exteriorImages.find(img => !selectedExterior.includes(img));
      if (next) selectedExterior.push(next);
      else break;
    }

    // If still not enough, add from uncategorized
    while (selectedExterior.length < 3 && uncategorizedImages.length > 0) {
      selectedExterior.push(uncategorizedImages[selectedExterior.length - exteriorImages.length]);
    }

    selected.push(...selectedExterior.map(img => img.url));
  }

  // Ensure we always return exactly 3 images (or less if not enough available)
  return selected.slice(0, 3);
}

// Export the per-scene selection function for use in components
export { selectSceneReferenceImages };

export const createProjectCoreSlice: StateCreator<ProjectStore, [], [], ProjectCoreSlice> = (set, get) => ({
  ...initialCoreState,

  createProject: async (name, prompt, targetDuration = 15, characterDescription) => {
    const project: ProjectState = {
      id: uuidv4(),
      name,
      prompt,
      targetDuration,
      characterDescription,
      status: 'STORYBOARD',
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

  updateProject: (updates) => {
    set((state) => {
      if (!state.project) return state;
      return {
        project: {
          ...state.project,
          ...updates,
        },
      };
    });
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
        if (updates.targetDuration !== undefined) updatedProject.targetDuration = updates.targetDuration;
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
          status: 'SCENE_GENERATION',
        },
        scenes: scenesWithState,
      };
    });

    // Automatically analyze and assign reference images to all scenes
    const state = get();
    const uploadedImages = state.project?.uploadedImages;

    if (uploadedImages && uploadedImages.length > 0) {
      console.log('[setStoryboard] Auto-analyzing all scenes for reference images');

      // Analyze each scene asynchronously
      scenes.forEach(async (scene, index) => {
        const scenePrompt = scene.videoPrompt || scene.imagePrompt || scene.description || '';

        try {
          const selectedUrls = await selectSceneReferenceImages(uploadedImages, scenePrompt);

          // Update the scene with selected references
          const currentState = get();
          if (currentState.project && currentState.project.storyboard[index]) {
            set((s) => {
              if (!s.project) return s;

              const updatedStoryboard = [...s.project.storyboard];
              updatedStoryboard[index] = {
                ...updatedStoryboard[index],
                referenceImageUrls: selectedUrls,
              };

              const updatedScenes = [...s.scenes];
              if (updatedScenes[index]) {
                updatedScenes[index] = {
                  ...updatedScenes[index],
                  referenceImageUrls: selectedUrls,
                };
              }

              console.log(`[setStoryboard] ✅ Scene ${index + 1}: Auto-assigned ${selectedUrls.length} reference images`);

              return {
                project: {
                  ...s.project,
                  storyboard: updatedStoryboard,
                },
                scenes: updatedScenes,
              };
            });

            // Persist to database if scene has an ID
            if (scene.id) {
              import('@/lib/api-client').then(({ updateScene }) => {
                updateScene(scene.id, { referenceImageUrls: selectedUrls })
                  .catch((error) => {
                    console.error(`[setStoryboard] ❌ Failed to persist references for scene ${index + 1}:`, error);
                  });
              });
            }
          }
        } catch (error) {
          console.error(`[setStoryboard] ❌ Failed to analyze scene ${index + 1}:`, error);
        }
      });
    }
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
          status: backendProject.status || 'STORYBOARD',
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

  clearReferenceImages: () => {
    set((state) => {
      if (!state.project) return state;
      return {
        project: {
          ...state.project,
          characterReferences: [],
          referenceImageUrls: [],
        },
      };
    });
  },

  toggleReferenceImage: (imageUrl) => {
    set((state) => {
      if (!state.project) return state;
      const currentReferences = state.project.referenceImageUrls || [];
      const isCurrentlySelected = currentReferences.includes(imageUrl);

      let newReferences: string[];
      if (isCurrentlySelected) {
        // Remove if already selected (deselect)
        newReferences = currentReferences.filter(url => url !== imageUrl);
      } else {
        // Add if not selected (limit to 3)
        newReferences = [...currentReferences, imageUrl].slice(0, 3);
      }

      return {
        project: {
          ...state.project,
          characterReferences: newReferences,
          referenceImageUrls: newReferences,
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
    console.log('[setUploadedImages] Called with', images.length, 'images');

    // First, update the state with uploaded images
    set((state) => {
      console.log('[ProjectStore] setUploadedImages state update', { imageCount: images.length, hasProject: !!state.project });
      if (!state.project) {
        console.warn('[ProjectStore] Cannot set uploaded images - no project exists');
        return state;
      }

      // Smart selection: analyze prompt and pick relevant reference images
      const selectedReferences = selectSmartReferenceImages(images, state.project.prompt, state.project.storyboard);
      console.log('[ProjectStore] Smart reference selection:', {
        totalImages: images.length,
        selectedCount: selectedReferences.length,
        selectedUrls: selectedReferences
      });

      return {
        project: {
          ...state.project,
          uploadedImages: images,
          referenceImageUrls: selectedReferences,
        },
      };
    });

    // IMPORTANT: Get fresh state AFTER the update above
    const state = get();
    const storyboard = state.project?.storyboard;

    console.log('[setUploadedImages] Checking conditions for AI analysis:', {
      hasImages: images.length > 0,
      hasStoryboard: !!storyboard,
      storyboardLength: storyboard?.length || 0
    });

    if (images.length > 0 && storyboard && storyboard.length > 0) {
      console.log('[setUploadedImages] ✅ Starting AI analysis for', storyboard.length, 'scenes');

      // Analyze each scene asynchronously
      storyboard.forEach(async (scene, index) => {
        // Skip if scene already has references
        if (scene.referenceImageUrls && scene.referenceImageUrls.length > 0) {
          console.log(`[setUploadedImages] Scene ${index + 1}: Already has ${scene.referenceImageUrls.length} references, skipping`);
          return;
        }

        const scenePrompt = scene.videoPrompt || scene.imagePrompt || scene.description || '';
        console.log(`[setUploadedImages] Scene ${index + 1}: Analyzing with prompt:`, scenePrompt.substring(0, 100));

        try {
          const selectedUrls = await selectSceneReferenceImages(images, scenePrompt);
          console.log(`[setUploadedImages] Scene ${index + 1}: AI selected ${selectedUrls.length} reference images`);

          // Update the scene with selected references
          const currentState = get();
          if (currentState.project && currentState.project.storyboard[index]) {
            set((s) => {
              if (!s.project) return s;

              const updatedStoryboard = [...s.project.storyboard];
              updatedStoryboard[index] = {
                ...updatedStoryboard[index],
                referenceImageUrls: selectedUrls,
              };

              const updatedScenes = [...s.scenes];
              if (updatedScenes[index]) {
                updatedScenes[index] = {
                  ...updatedScenes[index],
                  referenceImageUrls: selectedUrls,
                };
              }

              console.log(`[setUploadedImages] ✅ Scene ${index + 1}: Auto-assigned ${selectedUrls.length} reference images:`, selectedUrls);

              return {
                project: {
                  ...s.project,
                  storyboard: updatedStoryboard,
                },
                scenes: updatedScenes,
              };
            });

            // Persist to database if scene has an ID
            if (scene.id) {
              import('@/lib/api-client').then(({ updateScene }) => {
                updateScene(scene.id, { referenceImageUrls: selectedUrls })
                  .then(() => {
                    console.log(`[setUploadedImages] ✅ Persisted ${selectedUrls.length} references for scene ${index + 1} to database`);
                  })
                  .catch((error) => {
                    console.error(`[setUploadedImages] ❌ Failed to persist references for scene ${index + 1}:`, error);
                  });
              });
            }
          }
        } catch (error) {
          console.error(`[setUploadedImages] ❌ Failed to analyze scene ${index + 1}:`, error);
        }
      });
    } else {
      console.warn('[setUploadedImages] ❌ Conditions not met for AI analysis:', {
        hasImages: images.length > 0,
        hasStoryboard: !!storyboard,
        storyboardLength: storyboard?.length || 0
      });
    }
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

  addSavedImage: (savedImage) => {
    set((state) => {
      if (!state.project) return {};

      return {
        project: {
          ...state.project,
          savedImages: [...(state.project.savedImages || []), savedImage],
        },
      };
    });
  },

  removeSavedImage: (imageId) => {
    set((state) => {
      if (!state.project) return {};

      return {
        project: {
          ...state.project,
          savedImages: (state.project.savedImages || []).filter(img => img.id !== imageId),
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



