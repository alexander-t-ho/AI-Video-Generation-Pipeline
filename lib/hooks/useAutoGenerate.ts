/**
 * Hook for auto-generating entire video workflow
 * Automatically generates images and videos for all scenes in sequence
 */

import { useEffect, useRef, useState } from 'react';
import { useProjectStore, useSceneStore, useUIStore } from '@/lib/state/project-store';
import {
  generateImage,
  pollImageStatus,
  generateVideo,
  pollVideoStatus,
  extractFrames,
} from '@/lib/api-client';
import { ImageGenerationRequest } from '@/lib/types';
import { processBatch } from '@/lib/utils/batch-processor';
import { getImageRateLimit, getVideoRateLimit } from '@/lib/config/rate-limits';
import { getEffectiveImageModel, getEffectiveVideoModel } from '@/lib/config/model-runtime';

interface UseAutoGenerateOptions {
  enabled?: boolean;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export function useAutoGenerate(options: UseAutoGenerateOptions = {}) {
  const { enabled = false, onComplete, onError } = options;

  const { project } = useProjectStore();
  const {
    scenes,
    setSceneStatus,
    addGeneratedImage,
    selectImage,
    setVideoPath,
    setSeedFrames,
    selectSeedFrame,
    setGenerationState,
  } = useSceneStore();
  const { addChatMessage } = useUIStore();

  const [isRunning, setIsRunning] = useState(false);
  const hasStartedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Only run once when enabled and storyboard is available
    if (!enabled || hasStartedRef.current || !project || isRunning) {
      return;
    }

    // Wait for storyboard to be available before starting
    if (!project.storyboard || project.storyboard.length === 0) {
      console.log('[useAutoGenerate] Waiting for storyboard to be available...');
      return;
    }

    hasStartedRef.current = true;
    setIsRunning(true);
    abortControllerRef.current = new AbortController();

    const runAutoGeneration = async () => {
      try {
        console.log('[useAutoGenerate] Starting auto-generation for all scenes');

        // Double-check storyboard is still available
        if (!project.storyboard || project.storyboard.length === 0) {
          throw new Error('No storyboard found. Please create a project first.');
        }

        // Wait for AI scene analysis to complete (reference images to be assigned)
        // This happens in setUploadedImages() which runs asynchronously
        const uploadedImages = project.uploadedImages || [];
        if (uploadedImages.length > 0) {
          console.log('[useAutoGenerate] Waiting for AI scene analysis to complete...');
          addChatMessage({
            role: 'agent',
            content: '🔍 Analyzing scenes and selecting appropriate reference images...',
            type: 'status',
          });

          // Wait up to 60 seconds for all scenes to have reference images assigned
          let waitTime = 0;
          const maxWaitTime = 60000; // 60 seconds (increased from 30s)
          const checkInterval = 200; // Check every 200ms (more frequent checks)

          while (waitTime < maxWaitTime) {
            // Get fresh state on each iteration
            const currentState = useProjectStore.getState();
            const storyboard = currentState.project?.storyboard || [];

            // Check if all scenes have references
            const scenesWithRefs = storyboard.filter(
              scene => scene.referenceImageUrls && scene.referenceImageUrls.length > 0
            ).length;

            const totalScenes = storyboard.length;

            console.log(`[useAutoGenerate] Reference assignment progress: ${scenesWithRefs}/${totalScenes} scenes`);

            if (scenesWithRefs === totalScenes && totalScenes > 0) {
              console.log('[useAutoGenerate] ✅ All scenes have AI-selected reference images');

              // Extra verification - log the actual reference URLs
              storyboard.forEach((scene, idx) => {
                console.log(`[useAutoGenerate] Scene ${idx + 1} references:`, scene.referenceImageUrls);
              });

              // CRITICAL: Verify references are actually there
              const finalVerification = storyboard.map((scene, idx) => ({
                sceneIndex: idx,
                hasRefs: !!(scene.referenceImageUrls && scene.referenceImageUrls.length > 0),
                refCount: scene.referenceImageUrls?.length || 0,
                refs: scene.referenceImageUrls
              }));
              console.log('[useAutoGenerate] FINAL VERIFICATION before proceeding:', JSON.stringify(finalVerification, null, 2));

              break;
            }

            await new Promise(resolve => setTimeout(resolve, checkInterval));
            waitTime += checkInterval;
          }

          if (waitTime >= maxWaitTime) {
            console.error('[useAutoGenerate] ❌ Timeout waiting for AI scene analysis after 60 seconds');
            console.error('[useAutoGenerate] Current state:', {
              uploadedImages: uploadedImages.length,
              scenes: project.storyboard.map((scene, idx) => ({
                index: idx + 1,
                hasRefs: !!(scene.referenceImageUrls && scene.referenceImageUrls.length > 0),
                refCount: scene.referenceImageUrls?.length || 0
              }))
            });

            // Fallback: Assign uploaded images to all scenes without reference images
            const currentState = useProjectStore.getState();
            const interiorImages = uploadedImages.filter(img =>
              img.originalName?.toLowerCase().includes('interior') ||
              img.url.toLowerCase().includes('interior')
            );
            const exteriorImages = uploadedImages.filter(img =>
              !img.originalName?.toLowerCase().includes('interior') &&
              !img.url.toLowerCase().includes('interior')
            );

            console.log('[useAutoGenerate] Fallback: Found', {
              interior: interiorImages.length,
              exterior: exteriorImages.length,
              total: uploadedImages.length
            });

            // Assign to scenes without references
            if (currentState.project?.storyboard) {
              currentState.project.storyboard.forEach((scene, index) => {
                if (!scene.referenceImageUrls || scene.referenceImageUrls.length === 0) {
                  // Pick up to 3 reference images
                  const selectedRefs: string[] = [];

                  // Strategy: 1 interior + 2 exterior (if available)
                  if (interiorImages.length > 0) {
                    selectedRefs.push(interiorImages[0].localPath || interiorImages[0].url);
                  }

                  const numExteriorToAdd = Math.min(2, exteriorImages.length);
                  for (let i = 0; i < numExteriorToAdd; i++) {
                    if (exteriorImages[i]) {
                      selectedRefs.push(exteriorImages[i].localPath || exteriorImages[i].url);
                    }
                  }

                  // If no interior/exterior split, just use first 3 images
                  if (selectedRefs.length === 0) {
                    selectedRefs.push(...uploadedImages.slice(0, 3).map(img => img.localPath || img.url));
                  }

                  if (selectedRefs.length > 0) {
                    const state = useProjectStore.getState();
                    state.updateSceneSettings?.(index, { referenceImageUrls: selectedRefs });
                    console.log(`[useAutoGenerate] Fallback: Assigned ${selectedRefs.length} references to scene ${index + 1}:`, selectedRefs);
                  }
                }
              });
            }
          }
        }

        addChatMessage({
          role: 'agent',
          content: '🚀 Starting auto-generation for entire video...',
          type: 'status',
        });

        // Get rate limits for current models
        const imageModel = getEffectiveImageModel();
        const videoModel = getEffectiveVideoModel();
        const imageRateLimit = getImageRateLimit(imageModel);
        const videoRateLimit = getVideoRateLimit(videoModel);

        console.log('[useAutoGenerate] Rate limits:', {
          imageModel,
          videoModel,
          imageLimit: imageRateLimit,
          videoLimit: videoRateLimit,
        });

        // PHASE 1: Generate all images with rate limiting
        addChatMessage({
          role: 'agent',
          content: `🎨 Generating images (max ${imageRateLimit.maxConcurrent} concurrent)...`,
          type: 'status',
        });

        const imageTasks = project.storyboard.map((scene, sceneIndex) => {
          return async () => {
            // Attempt image generation with 1 retry
            let lastError: Error | null = null;
            for (let attempt = 1; attempt <= 2; attempt++) {
              try {
                console.log(`[useAutoGenerate] Scene ${sceneIndex}: Starting image generation (attempt ${attempt}/2)`);
                const generatedImage = await generateImageForScene(sceneIndex);
                console.log(`[useAutoGenerate] Scene ${sceneIndex}: ✓ Image generated`);
                
                if (attempt > 1) {
                  addChatMessage({
                    role: 'agent',
                    content: `✓ Scene ${sceneIndex + 1} image generated (retry succeeded)`,
                    type: 'status',
                  });
                }
                
                return { sceneIndex, image: generatedImage };
              } catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                console.error(`[useAutoGenerate] Scene ${sceneIndex} image failed (attempt ${attempt}/2):`, lastError);
                
                if (attempt === 1) {
                  // First attempt failed, notify user we're retrying
                  addChatMessage({
                    role: 'agent',
                    content: `⚠️ Scene ${sceneIndex + 1} image failed, retrying...`,
                    type: 'error',
                  });
                  // Small delay before retry
                  await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                  // Second attempt failed, give up
                  addChatMessage({
                    role: 'agent',
                    content: `❌ Scene ${sceneIndex + 1} image failed after retry: ${lastError.message}`,
                    type: 'error',
                  });
                  throw lastError;
                }
              }
            }
            
            // Should never reach here, but TypeScript needs it
            throw lastError || new Error('Image generation failed');
          };
        });

        let imageResults: any[];
        try {
          imageResults = await processBatch(imageTasks, {
            maxConcurrent: imageRateLimit.maxConcurrent,
            minDelayBetweenRequests: imageRateLimit.minDelayBetweenRequests,
            onProgress: (completed, total) => {
              console.log(`[useAutoGenerate] Images: ${completed}/${total} completed`);
            },
          });
        } catch (error: any) {
          // Batch processing failed - some images didn't generate
          const errors = error.errors || [];
          const results = error.results || [];
          const successCount = results.filter((r: any) => r !== undefined).length;
          const failedSceneNumbers = project.storyboard
            .map((_, idx) => idx)
            .filter(idx => !results[idx])
            .map(idx => idx + 1);

          console.error(`[useAutoGenerate] Image generation partially failed: ${successCount}/${project.storyboard.length} succeeded`);
          addChatMessage({
            role: 'agent',
            content: `⚠️ Image generation completed with errors: ${successCount}/${project.storyboard.length} scenes succeeded. Scene${failedSceneNumbers.length > 1 ? 's' : ''} ${failedSceneNumbers.join(', ')} failed after retry.`,
            type: 'error',
          });

          // Stop the workflow - we can't proceed without images
          throw new Error(`Image generation failed: Only ${successCount}/${project.storyboard.length} images generated successfully. Scene${failedSceneNumbers.length > 1 ? 's' : ''} ${failedSceneNumbers.join(', ')} failed.`);
        }

        const successfulImages = imageResults.filter((r: any) => r !== undefined).length;
        addChatMessage({
          role: 'agent',
          content: `✓ All ${successfulImages} images generated`,
          type: 'status',
        });

        // PHASE 2: Generate all videos with rate limiting
        addChatMessage({
          role: 'agent',
          content: `🎬 Generating videos (max ${videoRateLimit.maxConcurrent} concurrent)...`,
          type: 'status',
        });

        const videoTasks = project.storyboard.map((scene, sceneIndex) => {
          return async () => {
            const imageData = imageResults[sceneIndex];

            // Skip if image generation failed for this scene
            if (!imageData || !imageData.image) {
              console.warn(`[useAutoGenerate] Scene ${sceneIndex}: Skipping video generation - no image available`);
              throw new Error(`No image available for scene ${sceneIndex + 1}`);
            }

            // Attempt video generation with 1 retry
            let lastError: Error | null = null;
            for (let attempt = 1; attempt <= 2; attempt++) {
              try {
                console.log(`[useAutoGenerate] Scene ${sceneIndex}: Starting video generation (attempt ${attempt}/2)`);
                
                await generateVideoForScene(sceneIndex, imageData.image);
                console.log(`[useAutoGenerate] Scene ${sceneIndex}: ✓ Video generated`);

                addChatMessage({
                  role: 'agent',
                  content: `✓ Scene ${sceneIndex + 1} completed${attempt > 1 ? ' (retry succeeded)' : ''}`,
                  type: 'status',
                });

                return { sceneIndex, success: true };
              } catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                console.error(`[useAutoGenerate] Scene ${sceneIndex} video failed (attempt ${attempt}/2):`, lastError);
                
                if (attempt === 1) {
                  // First attempt failed, notify user we're retrying
                  addChatMessage({
                    role: 'agent',
                    content: `⚠️ Scene ${sceneIndex + 1} video failed, retrying...`,
                    type: 'error',
                  });
                  // Small delay before retry
                  await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                  // Second attempt failed, give up
                  addChatMessage({
                    role: 'agent',
                    content: `❌ Scene ${sceneIndex + 1} video failed after retry: ${lastError.message}. Please regenerate manually.`,
                    type: 'error',
                  });
                  throw lastError;
                }
              }
            }
            
            // Should never reach here, but TypeScript needs it
            throw lastError || new Error('Video generation failed');
          };
        });

        let videoResults: any[];
        try {
          videoResults = await processBatch(videoTasks, {
            maxConcurrent: videoRateLimit.maxConcurrent,
            minDelayBetweenRequests: videoRateLimit.minDelayBetweenRequests,
            onProgress: (completed, total) => {
              console.log(`[useAutoGenerate] Videos: ${completed}/${total} completed`);
            },
          });
        } catch (error: any) {
          // Batch processing failed - some videos didn't generate
          const errors = error.errors || [];
          const results = error.results || [];
          const successCount = results.filter((r: any) => r !== undefined).length;

          console.error(`[useAutoGenerate] Video generation partially failed: ${successCount}/${project.storyboard.length} succeeded`);
          
          // Continue with partial success instead of stopping
          videoResults = results;
          
          if (successCount === 0) {
            // If ALL videos failed, then we should stop
            addChatMessage({
              role: 'agent',
              content: `❌ Video generation failed: No videos generated successfully`,
              type: 'error',
            });
            throw new Error(`Video generation failed: No videos generated successfully`);
          }
          
          // Some videos succeeded, continue with warning
          addChatMessage({
            role: 'agent',
            content: `⚠️ Video generation completed with errors: ${successCount}/${project.storyboard.length} scenes succeeded. Continuing with available videos...`,
            type: 'error',
          });
        }

        const successfulVideos = videoResults.filter((r: any) => r !== undefined).length;
        if (successfulVideos === project.storyboard.length) {
          addChatMessage({
            role: 'agent',
            content: `✓ All ${successfulVideos} videos generated`,
            type: 'status',
          });
        } else {
          addChatMessage({
            role: 'agent',
            content: `✓ ${successfulVideos}/${project.storyboard.length} videos generated successfully`,
            type: 'status',
          });
        }

        // PHASE 3: Extract frames sequentially (fast operation)
        for (let sceneIndex = 0; sceneIndex < project.storyboard.length - 1; sceneIndex++) {
          if (abortControllerRef.current?.signal.aborted) {
            throw new Error('Auto-generation cancelled');
          }
          await extractFramesForScene(sceneIndex);
        }

        const completedScenes = successfulVideos;
        const failedScenes = project.storyboard.length - completedScenes;
        console.log(`[useAutoGenerate] ✓ ${completedScenes}/${project.storyboard.length} scenes completed`);

        console.log('[useAutoGenerate] Auto-generation completed');
        if (completedScenes === project.storyboard.length) {
          addChatMessage({
            role: 'agent',
            content: '✨ Auto-generation complete! All scenes have been generated successfully.',
            type: 'status',
          });
        } else {
          // Find which scenes failed
          const failedSceneNumbers = project.storyboard
            .map((_, idx) => idx)
            .filter(idx => !videoResults[idx])
            .map(idx => idx + 1);
          
          addChatMessage({
            role: 'agent',
            content: `✨ Auto-generation complete! ${completedScenes}/${project.storyboard.length} videos generated successfully. Scene${failedScenes > 1 ? 's' : ''} ${failedSceneNumbers.join(', ')} failed after retry and need manual regeneration.`,
            type: 'error',
          });
        }

        if (onComplete) {
          onComplete();
        }
      } catch (error) {
        console.error('[useAutoGenerate] Auto-generation failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        addChatMessage({
          role: 'agent',
          content: `❌ Auto-generation failed: ${errorMessage}`,
          type: 'error',
        });

