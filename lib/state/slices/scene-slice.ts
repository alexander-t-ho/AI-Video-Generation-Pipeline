import { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { ProjectStore, SceneSlice, WorkflowStep } from '../types';
import { GeneratedVideo, SeedFrame } from '@/lib/types';

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
  
  selectImage: (sceneIndex, imageId) => {
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
      if (updatedScenes[sceneIndex]) {
        updatedScenes[sceneIndex] = {
          ...updatedScenes[sceneIndex],
          seedFrames: frames,
        };
      }
      return { scenes: updatedScenes };
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
          status: 'completed',
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

    const response = await stitchVideos(videoPaths, state.project.id);
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
});


