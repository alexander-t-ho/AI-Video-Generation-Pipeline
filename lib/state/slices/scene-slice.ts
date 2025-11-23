import { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { ProjectStore, SceneSlice, WorkflowStep } from '../types';
import { GeneratedVideo, SeedFrame, SceneWithState } from '@/lib/types';

export const createSceneSlice: StateCreator<ProjectStore, [], [], SceneSlice> = (set, get) => ({
  scenes: [],
  currentWorkflowStep: 'idle' as WorkflowStep,
  isWorkflowPaused: false,
  processingSceneIndex: null,
  sceneErrors: {},

  updateScenePrompt: (sceneIndex, imagePrompt) => {
    set((state) => {
      if (!state.project || !state.project.storyboard[sceneIndex]) return state;
      
      const updatedStoryboard = [...state.project.storyboard];
      updatedStoryboard[sceneIndex] = {
        ...updatedStoryboard[sceneIndex],
        imagePrompt,
      };
      
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
  
  updateSceneVideoPrompt: (sceneIndex, videoPrompt) => {
    set((state) => {
      if (!state.project || !state.project.storyboard[sceneIndex]) return state;
      
      const updatedStoryboard = [...state.project.storyboard];
      updatedStoryboard[sceneIndex] = {
        ...updatedStoryboard[sceneIndex],
        videoPrompt,
      };
      
      const updatedScenes = [...state.scenes];
      if (updatedScenes[sceneIndex]) {
        updatedScenes[sceneIndex] = {
          ...updatedScenes[sceneIndex],
          videoPrompt,
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
  
  updateSceneSettings: (sceneIndex, settings) => {
    set((state) => {
      if (!state.project || !state.project.storyboard[sceneIndex]) return state;

      const updatedStoryboard = [...state.project.storyboard];
      updatedStoryboard[sceneIndex] = {
        ...updatedStoryboard[sceneIndex],
        ...settings,
      };

      const updatedScenes = [...state.scenes];
      if (updatedScenes[sceneIndex]) {
        updatedScenes[sceneIndex] = {
          ...updatedScenes[sceneIndex],
          ...settings,
        };
      }

      // Persist referenceImageUrls to database if updated
      const scene = updatedStoryboard[sceneIndex];
      if (scene.id && settings.referenceImageUrls !== undefined) {
        import('@/lib/api-client').then(({ updateScene }) => {
          updateScene(scene.id, { referenceImageUrls: settings.referenceImageUrls })
            .then(() => {
              console.log('[SceneSlice] ✅ Persisted referenceImageUrls to database for scene', scene.id);
            })
            .catch((error) => {
              console.error('[SceneSlice] ❌ Failed to persist referenceImageUrls:', error);
            });
        });
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

  updateSceneModelParameters: (sceneIndex, modelParameters) => {
    set((state) => {
      if (!state.project || !state.project.storyboard[sceneIndex]) return state;
      
      const updatedStoryboard = [...state.project.storyboard];
      updatedStoryboard[sceneIndex] = {
        ...updatedStoryboard[sceneIndex],
        modelParameters,
      };
      
      const updatedScenes = [...state.scenes];
      if (updatedScenes[sceneIndex]) {
        updatedScenes[sceneIndex] = {
          ...updatedScenes[sceneIndex],
          modelParameters,
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
  
  setSceneStatus: (sceneIndex, status) => {
    set((state) => {
      const updatedScenes = [...state.scenes];

      // Ensure the scene exists - if not, initialize it from storyboard
      if (!updatedScenes[sceneIndex] && state.project?.storyboard[sceneIndex]) {
        console.warn(`[SceneSlice] Scene ${sceneIndex} not in scenes array, initializing from storyboard`);
        updatedScenes[sceneIndex] = {
          ...state.project.storyboard[sceneIndex],
          generatedImages: [],
          status: 'pending',
        };
      }

      if (updatedScenes[sceneIndex]) {
        updatedScenes[sceneIndex] = {
          ...updatedScenes[sceneIndex],
          status,
        };
      }
      return { scenes: updatedScenes };
    });
  },
  
  addGeneratedImage: (sceneIndex, image) => {
    set((state) => {
      const updatedScenes = [...state.scenes];

      // Ensure the scene exists - if not, initialize it from storyboard
      if (!updatedScenes[sceneIndex] && state.project?.storyboard[sceneIndex]) {
        console.warn(`[SceneSlice] Scene ${sceneIndex} not in scenes array, initializing from storyboard`);
        updatedScenes[sceneIndex] = {
          ...state.project.storyboard[sceneIndex],
          generatedImages: [],
          status: 'pending',
        };
      }

      if (updatedScenes[sceneIndex]) {
        updatedScenes[sceneIndex] = {
          ...updatedScenes[sceneIndex],
          generatedImages: [...updatedScenes[sceneIndex].generatedImages, image],
          status: 'image_ready',
        };
      } else {
        console.error(`[SceneSlice] Cannot add image to scene ${sceneIndex} - scene not found in storyboard`);
      }
      return { scenes: updatedScenes };
    });
  },
  
  selectImage: (sceneIndex, imageId) => {
    set((state) => {
      const updatedScenes = [...state.scenes];

      // Ensure the scene exists - if not, initialize it from storyboard
      if (!updatedScenes[sceneIndex] && state.project?.storyboard[sceneIndex]) {
        console.warn(`[SceneSlice] Scene ${sceneIndex} not in scenes array, initializing from storyboard`);
        updatedScenes[sceneIndex] = {
          ...state.project.storyboard[sceneIndex],
          generatedImages: [],
          status: 'pending',
        };
      }

      if (updatedScenes[sceneIndex]) {
        updatedScenes[sceneIndex] = {
          ...updatedScenes[sceneIndex],
          selectedImageId: imageId,
        };
      }
      return { scenes: updatedScenes };
    });
  },
  
  deleteGeneratedImage: (sceneIndex, imageId) => {
    set((state) => {
      const updatedScenes = [...state.scenes];
      if (updatedScenes[sceneIndex]) {
        const currentImages = updatedScenes[sceneIndex].generatedImages;
        const filteredImages = currentImages.filter(img => img.id !== imageId);
        
        // If the deleted image was selected, clear selection or select first remaining image
        const wasSelected = updatedScenes[sceneIndex].selectedImageId === imageId;
        const newSelectedId = wasSelected && filteredImages.length > 0 
          ? filteredImages[0].id 
          : wasSelected 
            ? undefined 
            : updatedScenes[sceneIndex].selectedImageId;
        
        updatedScenes[sceneIndex] = {
          ...updatedScenes[sceneIndex],
          generatedImages: filteredImages,
          selectedImageId: newSelectedId,
        };
      }
      return { scenes: updatedScenes };
    });
  },
  
  setVideoPath: (sceneIndex, videoPath, actualDuration) => {
    set((state) => {
      const updatedScenes = [...state.scenes];

      // Ensure the scene exists - if not, initialize it from storyboard
      if (!updatedScenes[sceneIndex] && state.project?.storyboard[sceneIndex]) {
        console.warn(`[SceneSlice] Scene ${sceneIndex} not in scenes array, initializing from storyboard`);
        updatedScenes[sceneIndex] = {
          ...state.project.storyboard[sceneIndex],
          generatedImages: [],
          status: 'pending',
        };
      }

      if (updatedScenes[sceneIndex]) {
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

        const existingVideos = updatedScenes[sceneIndex].generatedVideos || [];

        updatedScenes[sceneIndex] = {
          ...updatedScenes[sceneIndex],
          generatedVideos: [...existingVideos, newVideo],
          selectedVideoId: videoId,
          videoLocalPath: videoPath,
          actualDuration,
          status: 'video_ready',
        };
      }
      return { scenes: updatedScenes };
    });
  },
  
  addGeneratedVideo: (sceneIndex, video) => {
    set((state) => {
      const updatedScenes = [...state.scenes];
      if (updatedScenes[sceneIndex]) {
        const existingVideos = updatedScenes[sceneIndex].generatedVideos || [];
        updatedScenes[sceneIndex] = {
          ...updatedScenes[sceneIndex],
          generatedVideos: [...existingVideos, video],
          selectedVideoId: updatedScenes[sceneIndex].selectedVideoId || video.id,
          ...(updatedScenes[sceneIndex].selectedVideoId === video.id || !updatedScenes[sceneIndex].selectedVideoId ? {
            videoLocalPath: video.localPath,
            actualDuration: video.actualDuration,
          } : {}),
        };
      }
      return { scenes: updatedScenes };
    });
  },
  
  selectVideo: (sceneIndex, videoId) => {
    set((state) => {
      const updatedScenes = [...state.scenes];
      if (updatedScenes[sceneIndex]) {
        if (!videoId) {
          updatedScenes[sceneIndex] = {
            ...updatedScenes[sceneIndex],
            selectedVideoId: undefined,
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
  
  setSeedFrames: (sceneIndex, frames) => {
    set((state) => {
      const updatedScenes = [...state.scenes];
      const updatedStoryboard = state.project ? [...state.project.storyboard] : [];

      // Ensure the scene exists - if not, initialize it from storyboard
      if (!updatedScenes[sceneIndex] && state.project?.storyboard[sceneIndex]) {
        console.warn(`[SceneSlice] Scene ${sceneIndex} not in scenes array, initializing from storyboard`);
        updatedScenes[sceneIndex] = {
          ...state.project.storyboard[sceneIndex],
          generatedImages: [],
          status: 'pending',
        };
      }

      if (updatedScenes[sceneIndex]) {
        updatedScenes[sceneIndex] = {
          ...updatedScenes[sceneIndex],
          seedFrames: frames,
          selectedSeedFrameIndex: frames.length > 0 ? 0 : undefined, // Auto-select the first (only) frame
        };
      }

      // Auto-enable useSeedFrame for the next scene if it exists
      const nextSceneIndex = sceneIndex + 1;
      if (frames.length > 0 && nextSceneIndex < updatedScenes.length && updatedStoryboard[nextSceneIndex]) {
        updatedStoryboard[nextSceneIndex] = {
          ...updatedStoryboard[nextSceneIndex],
          useSeedFrame: true, // Auto-enable for next scene
        };

        if (updatedScenes[nextSceneIndex]) {
          updatedScenes[nextSceneIndex] = {
            ...updatedScenes[nextSceneIndex],
            useSeedFrame: true,
          };
        }
      }

      return {
        scenes: updatedScenes,
        project: state.project ? {
          ...state.project,
          storyboard: updatedStoryboard,
        } : state.project,
      };
    });
  },
  
  selectSeedFrame: (sceneIndex, frameIndex) => {
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
  
  setFinalVideo: (url, s3Key) => {
    set((state) => {
      if (!state.project) return state;
      return {
        project: {
          ...state.project,
          finalVideoUrl: url,
          finalVideoS3Key: s3Key,
          status: 'COMPLETED',
        },
      };
    });
  },

  generateImageForScene: async (sceneIndex, prompt, seedFrame) => {
    const state = get();
    if (!state.project) throw new Error('No project found');
    
    const { generateImage, pollImageStatus } = await import('@/lib/api-client');
    const scene = state.project.storyboard[sceneIndex];
    if (!scene) throw new Error('Invalid scene');
    
    const referenceImageUrls: string[] = state.project.characterReferences || [];
    const seedImage = referenceImageUrls.length > 0 ? referenceImageUrls[0] : undefined;
    
    const request = {
      prompt: prompt || scene.imagePrompt,
      projectId: state.project.id,
      sceneIndex,
      seedImage,
      referenceImageUrls,
      seedFrame: sceneIndex > 0 ? seedFrame : undefined,
    };
    
    const response = await generateImage(request);
    if (!response.success || !response.predictionId) {
      throw new Error(response.error || 'Failed to start image generation');
    }
    
    const status = await pollImageStatus(response.predictionId);
    if (status.success && status.image) {
      get().addGeneratedImage(sceneIndex, status.image);
    } else {
      throw new Error(status.error || 'Image generation failed');
    }
  },
  
  generateVideoForScene: async (sceneIndex) => {
    const state = get();
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
      scene.videoPrompt || scene.imagePrompt,
      state.project.id,
      sceneIndex,
      seedFrameUrl
    );
    
    if (!response.predictionId) throw new Error('Failed to start video generation');
    
    const status = await pollVideoStatus(response.predictionId);
    if (status.status === 'succeeded' && status.videoPath) {
      get().setVideoPath(sceneIndex, status.videoPath);
    } else {
      throw new Error(status.error || 'Video generation failed');
    }
  },
  
  extractFramesForScene: async (sceneIndex) => {
    const state = get();
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
      get().setSeedFrames(sceneIndex, seedFrames);
    } else {
      throw new Error('No frames extracted');
    }
  },
  
  stitchAllVideos: async () => {
    const state = get();
    if (!state.project) throw new Error('No project found');

    const { stitchVideos, updateProject } = await import('@/lib/api-client');
    const videoPaths = state.scenes
      .map(s => {
        if (s.selectedVideoId && s.generatedVideos) {
          const selectedVideo = s.generatedVideos.find(v => v.id === s.selectedVideoId);
          return selectedVideo?.localPath;
        }
        return s.videoLocalPath;
      })
      .filter((path): path is string => !!path);

    if (videoPaths.length === 0) throw new Error('No videos available');

    const response = await stitchVideos(videoPaths, state.project.id, state.selectedStyle);
    if (response.finalVideoPath) {
      const finalVideoUrl = response.finalVideoPath.startsWith('http')
        ? response.finalVideoPath
        : `/api/serve-video?path=${encodeURIComponent(response.finalVideoPath)}`;

      get().setFinalVideo(finalVideoUrl, response.s3Url);

      try {
        await updateProject(state.project.id, {
          status: 'COMPLETED',
          finalVideoUrl,
          finalVideoS3Key: response.s3Url,
        });
        console.log('[Store] Final video URL saved to backend');
      } catch (error) {
        console.error('[Store] Failed to save final video URL to backend:', error);
      }
    } else {
      throw new Error('Failed to stitch videos');
    }
  },
  
  setWorkflowStep: (step) => {
    set({ currentWorkflowStep: step });
  },
  
  setProcessingSceneIndex: (sceneIndex) => {
    set({ processingSceneIndex: sceneIndex });
  },
  
  pauseWorkflow: () => {
    set({ isWorkflowPaused: true });
  },
  
  resumeWorkflow: () => {
    set({ isWorkflowPaused: false });
  },
  
  setSceneError: (sceneIndex, error) => {
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
  
  clearSceneError: (sceneIndex) => {
    set((state) => {
      const newErrors = { ...state.sceneErrors };
      delete newErrors[sceneIndex];
      return { sceneErrors: newErrors };
    });
  },
  
  retrySceneGeneration: async (sceneIndex) => {
    const state = get();
    state.clearSceneError(sceneIndex);

    try {
      const sceneState = state.scenes[sceneIndex];
      const totalScenes = state.project?.storyboard?.length || 5;
      if (!sceneState?.generatedImages.length) {
        await state.generateImageForScene(sceneIndex);
      } else if (!sceneState.videoLocalPath) {
        await state.generateVideoForScene(sceneIndex);
      } else if (sceneIndex < totalScenes - 1 && !sceneState.seedFrames?.length) {
        await state.extractFramesForScene(sceneIndex);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Retry failed';
      state.setSceneError(sceneIndex, { message: errorMessage, retryable: true });
      throw error;
    }
  },

  duplicateScene: async (sceneIndex) => {
    const state = get();
    if (!state.project) throw new Error('No project found');

    const scene = state.project.storyboard[sceneIndex];
    const sceneState = state.scenes[sceneIndex];

    if (!scene) throw new Error('Invalid scene');

    // Check if scene has been persisted to database
    // A scene is persisted if it has images/videos that have been saved (have replicateId)
    const hasPersistedImages = (sceneState.generatedImages?.length ?? 0) > 0 &&
                                sceneState.generatedImages.some(img => img.replicateId);
    const hasPersistedVideos = (sceneState.generatedVideos?.length ?? 0) > 0;

    if ((hasPersistedImages || hasPersistedVideos) && scene.id) {
      // Server-side duplication: Scene exists in DB with media, copy everything
      const { duplicateScene } = await import('@/lib/api-client');

      try {
        const response = await duplicateScene(state.project.id, scene.id);

        if (!response.success || !response.duplicatedScene) {
          throw new Error(response.error || 'Failed to duplicate scene');
        }

        // Update local state with the duplicated scene from server
        set((currentState) => {
          if (!currentState.project) return currentState;

          const duplicatedScene = response.duplicatedScene!;

          // Insert the duplicated scene into storyboard right after the original
          const updatedStoryboard = [
            ...currentState.project.storyboard.slice(0, sceneIndex + 1),
            duplicatedScene,
            ...currentState.project.storyboard.slice(sceneIndex + 1),
          ];

          // Sort storyboard by sceneNumber
          updatedStoryboard.sort((a, b) => a.order - b.order);

          // Create scene state for the duplicated scene
          const duplicatedSceneState: any = {
            ...duplicatedScene,
            generatedImages: response.duplicatedImages || [],
            selectedImageId: response.duplicatedImages?.[0]?.id,
            generatedVideos: response.duplicatedVideos || [],
            selectedVideoId: response.duplicatedVideos?.[0]?.id,
            videoLocalPath: response.duplicatedVideos?.[0]?.localPath,
            actualDuration: response.duplicatedVideos?.[0]?.actualDuration,
            seedFrames: response.duplicatedSeedFrames || [],
            selectedSeedFrameIndex: sceneState.selectedSeedFrameIndex,
            status: 'pending',
          };

          // Insert into scenes array
          const updatedScenes = [
            ...currentState.scenes.slice(0, sceneIndex + 1),
            duplicatedSceneState,
            ...currentState.scenes.slice(sceneIndex + 1),
          ];

          return {
            project: {
              ...currentState.project,
              storyboard: updatedStoryboard,
            },
            scenes: updatedScenes,
          };
        });

        return response.duplicatedScene;
      } catch (error) {
        // If server-side duplication fails (e.g., scene not in DB), fall back to client-side
        console.warn('Server-side duplication failed, falling back to client-side:', error);
        // Fall through to client-side duplication below
      }
    }

    // Client-side duplication: Scene hasn't been persisted yet, just copy the data
    {
      const { v4: uuidv4 } = await import('uuid');

      // Get the base scene number (the integer part of the order)
      // For scene.order = 0 (Scene 1), baseSceneNumber = 0
      // For scene.order = 1 (Scene 2), baseSceneNumber = 1
      const baseSceneNumber = Math.floor(scene.order);

      // Find existing duplicates with the same base number
      // For Scene 1 (order=0), we look for scenes with order between 0 and 1 (exclusive of 0)
      const existingDuplicates = state.project.storyboard.filter(
        s => {
          const sBase = Math.floor(s.order);
          return sBase === baseSceneNumber && s.order !== baseSceneNumber;
        }
      );

      let newSceneNumber: number;
      if (existingDuplicates.length === 0) {
        // First duplicate: Scene 1 (0) -> Scene 1.1 (0.1)
        newSceneNumber = baseSceneNumber + 0.1;
      } else {
        // Find the highest sub-number and increment
        const maxOrder = Math.max(...existingDuplicates.map(s => s.order));
        const lastSubNumber = Math.round((maxOrder - baseSceneNumber) * 10);
        newSceneNumber = baseSceneNumber + (lastSubNumber + 1) / 10;
      }

      const duplicatedScene = {
        ...scene,
        id: uuidv4(),
        order: newSceneNumber,
        description: `${scene.description} (Copy)`,
      };

      // Copy all generated content from the original scene
      const duplicatedSceneState: SceneWithState = {
        ...duplicatedScene,
        generatedImages: sceneState.generatedImages ? [...sceneState.generatedImages] : [],
        selectedImageId: sceneState.selectedImageId,
        generatedVideos: sceneState.generatedVideos ? [...sceneState.generatedVideos] : [],
        selectedVideoId: sceneState.selectedVideoId,
        videoLocalPath: sceneState.videoLocalPath,
        actualDuration: sceneState.actualDuration,
        seedFrames: sceneState.seedFrames ? [...sceneState.seedFrames] : [],
        selectedSeedFrameIndex: sceneState.selectedSeedFrameIndex,
        status: sceneState.status || 'pending' as const,
      };

      // Update local state
      set((currentState) => {
        if (!currentState.project) return currentState;

        // Insert the duplicated scene into storyboard right after the original
        const updatedStoryboard = [
          ...currentState.project.storyboard.slice(0, sceneIndex + 1),
          duplicatedScene,
          ...currentState.project.storyboard.slice(sceneIndex + 1),
        ];

        // Sort storyboard by order
        updatedStoryboard.sort((a, b) => a.order - b.order);

        // Insert into scenes array at the same position
        const updatedScenes = [
          ...currentState.scenes.slice(0, sceneIndex + 1),
          duplicatedSceneState,
          ...currentState.scenes.slice(sceneIndex + 1),
        ];

        return {
          project: {
            ...currentState.project,
            storyboard: updatedStoryboard,
          },
          scenes: updatedScenes,
        };
      });

      return duplicatedScene;
    }
  },
});