        if (onError) {
          onError(error instanceof Error ? error : new Error(errorMessage));
        }
      } finally {
        setIsRunning(false);
        abortControllerRef.current = null;
      }
    };

    runAutoGeneration();
  }, [enabled, project, isRunning]);

  // Generate image for a specific scene
  const generateImageForScene = async (sceneIndex: number) => {
    // IMPORTANT: Get fresh state to avoid stale closure
    const currentState = useProjectStore.getState();
    const scene = currentState.project!.storyboard[sceneIndex];
    const uploadedImages = currentState.project!.uploadedImages || [];

    console.log('='.repeat(80));
    console.log(`[useAutoGenerate] generateImageForScene called for scene ${sceneIndex}`);
    console.log(`[useAutoGenerate] Scene object:`, JSON.stringify({
      index: sceneIndex,
      description: scene.description,
      hasReferenceImageUrls: !!scene.referenceImageUrls,
      referenceImageUrlsType: Array.isArray(scene.referenceImageUrls) ? 'array' : typeof scene.referenceImageUrls,
      referenceImageUrlsLength: scene.referenceImageUrls?.length || 0,
      referenceImageUrls: scene.referenceImageUrls,
      imagePrompt: scene.imagePrompt?.substring(0, 100)
    }, null, 2));
    console.log('='.repeat(80));
    setSceneStatus(sceneIndex, 'generating_image');
    setGenerationState(sceneIndex, { isGeneratingImage: true });

    // Get seed frame from previous scene if available
    let seedFrameUrl: string | undefined;
    if (sceneIndex > 0 && scenes[sceneIndex - 1]?.seedFrames && scenes[sceneIndex - 1].seedFrames!.length > 0) {
      const prevScene = scenes[sceneIndex - 1];
      const selectedFrameIndex = prevScene.selectedSeedFrameIndex ?? 0;
      seedFrameUrl = prevScene.seedFrames![selectedFrameIndex]?.url;
    }

    // Use scene-specific reference images if available (AI-selected based on interior/exterior)
    // Otherwise fall back to all uploaded images
    let referenceImageUrls: string[] = [];
    if (scene.referenceImageUrls && Array.isArray(scene.referenceImageUrls) && scene.referenceImageUrls.length > 0) {
      referenceImageUrls = scene.referenceImageUrls as string[];
      console.log(`[useAutoGenerate] Scene ${sceneIndex}: Using ${referenceImageUrls.length} AI-selected scene-specific reference images`);
    } else {
      referenceImageUrls = uploadedImages.map(img => img.localPath || img.url);
      console.log(`[useAutoGenerate] Scene ${sceneIndex}: Using ${referenceImageUrls.length} brand assets as reference images (fallback - no scene-specific selection)`);
    }

    if (referenceImageUrls.length > 0) {
      console.log(`[useAutoGenerate] Scene ${sceneIndex}: Reference URLs:`, referenceImageUrls);
    } else {
      console.warn(`[useAutoGenerate] Scene ${sceneIndex}: ⚠️  NO REFERENCE IMAGES - This may produce inconsistent results!`);
    }

    // CRITICAL: Use first reference image as seedImage to trigger image-to-image mode
    // This ensures IP-Adapter is used for consistency (just like manual mode)
    let seedImageUrl: string | undefined;
    if (referenceImageUrls.length > 0) {
      seedImageUrl = referenceImageUrls[0];
      console.log(`[useAutoGenerate] Scene ${sceneIndex}: Using first reference image as seedImage for I2I mode:`, seedImageUrl.substring(0, 80) + '...');
    } else if (seedFrameUrl) {
      seedImageUrl = seedFrameUrl;
      console.log(`[useAutoGenerate] Scene ${sceneIndex}: Using seed frame as seedImage:`, seedFrameUrl.substring(0, 80) + '...');
    }

    const imageRequest: ImageGenerationRequest = {
      projectId: currentState.project!.id,
      sceneIndex,
      prompt: scene.imagePrompt,
      negativePrompt: scene.negativePrompt,
      seedImage: seedImageUrl, // ← ADDED: This triggers image-to-image mode with IP-Adapter
      referenceImageUrls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
      seedFrame: seedFrameUrl,
    };

    console.log(`[useAutoGenerate] Scene ${sceneIndex}: Sending image generation request with:`, {
      prompt: scene.imagePrompt?.substring(0, 100),
      referenceImageCount: referenceImageUrls.length,
      hasSeedImage: !!seedImageUrl,
      hasSeedFrame: !!seedFrameUrl,
    });

    const imageResponse = await generateImage(imageRequest);

    if (!imageResponse.predictionId) {
      throw new Error(`Image generation failed to start for scene ${sceneIndex + 1}`);
    }

    // Poll for completion
    const imageStatus = await pollImageStatus(imageResponse.predictionId, {
      projectId: currentState.project!.id,
      sceneIndex,
    });

    if (!imageStatus || imageStatus.status !== 'succeeded' || !imageStatus.image) {
      throw new Error(`Image generation failed for scene ${sceneIndex + 1}`);
    }

    // Add to store
    addGeneratedImage(sceneIndex, imageStatus.image);
    selectImage(sceneIndex, imageStatus.image.id);
    setSceneStatus(sceneIndex, 'image_ready');
    setGenerationState(sceneIndex, { isGeneratingImage: false });

    console.log(`[useAutoGenerate] Image generated for scene ${sceneIndex}`);

    // Return the generated image for immediate use
    return imageStatus.image;
  };

  // Generate video for a specific scene
  const generateVideoForScene = async (sceneIndex: number, imageToUse?: any) => {
    const scene = project!.storyboard[sceneIndex];

    // Use the provided image or fall back to checking scene state
    let selectedImage = imageToUse;
    if (!selectedImage) {
      const sceneState = scenes[sceneIndex];
      if (!sceneState?.selectedImageId) {
        throw new Error(`No selected image for scene ${sceneIndex + 1}`);
      }
      selectedImage = sceneState.generatedImages?.find(
        img => img.id === sceneState.selectedImageId
      );
      if (!selectedImage) {
        throw new Error(`Selected image not found for scene ${sceneIndex + 1}`);
      }
    }

    console.log(`[useAutoGenerate] Generating video for scene ${sceneIndex}`);
    setSceneStatus(sceneIndex, 'generating_video');
    setGenerationState(sceneIndex, { isGeneratingVideo: true });

    const videoResponse = await generateVideo(
      selectedImage.url,
      scene.videoPrompt || scene.imagePrompt,
      project!.id,
      sceneIndex,
      undefined, // seedFrame
      scene.customDuration || scene.suggestedDuration
    );

    // Poll for completion
    const completedVideo = await pollVideoStatus(videoResponse.predictionId, {
      projectId: project!.id,
      sceneIndex,
    });

    if (!completedVideo || completedVideo.status !== 'succeeded' || !completedVideo.videoPath) {
      throw new Error(`Video generation failed for scene ${sceneIndex + 1}`);
    }

    // Update store with video path
    setVideoPath(sceneIndex, completedVideo.videoPath, completedVideo.actualDuration || scene.suggestedDuration);
    setSceneStatus(sceneIndex, 'video_ready');
    setGenerationState(sceneIndex, { isGeneratingVideo: false });

    console.log(`[useAutoGenerate] Video generated for scene ${sceneIndex}`);
  };

  // Extract frames for seed frame selection
  const extractFramesForScene = async (sceneIndex: number) => {
    const sceneState = scenes[sceneIndex];

    if (!sceneState?.videoLocalPath) {
      console.warn(`[useAutoGenerate] No video path for scene ${sceneIndex}, skipping frame extraction`);
      return;
    }

    console.log(`[useAutoGenerate] Extracting frames for scene ${sceneIndex}`);

    const framesResponse = await extractFrames(
      sceneState.videoLocalPath,
      project!.id,
      sceneIndex
    );

    if (framesResponse.frames && framesResponse.frames.length > 0) {
      setSeedFrames(sceneIndex, framesResponse.frames);
      // Auto-select the middle frame
      const middleIndex = Math.floor(framesResponse.frames.length / 2);
      selectSeedFrame(sceneIndex, middleIndex);
      console.log(`[useAutoGenerate] Extracted ${framesResponse.frames.length} frames for scene ${sceneIndex}`);
    }
  };

  return {
    isRunning,
  };
}
