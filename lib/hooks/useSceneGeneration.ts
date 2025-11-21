/**
 * Hook for managing sequential scene generation workflow
 * Automatically advances through: image → video → frames → next scene
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useProjectStore } from '@/lib/state/project-store';
import {
  generateImage,
  pollImageStatus,
  generateVideo,
  pollVideoStatus,
  extractFrames,
} from '@/lib/api-client';
import { ImageGenerationRequest } from '@/lib/types';

type WorkflowStep = 'idle' | 'generating_image' | 'image_ready' | 'generating_video' | 'video_ready' | 'extracting_frames' | 'frames_ready' | 'completed' | 'error';

interface UseSceneGenerationOptions {
  autoAdvance?: boolean; // Auto-advance to next step
  autoStartNextScene?: boolean; // Auto-start next scene after completion
  onStepChange?: (step: WorkflowStep, sceneIndex: number) => void;
  onSceneComplete?: (sceneIndex: number) => void;
  onError?: (error: Error, sceneIndex: number, step: WorkflowStep) => void;
}

interface UseSceneGenerationReturn {
  currentStep: WorkflowStep;
  currentSceneIndex: number;
  isProcessing: boolean;
  isPaused: boolean;
  pause: () => void;
  resume: () => void;
  startScene: (sceneIndex: number) => Promise<void>;
  skipStep: () => void;
  retry: () => Promise<void>;
  reset: () => void;
}

export function useSceneGeneration(
  options: UseSceneGenerationOptions = {}
): UseSceneGenerationReturn {
  const {
    autoAdvance = true,
    autoStartNextScene = false,
    onStepChange,
    onSceneComplete,
    onError,
  } = options;

  const {
    project,
    scenes,
    currentSceneIndex,
    setCurrentSceneIndex,
    setSceneStatus,
    addGeneratedImage,
    selectImage,
    setVideoPath,
    setSeedFrames,
    selectSeedFrame,
    addChatMessage,
  } = useProjectStore();

  const [currentStep, setCurrentStep] = useState<WorkflowStep>('idle');
  const [isPaused, setIsPaused] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingSceneIndex, setProcessingSceneIndex] = useState<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Get seed frame URL from previous scene
  const getSeedFrameUrl = useCallback(
    (sceneIndex: number): string | undefined => {
      if (sceneIndex === 0) return undefined;
      const previousScene = scenes[sceneIndex - 1];
      if (
        previousScene?.selectedSeedFrameIndex !== undefined &&
        previousScene.seedFrames
      ) {
        const selectedFrame =
          previousScene.seedFrames[previousScene.selectedSeedFrameIndex];
        return selectedFrame?.url;
      }
      return undefined;
    },
    [scenes]
  );

  // Update step and notify callback
  const updateStep = useCallback(
    (step: WorkflowStep, sceneIndex: number) => {
      setCurrentStep(step);
      if (onStepChange) {
        onStepChange(step, sceneIndex);
      }
    },
    [onStepChange]
  );

  // Generate image for a scene
  const generateImageForScene = useCallback(
    async (sceneIndex: number, customPrompt?: string): Promise<void> => {
      if (!project || !project.storyboard || !project.storyboard[sceneIndex]) {
        throw new Error('Invalid scene');
      }

      const scene = project.storyboard[sceneIndex];
      updateStep('generating_image', sceneIndex);
      setSceneStatus(sceneIndex, 'generating_image');

      addChatMessage({
        role: 'agent',
        content: `Starting Scene ${sceneIndex + 1}/5: Generating image...`,
        type: 'status',
      });

      const seedFrameUrl = getSeedFrameUrl(sceneIndex);
      // Reference images would come from uploaded images for object consistency
      // For now, using empty array as placeholder
      const referenceImageUrls: string[] = [];
      
      // OPTION 1: Reference image is the PRIMARY driver for ALL scenes
      // Use reference image as seed (primary) + seed frame via IP-Adapter (for continuity in scenes 1-4)
      const seedImage = referenceImageUrls.length > 0 ? referenceImageUrls[0] : undefined;
      
      // Get prompt adjustment mode from runtime config
      const { getRuntimeConfig } = await import('@/lib/config/model-runtime');
      const runtimeConfig = getRuntimeConfig();
      const promptAdjustmentMode = runtimeConfig.promptAdjustmentMode || 'scene-specific';
      
      const request: ImageGenerationRequest = {
        prompt: customPrompt || scene.imagePrompt,
        projectId: project.id,
        sceneIndex,
        seedImage, // Reference image as seed (PRIMARY driver for object consistency)
        referenceImageUrls, // Always pass reference images (also used in IP-Adapter)
        seedFrame: sceneIndex > 0 ? seedFrameUrl : undefined, // Seed frame for IP-Adapter (for visual continuity in scenes 1-4)
        promptAdjustmentMode, // Prompt adjustment mode from runtime config
      };

      const response = await generateImage(request);

      if (!response.success || !response.predictionId) {
        throw new Error(response.error || 'Failed to start image generation');
      }

      // Poll for completion
      const status = await pollImageStatus(response.predictionId, {
        interval: 2000,
        timeout: 300000,
        onProgress: (progress) => {
          if (progress.progress) {
            addChatMessage({
              role: 'agent',
              content: `Image generation progress: ${Math.round(progress.progress)}%`,
              type: 'status',
            });
          }
        },
      });

      if (status.success && status.image) {
        addGeneratedImage(sceneIndex, status.image);
        if (!scenes[sceneIndex]?.selectedImageId) {
          selectImage(sceneIndex, status.image.id);
        }
        updateStep('image_ready', sceneIndex);
        setSceneStatus(sceneIndex, 'image_ready');
        addChatMessage({
          role: 'agent',
          content: `✓ Image generated for Scene ${sceneIndex + 1}`,
          type: 'status',
        });
      } else {
        throw new Error(status.error || 'Image generation failed');
      }
    },
    [
      project,
      scenes,
      getSeedFrameUrl,
      addGeneratedImage,
      selectImage,
      setSceneStatus,
      addChatMessage,
      updateStep,
    ]
  );

  // Generate video for a scene
  const generateVideoForScene = useCallback(
    async (sceneIndex: number): Promise<void> => {
      if (!project || !project.storyboard || !project.storyboard[sceneIndex]) {
        throw new Error('Invalid scene');
      }

      const sceneState = scenes[sceneIndex];
      const selectedImage = sceneState?.selectedImageId
        ? sceneState.generatedImages.find((img) => img.id === sceneState.selectedImageId)
        : sceneState?.generatedImages[0];

      if (!selectedImage) {
        throw new Error('No image available for video generation');
      }

      const scene = project.storyboard[sceneIndex];
      updateStep('generating_video', sceneIndex);
      setSceneStatus(sceneIndex, 'generating_video');

      addChatMessage({
        role: 'agent',
        content: `Generating video for Scene ${sceneIndex + 1}/5...`,
        type: 'status',
      });

      const seedFrameUrl = getSeedFrameUrl(sceneIndex);
      const response = await generateVideo(
        selectedImage.url,
        scene.imagePrompt,
        project.id,
        sceneIndex,
        seedFrameUrl
      );

      if (!response.predictionId) {
        throw new Error('Failed to start video generation');
      }

      // Poll for completion
      const status = await pollVideoStatus(response.predictionId, {
        interval: 5000,
        timeout: 600000,
        onProgress: (progress) => {
          addChatMessage({
            role: 'agent',
            content: `Video generation in progress... (${progress.status || 'processing'})`,
            type: 'status',
          });
        },
      });

      if (status.status === 'succeeded' && status.videoPath) {
        setVideoPath(sceneIndex, status.videoPath);
        updateStep('video_ready', sceneIndex);
        setSceneStatus(sceneIndex, 'video_ready');
        addChatMessage({
          role: 'agent',
          content: `✓ Video generated for Scene ${sceneIndex + 1}`,
          type: 'status',
        });
      } else {
        throw new Error(status.error || 'Video generation failed');
      }
    },
    [
      project,
      scenes,
      getSeedFrameUrl,
      setVideoPath,
      setSceneStatus,
      addChatMessage,
      updateStep,
    ]
  );

  // Extract frames from video
  const extractFramesForScene = useCallback(
    async (sceneIndex: number): Promise<void> => {
      if (!project) {
        throw new Error('No project found');
      }

      const sceneState = scenes[sceneIndex];
      if (!sceneState?.videoLocalPath) {
        throw new Error('No video available for frame extraction');
      }

      // Skip frame extraction for last scene
      if (sceneIndex >= 2) {
        updateStep('completed', sceneIndex);
        setSceneStatus(sceneIndex, 'completed');
        return;
      }

      updateStep('extracting_frames', sceneIndex);
      addChatMessage({
        role: 'agent',
        content: `Extracting seed frames from Scene ${sceneIndex + 1}...`,
        type: 'status',
      });

      const response = await extractFrames(
        sceneState.videoLocalPath,
        project.id,
        sceneIndex
      );

      if (response.frames && response.frames.length > 0) {
        const seedFrames = response.frames.map((frame) => ({
          id: frame.id,
          url: frame.url,
          timestamp: frame.timestamp,
        }));

        setSeedFrames(sceneIndex, seedFrames);
        updateStep('frames_ready', sceneIndex);
        addChatMessage({
          role: 'agent',
          content: `✓ Seed frames extracted. Please select a frame for Scene ${sceneIndex + 2}.`,
          type: 'status',
        });
      } else {
        throw new Error('No frames extracted');
      }
    },
    [project, scenes, setSeedFrames, addChatMessage, updateStep, setSceneStatus]
  );

  // Start processing a scene
  const startScene = useCallback(
    async (sceneIndex: number): Promise<void> => {
      if (isProcessing || isPaused) return;

      setIsProcessing(true);
      setProcessingSceneIndex(sceneIndex);
      setCurrentSceneIndex(sceneIndex);

      try {
        // Step 1: Generate image
        await generateImageForScene(sceneIndex);

        // Auto-advance if enabled
        if (autoAdvance && !isPaused) {
          // Step 2: Generate video
          await generateVideoForScene(sceneIndex);

          // Step 3: Extract frames (if not last scene)
          if (sceneIndex < 4) {
            await extractFramesForScene(sceneIndex);
          } else {
            updateStep('completed', sceneIndex);
            setSceneStatus(sceneIndex, 'completed');
          }
        }

        // Notify completion
        if (onSceneComplete) {
          onSceneComplete(sceneIndex);
        }

        // Auto-start next scene if enabled
        if (autoStartNextScene && sceneIndex < 4 && !isPaused) {
          // Wait for seed frame selection
          // This will be handled by the component watching for seed frame selection
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        updateStep('error', sceneIndex);
        setSceneStatus(sceneIndex, 'pending');
        addChatMessage({
          role: 'agent',
          content: `❌ Error in Scene ${sceneIndex + 1}: ${err.message}`,
          type: 'error',
        });
        if (onError) {
          onError(err, sceneIndex, currentStep);
        }
      } finally {
        setIsProcessing(false);
        setProcessingSceneIndex(null);
      }
    },
    [
      isProcessing,
      isPaused,
      autoAdvance,
      generateImageForScene,
      generateVideoForScene,
      extractFramesForScene,
      setCurrentSceneIndex,
      setSceneStatus,
      addChatMessage,
      updateStep,
      onSceneComplete,
      onError,
      currentStep,
    ]
  );

  // Pause workflow
  const pause = useCallback(() => {
    setIsPaused(true);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    addChatMessage({
      role: 'agent',
      content: '⏸️ Workflow paused',
      type: 'status',
    });
  }, [addChatMessage]);

  // Resume workflow
  const resume = useCallback(() => {
    setIsPaused(false);
    addChatMessage({
      role: 'agent',
      content: '▶️ Workflow resumed',
      type: 'status',
    });
  }, [addChatMessage]);

  // Skip current step
  const skipStep = useCallback(() => {
    if (!isProcessing) return;

    const sceneIndex = processingSceneIndex ?? currentSceneIndex;
    const sceneState = scenes[sceneIndex];

    // Determine next step based on current state
    if (currentStep === 'generating_image' || currentStep === 'image_ready') {
      // Skip to video generation
      if (sceneState?.generatedImages.length > 0) {
        generateVideoForScene(sceneIndex).catch(console.error);
      }
    } else if (currentStep === 'generating_video' || currentStep === 'video_ready') {
      // Skip to frame extraction
      if (sceneState?.videoLocalPath) {
        extractFramesForScene(sceneIndex).catch(console.error);
      }
    } else if (currentStep === 'extracting_frames' || currentStep === 'frames_ready') {
      // Skip to next scene
      if (sceneIndex < 4) {
        setCurrentSceneIndex(sceneIndex + 1);
      }
    }
  }, [
    isProcessing,
    processingSceneIndex,
    currentSceneIndex,
    currentStep,
    scenes,
    generateVideoForScene,
    extractFramesForScene,
    setCurrentSceneIndex,
  ]);

  // Retry current step
  const retry = useCallback(async (): Promise<void> => {
    if (!isProcessing && processingSceneIndex !== null) {
      await startScene(processingSceneIndex);
    } else if (!isProcessing) {
      await startScene(currentSceneIndex);
    }
  }, [isProcessing, processingSceneIndex, currentSceneIndex, startScene]);

  // Reset workflow
  const reset = useCallback(() => {
    setCurrentStep('idle');
    setIsPaused(false);
    setIsProcessing(false);
    setProcessingSceneIndex(null);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = null;
  }, []);

  // Auto-advance when image is ready (if auto-advance is enabled)
  useEffect(() => {
    if (!autoAdvance || isPaused || isProcessing) return;

    const sceneIndex = processingSceneIndex ?? currentSceneIndex;
    const sceneState = scenes[sceneIndex];

    if (currentStep === 'image_ready' && sceneState?.generatedImages.length > 0) {
      // Auto-generate video
      generateVideoForScene(sceneIndex).catch(console.error);
    } else if (currentStep === 'video_ready' && sceneState?.videoLocalPath) {
      // Auto-extract frames
      if (sceneIndex < 4) {
        extractFramesForScene(sceneIndex).catch(console.error);
      } else {
        updateStep('completed', sceneIndex);
        setSceneStatus(sceneIndex, 'completed');
      }
    }
  }, [
    autoAdvance,
    isPaused,
    isProcessing,
    currentStep,
    processingSceneIndex,
    currentSceneIndex,
    scenes,
    generateVideoForScene,
    extractFramesForScene,
    updateStep,
    setSceneStatus,
  ]);

  // Auto-start next scene after seed frame selection
  useEffect(() => {
    if (!autoStartNextScene || isPaused || isProcessing) return;

    const sceneIndex = processingSceneIndex ?? currentSceneIndex;
    if (sceneIndex >= 2) return; // Last scene

    const sceneState = scenes[sceneIndex];
    if (
      currentStep === 'frames_ready' &&
      sceneState?.selectedSeedFrameIndex !== undefined &&
      sceneIndex < 2
    ) {
      // Auto-start next scene
      const nextSceneIndex = sceneIndex + 1;
      setCurrentSceneIndex(nextSceneIndex);
      startScene(nextSceneIndex).catch(console.error);
    }
  }, [
    autoStartNextScene,
    isPaused,
    isProcessing,
    currentStep,
    processingSceneIndex,
    currentSceneIndex,
    scenes,
    setCurrentSceneIndex,
    startScene,
  ]);

  return {
    currentStep,
    currentSceneIndex: processingSceneIndex ?? currentSceneIndex,
    isProcessing,
    isPaused,
    pause,
    resume,
    startScene,
    skipStep,
    retry,
    reset,
  };
}

