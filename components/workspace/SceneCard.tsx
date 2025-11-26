'use client';

import { Scene } from '@/lib/types';
import { CheckCircle2, Loader2, AlertCircle, Image as ImageIcon, Video, Copy, ArrowLeft, ArrowRight } from 'lucide-react';
import { useProjectStore } from '@/lib/state/project-store';
import { generateImage, pollImageStatus, generateVideo, pollVideoStatus } from '@/lib/api-client';
import { ImageGenerationRequest } from '@/lib/types';
import { useState, useEffect, useRef } from 'react';
import {
  SCENE_CONSTANTS,
  findImageById,
  findImageUrlById,
  formatImageUrl,
  formatSceneNumber,
  validateCustomImageUrls,
  type ImageSearchContext,
} from '@/lib/utils/scene-helpers';

interface SceneCardProps {
  scene: Scene;
  sceneIndex: number;
  totalScenes: number;
  status?: 'pending' | 'generating_image' | 'image_ready' | 'generating_video' | 'video_ready' | 'completed';
  isSelected?: boolean;
  onClick?: () => void;
}

export default function SceneCard({
  scene,
  sceneIndex,
  totalScenes,
  status = 'pending',
  isSelected = false,
  onClick,
}: SceneCardProps) {
  const {
    project,
    scenes,
    mediaDrawer,
    setCurrentSceneIndex,
    setViewMode,
    setSceneStatus,
    addGeneratedImage,
    selectImage,
    setVideoPath,
    addChatMessage,
    sceneErrors,
    retrySceneGeneration,
    clearSceneError,
    duplicateScene,
    moveScene,
  } = useProjectStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const sceneError = sceneErrors[sceneIndex];
  const [isVisible, setIsVisible] = useState(
    sceneIndex < SCENE_CONSTANTS.INITIAL_VISIBLE_CARDS
  );
  const cardRef = useRef<HTMLDivElement>(null);
  const imageGenerationRequestIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Intersection observer for lazy loading thumbnail
  useEffect(() => {
    // Skip if already visible
    if (isVisible || !cardRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      {
        root: null,
        rootMargin: SCENE_CONSTANTS.LAZY_LOAD_MARGIN,
        threshold: SCENE_CONSTANTS.LAZY_LOAD_THRESHOLD,
      }
    );

    const currentRef = cardRef.current;
    observer.observe(currentRef);

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
      observer.disconnect();
    };
  }, [isVisible]);

  // Cleanup image generation on unmount
  useEffect(() => {
    return () => {
      // Cancel any ongoing image generation when component unmounts
      if (abortControllerRef.current) {
        console.log(`[SceneCard] Scene ${sceneIndex}: Cancelling image generation on unmount`);
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      imageGenerationRequestIdRef.current = null;
    };
  }, [sceneIndex]);

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      setCurrentSceneIndex(sceneIndex);
      setViewMode('images');
    }
  };

  // Get seed frame from previous scene
  const getSeedFrameUrl = (): string | undefined => {
    if (sceneIndex === 0 || !project) return undefined;
    const previousScene = scenes[sceneIndex - 1];
    if (
      previousScene?.selectedSeedFrameIndex !== undefined &&
      previousScene.seedFrames &&
      previousScene.seedFrames.length > previousScene.selectedSeedFrameIndex
    ) {
      const selectedFrame = previousScene.seedFrames[previousScene.selectedSeedFrameIndex];
      return formatImageUrl(selectedFrame);
    }
    return undefined;
  };

  const getProductReferenceImage = (): string | undefined => {
    if (!project) return undefined;
    // For Scene 0, no reference needed
    if (sceneIndex === 0) return undefined;
    
    // Use Scene 0's first generated image as the product reference
    if (scenes[0]?.generatedImages?.length > 0) {
      const firstSceneImage = scenes[0].generatedImages[0];
      if (firstSceneImage?.url) {
        return firstSceneImage.url;
      }
    }
    
    return undefined;
  };

  const getReferenceImageUrls = (): string[] => {
    if (!project) return [];
    const referenceUrls: string[] = [];
    
    // Use the first scene's generated image as the primary reference for product consistency
    if (sceneIndex > 0 && scenes[0]?.generatedImages?.length > 0) {
      const firstSceneImage = scenes[0].generatedImages[0];
      if (firstSceneImage?.url) {
        referenceUrls.push(firstSceneImage.url);
      }
    }
    
    // Also include the previous scene's selected image if available (for visual continuity)
    if (sceneIndex > 0) {
      const previousScene = scenes[sceneIndex - 1];
      if (previousScene?.selectedImageId) {
        const previousImage = previousScene.generatedImages?.find(
          img => img.id === previousScene.selectedImageId
        );
        if (previousImage?.url && !referenceUrls.includes(previousImage.url)) {
          referenceUrls.push(previousImage.url);
        }
      }
    }
    
    return referenceUrls;
  };

  const handleGenerateImage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!project) return;

    // Prevent race conditions: Cancel any existing image generation requests
    if (isGenerating) {
      console.log(`[SceneCard] Scene ${sceneIndex}: Cancelling previous image generation request`);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }

    // Generate unique request ID to track this generation
    const requestId = `scene${sceneIndex}-img-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    imageGenerationRequestIdRef.current = requestId;
    console.log(`[SceneCard] Scene ${sceneIndex}: Starting image generation: ${requestId}`);

    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsGenerating(true);
    try {
      setSceneStatus(sceneIndex, 'generating_image');
      addChatMessage({
        role: 'agent',
        content: `Generating image for Scene ${sceneIndex + 1}/${totalScenes}...`,
        type: 'status',
      });

      // Get reference images from scene composition box (referenceImageId) or project (uploaded images for object consistency)
      // IMPORTANT: When using seed frame (last frame), do NOT include reference images
      let referenceImageUrls: string[] = [];

      // Build search context for image lookups
      const searchContext: ImageSearchContext = {
        uploadedImages: project.uploadedImages,
        scenes,
      };

      // Check if we're using seed frame (last frame) mode
      const usingSeedFrame = sceneIndex > 0 && scene.useSeedFrame === true;

      console.log(`[SceneCard] Scene ${sceneIndex + 1}: Checking reference images:`, {
        usingSeedFrame,
        hasReferenceImageUrls: !!scene.referenceImageUrls,
        refCount: scene.referenceImageUrls?.length || 0,
        refs: scene.referenceImageUrls
      });

      // Always add reference images for IP-Adapter consistency, regardless of seed frame mode
      // Seed frame (last frame from previous video) and reference images (for style consistency) are independent

      // Priority 1: Use AI-selected per-scene reference images if available
      if (scene.referenceImageUrls && scene.referenceImageUrls.length > 0) {
        referenceImageUrls = scene.referenceImageUrls.slice(0, SCENE_CONSTANTS.MAX_REFERENCE_IMAGES);
        console.log(
          `[SceneCard] Scene ${sceneIndex + 1}: Using ${referenceImageUrls.length} AI-selected per-scene reference image(s):`, referenceImageUrls
        );
      } else {
        console.warn(`[SceneCard] Scene ${sceneIndex + 1}: No AI-selected reference images found!`);
      }

      // Priority 2: Use reference image from scene composition box if available (only if Priority 1 failed)
      if (scene.referenceImageId && referenceImageUrls.length === 0) {
        const referenceImageUrl = findImageUrlById(scene.referenceImageId, searchContext);

        if (referenceImageUrl) {
          referenceImageUrls = [referenceImageUrl];
          console.log(
            `[SceneCard] Scene ${sceneIndex}: Using reference image from composition box:`,
            referenceImageUrl.substring(0, 80) + '...'
          );
        } else {
          console.warn(
            `[SceneCard] Scene ${sceneIndex}: Reference image ID "${scene.referenceImageId}" not found`
          );
        }
      }
      // No project-level fallback - scenes should only use their own AI-selected references

      // Get seed frame from previous scene (for Scenes 1-4, to use as seed image for image-to-image generation)
      let seedImageUrl: string | undefined = undefined;
      let seedFrameUrl: string | undefined = undefined;

      // Priority: Custom image input > Media drawer seed image > seed frame > reference image
      // Handle custom image inputs (can be single string or array)
      const customImageInputs = scene.customImageInput
        ? (Array.isArray(scene.customImageInput) ? scene.customImageInput : [scene.customImageInput])
        : [];

      if (customImageInputs.length > 0) {
        // Validate and format custom image URLs
        const validatedCustomImages = validateCustomImageUrls(customImageInputs);

        if (validatedCustomImages.length === 0) {
          console.error(`[SceneCard] No valid custom images found after validation`);
        } else {
          // Use first custom image as seed image (for image-to-image)
          seedImageUrl = validatedCustomImages[0];
          console.log(
            `[SceneCard] Scene ${sceneIndex}: Using custom image input as seed image:`,
            seedImageUrl.substring(0, 80) + '...'
          );

          // Add all custom images to reference images for IP-Adapter (limit to max)
          referenceImageUrls = [...validatedCustomImages, ...referenceImageUrls].slice(
            0,
            SCENE_CONSTANTS.MAX_REFERENCE_IMAGES
          );
          console.log(
            `[SceneCard] Scene ${sceneIndex}: Using ${referenceImageUrls.length} total reference image(s) via IP-Adapter`
          );
        }
      } else if (mediaDrawer.seedImageId) {
        // Check if a seed image is selected in the media drawer (purple selection)
        console.log(
          `[SceneCard] Scene ${sceneIndex}: Attempting to use media drawer seed image ID:`,
          mediaDrawer.seedImageId
        );
        console.log(
          `[SceneCard] Scene ${sceneIndex}: Search context has ${project.uploadedImages?.length || 0} uploaded images`
        );

        const foundSeedImageUrl = findImageUrlById(mediaDrawer.seedImageId, searchContext);

        if (foundSeedImageUrl) {
          seedImageUrl = foundSeedImageUrl;
          console.log(
            `[SceneCard] Scene ${sceneIndex}: ✓ Using media drawer seed image for i2i:`,
            seedImageUrl.substring(0, 80) + '...'
          );
        } else {
          console.warn(
            `[SceneCard] Scene ${sceneIndex}: ✗ Media drawer seed image ID "${mediaDrawer.seedImageId}" not found in search context`
          );
          console.warn(
            `[SceneCard] Scene ${sceneIndex}: Available uploaded image IDs:`,
            project.uploadedImages?.map(img => `${img.id} (${img.originalName})`)
          );
          console.warn(
            `[SceneCard] Scene ${sceneIndex}: Available uploaded image IDs with processed versions:`,
            project.uploadedImages?.flatMap(img => [
              img.id,
              ...(img.processedVersions?.map(p => p.id) || [])
            ])
          );
        }
      } else if (sceneIndex > 0) {
        // Only use seed frame if explicitly enabled via checkbox
        const useSeedFrame = scene.useSeedFrame === true;
        if (useSeedFrame) {
          const previousScene = scenes[sceneIndex - 1];
          if (previousScene?.seedFrames && previousScene.seedFrames.length > 0) {
            // Use selected seed frame, or default to first frame if none selected
            const selectedIndex = previousScene.selectedSeedFrameIndex ?? 0;

            // Validate index is within bounds
            if (selectedIndex >= 0 && selectedIndex < previousScene.seedFrames.length) {
              const selectedFrame = previousScene.seedFrames[selectedIndex];

              // Format the seed frame URL using helper
              seedFrameUrl = formatImageUrl(selectedFrame);

              // Use the seed frame as the seed image for image-to-image generation
              seedImageUrl = seedFrameUrl;
              console.log(
                `[SceneCard] Scene ${sceneIndex}: Using seed frame as seed image for image-to-image generation:`,
                seedImageUrl.substring(0, 80) + '...'
              );
            } else {
              console.warn(
                `[SceneCard] Scene ${sceneIndex}: Selected seed frame index ${selectedIndex} is out of bounds (max: ${previousScene.seedFrames.length - 1})`
              );
            }
          }
        } else {
          console.log(
            `[SceneCard] Scene ${sceneIndex}: Seed frame checkbox is disabled, not using seed frame`
          );
        }
      } else if (referenceImageUrls.length > 0) {
        // For Scene 0: Use reference image as seed image if available
        seedImageUrl = referenceImageUrls[0];
        console.log(
          `[SceneCard] Scene ${sceneIndex}: Using reference image as seed image:`,
          seedImageUrl.substring(0, 80) + '...'
        );
      }

      // Get prompt adjustment mode from runtime config
      const { getRuntimeConfig } = await import('@/lib/config/model-runtime');
      const runtimeConfig = getRuntimeConfig();
      const promptAdjustmentMode = runtimeConfig.promptAdjustmentMode || 'scene-specific';

      // Helper to check if error is retryable (Replicate transient errors)
      const isRetryableError = (error: Error): boolean => {
        const msg = error.message.toLowerCase();
        return msg.includes('director') ||
               msg.includes('e6716') ||
               msg.includes('unexpected error') ||
               msg.includes('temporary server') ||
               msg.includes('internal server error');
      };

      // Generate 1 image (storyboard page generates 1, editor page generates 5)
      const request: ImageGenerationRequest = {
        prompt: scene.imagePrompt,
        projectId: project.id,
        sceneIndex,
        seedImage: seedImageUrl, // Custom image input, seed frame from previous scene, or reference image for Scene 0
        referenceImageUrls, // Reference images via IP-Adapter (for object consistency)
        seedFrame: seedFrameUrl, // Seed frame URL (same as seedImage for scenes 1-4, unless custom image input is used)
        negativePrompt: scene.negativePrompt, // Optional negative prompt
        promptAdjustmentMode, // Prompt adjustment mode from runtime config
      };

      // Check if request was cancelled before API call
      if (abortController.signal.aborted) {
        console.log(`[SceneCard] Scene ${sceneIndex}: Image generation cancelled (before API call)`);
        return;
      }

      const MAX_RETRIES = 2;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`[SceneCard] Retrying image generation for Scene ${sceneIndex + 1} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
            addChatMessage({
              role: 'agent',
              content: `Retrying image generation for Scene ${sceneIndex + 1}...`,
              type: 'status',
            });
            // Brief delay before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          const response = await generateImage(request);

          // Check if this request was cancelled or superseded
          if (abortController.signal.aborted || imageGenerationRequestIdRef.current !== requestId) {
            console.log(`[SceneCard] Scene ${sceneIndex}: Image generation cancelled (after API call, current: ${imageGenerationRequestIdRef.current}, this: ${requestId})`);
            return;
          }

          if (!response.success || !response.predictionId) {
            throw new Error(response.error || 'Failed to start image generation');
          }

          const status = await pollImageStatus(response.predictionId, {
            interval: SCENE_CONSTANTS.IMAGE_POLL_INTERVAL,
            timeout: SCENE_CONSTANTS.IMAGE_GENERATION_TIMEOUT,
            projectId: project.id,
            sceneIndex,
            prompt: scene.imagePrompt,
          });

          // Final check before updating state with results
          if (abortController.signal.aborted || imageGenerationRequestIdRef.current !== requestId) {
            console.log(`[SceneCard] Scene ${sceneIndex}: Image generation cancelled (after polling, current: ${imageGenerationRequestIdRef.current}, this: ${requestId})`);
            return;
          }

          if (status.success && status.image) {
            addGeneratedImage(sceneIndex, status.image);
            if (!scenes[sceneIndex]?.selectedImageId) {
              selectImage(sceneIndex, status.image.id);
            }
            addChatMessage({
              role: 'agent',
              content: `✓ Image generated for Scene ${sceneIndex + 1}`,
              type: 'status',
            });
            console.log(`[SceneCard] Scene ${sceneIndex}: Image generation ${requestId} completed successfully`);
            // Success - exit retry loop
            return;
          } else {
            throw new Error(status.error || 'Image generation failed');
          }
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));

          // Check if we should retry
          if (attempt < MAX_RETRIES && isRetryableError(lastError)) {
            console.warn(`[SceneCard] Retryable error for Scene ${sceneIndex + 1}: ${lastError.message}`);
            continue; // Try again
          }

          // No more retries or non-retryable error - break out to error handling
          break;
        }
      }

      // If we get here, all retries failed
      const errorMessage = lastError?.message || 'Failed to generate image';
      setSceneStatus(sceneIndex, 'pending');
      addChatMessage({
        role: 'agent',
        content: `❌ Error: ${errorMessage}`,
        type: 'error',
      });
    } catch (err) {
      // Don't log errors for aborted requests
      if (abortController.signal.aborted || imageGenerationRequestIdRef.current !== requestId) {
        console.log(`[SceneCard] Scene ${sceneIndex}: Image generation aborted`);
        return;
      }

      const errorMessage = err instanceof Error ? err.message : 'Failed to generate image';
      setSceneStatus(sceneIndex, 'pending');
      addChatMessage({
        role: 'agent',
        content: `❌ Error: ${errorMessage}`,
        type: 'error',
      });
    } finally {
      // Only clear loading state if this is still the current request
      if (imageGenerationRequestIdRef.current === requestId) {
        setIsGenerating(false);
        abortControllerRef.current = null;
      }
    }
  };

  const handleDuplicateScene = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!project || isGenerating) return;

    setIsGenerating(true);
    try {
      addChatMessage({
        role: 'agent',
        content: `Duplicating Scene ${sceneIndex + 1}...`,
        type: 'status',
      });

      await duplicateScene(sceneIndex);

      addChatMessage({
        role: 'agent',
        content: `✓ Scene ${sceneIndex + 1} duplicated successfully`,
        type: 'status',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to duplicate scene';
      addChatMessage({
        role: 'agent',
        content: `❌ Error: ${errorMessage}`,
        type: 'error',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleMoveScene = (e: React.MouseEvent, direction: 'up' | 'down') => {
    e.stopPropagation();
    if (!project || isGenerating) return;

    try {
      moveScene(sceneIndex, direction);
      addChatMessage({
        role: 'agent',
        content: `✓ Scene ${sceneIndex + 1} moved ${direction}`,
        type: 'status',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to move scene';
      addChatMessage({
        role: 'agent',
        content: `❌ Error: ${errorMessage}`,
        type: 'error',
      });
    }
  };

  const handleGenerateVideo = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!project || isGenerating) return;

    const sceneState = scenes[sceneIndex];
    const selectedImage = sceneState?.selectedImageId
      ? sceneState.generatedImages?.find(img => img.id === sceneState.selectedImageId)
      : sceneState?.generatedImages?.[0];

    if (!selectedImage) {
      addChatMessage({
        role: 'agent',
        content: `Please generate an image for Scene ${sceneIndex + 1} first`,
        type: 'error',
      });
      return;
    }

    setIsGenerating(true);
    try {
      setSceneStatus(sceneIndex, 'generating_video');
      addChatMessage({
        role: 'agent',
        content: `Generating video for Scene ${sceneIndex + 1}/${totalScenes}...`,
        type: 'status',
      });

      // Get the seed frame URL if this is not Scene 0
      const seedFrameUrl = getSeedFrameUrl();

      // Use seed frame as base image if available (for continuity), otherwise use selected generated image
      const baseImageUrl = seedFrameUrl || formatImageUrl(selectedImage);

      console.log(
        `[SceneCard] Scene ${sceneIndex}: Using ${seedFrameUrl ? 'seed frame' : 'generated image'} as base image for video:`,
        baseImageUrl.substring(0, 80) + '...'
      );

      // Get reference images for video consistency
      const referenceImageUrls = getReferenceImageUrls();

      const response = await generateVideo(
        baseImageUrl,
        scene.videoPrompt || scene.imagePrompt, // Fallback to imagePrompt for backward compatibility
        project.id,
        sceneIndex,
        seedFrameUrl,
        scene.suggestedDuration, // Pass scene duration to video generation
        undefined, // subsceneIndex (not used in this workflow)
        scene.modelParameters, // Pass model-specific parameters from scene
        referenceImageUrls // Pass reference images for consistency
      );

      if (!response.predictionId) {
        throw new Error('Failed to start video generation');
      }

      const status = await pollVideoStatus(response.predictionId, {
        interval: SCENE_CONSTANTS.VIDEO_POLL_INTERVAL,
        timeout: SCENE_CONSTANTS.VIDEO_GENERATION_TIMEOUT,
      });

      if (status.status === 'succeeded' && status.videoPath) {
        setVideoPath(sceneIndex, status.videoPath);
        addChatMessage({
          role: 'agent',
          content: `✓ Video generated for Scene ${sceneIndex + 1}`,
          type: 'status',
        });
      } else {
        throw new Error(status.error || 'Video generation failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate video';
      setSceneStatus(sceneIndex, 'image_ready');
      addChatMessage({
        role: 'agent',
        content: `❌ Error: ${errorMessage}`,
        type: 'error',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-white/10 text-white/90 rounded-full border border-white/20">
            <CheckCircle2 className="w-3 h-3" />
          </span>
        );
      case 'video_ready':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-white/10 text-white/90 rounded-full border border-white/20">
            <Video className="w-3 h-3" />
          </span>
        );
      case 'image_ready':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-white/10 text-white/90 rounded-full border border-white/20">
            <ImageIcon className="w-3 h-3" />
          </span>
        );
      case 'generating_video':
      case 'generating_image':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-white/10 text-white/80 rounded-full border border-white/20">
            <Loader2 className="w-3 h-3 animate-spin" />
          </span>
        );
      default:
        return null; // No badge for pending state to save space
    }
  };

  return (
    <div
      ref={cardRef}
      onClick={handleClick}
      className={`relative p-3 rounded-lg border-2 cursor-pointer transition-all duration-200 group animate-fade-in ${
        isSelected
          ? 'border-white/40 bg-white/10 shadow-md ring-2 ring-white/20'
          : 'border-white/20 bg-white/5 hover:border-white/30 hover:shadow-md hover:scale-[1.02] active:scale-[0.98]'
      }`}
    >
      {/* Compact Header: Number, Title, Duration, Status */}
      <div className="flex items-center gap-2 mb-2">
        <div className="relative flex-shrink-0">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-white/10 text-sm font-semibold text-white/90 border border-white/20">
            {formatSceneNumber(scene.order)}
          </span>
          {/* Duplicate button - appears on hover */}
          <button
            onClick={handleDuplicateScene}
            disabled={isGenerating}
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white/20 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-white/30 disabled:opacity-50 transition-all border border-white/20 shadow-sm"
            title="Duplicate scene"
          >
            <Copy className="w-3 h-3" />
          </button>
        </div>
        <h3 className="text-sm font-medium text-white flex-1 truncate">
          {scene.description.charAt(0).toUpperCase() + scene.description.slice(1)}
        </h3>
        <span className="text-xs text-white/50 flex-shrink-0">
          {scene.suggestedDuration}s
        </span>
        {getStatusBadge()}
      </div>

      {/* Image Prompt Preview */}
      <p className="text-xs text-white/50 line-clamp-2">
        {scene.imagePrompt}
      </p>

      {/* Error Display with Retry (compact) */}
      {sceneError && (
        <div className="mt-2 p-1.5 bg-white/5 border border-white/20 rounded">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-white/80 flex-shrink-0" />
            <p className="text-xs text-white/70 flex-1 truncate">{sceneError.message}</p>
            {sceneError.retryable && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await retrySceneGeneration(sceneIndex);
                  } catch (err) {
                    // Error already handled by store
                  }
                }}
                disabled={isGenerating}
                className="text-[10px] text-white/60 hover:text-white/80 underline disabled:opacity-50"
              >
                Retry
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearSceneError(sceneIndex);
              }}
              className="text-white/50 hover:text-white/80 text-sm"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Quick Action Buttons - Only show video generation when image is ready */}
      {status === 'image_ready' && !sceneError && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handleGenerateVideo}
            disabled={isGenerating}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium bg-white/20 text-white rounded hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-white/20"
          >
            {isGenerating ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Video className="w-3 h-3" />
            )}
            Generate Video
          </button>
        </div>
      )}
      
      {/* Scene Reorder Buttons - Bottom Center */}
      <div className="mt-2 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={(e) => handleMoveScene(e, 'up')}
          disabled={isGenerating || sceneIndex === 0}
          className="w-6 h-6 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-white/20 shadow-sm"
          title="Move scene left"
        >
          <ArrowLeft className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => handleMoveScene(e, 'down')}
          disabled={isGenerating || sceneIndex === totalScenes - 1}
          className="w-6 h-6 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-white/20 shadow-sm"
          title="Move scene right"
        >
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      
      {/* Thumbnail Preview */}
      {(() => {
        const sceneState = scenes[sceneIndex];
        const hasImages = sceneState?.generatedImages && sceneState.generatedImages.length > 0;

        if (!hasImages) {
          console.log(`[SceneCard ${sceneIndex}] No images:`, { sceneState, hasSceneState: !!sceneState, imageCount: sceneState?.generatedImages?.length });
          return null;
        }

        const firstImage = sceneState.generatedImages[0];
        console.log(`[SceneCard ${sceneIndex}] First image object:`, { id: firstImage.id, url: firstImage.url?.substring(0, 80), localPath: firstImage.localPath?.substring(0, 80), s3Key: firstImage.s3Key?.substring(0, 80) });
        
        const imageUrl = formatImageUrl(firstImage);
        console.log(`[SceneCard ${sceneIndex}] Formatted image URL:`, imageUrl);

        // Don't render if formatImageUrl returned empty string
        if (!imageUrl) {
          console.error(`[SceneCard ${sceneIndex}] formatImageUrl returned empty string for image:`, firstImage);
          return null;
        }

        return (
          <div className="mt-2 rounded overflow-hidden border border-white/20">
            {isVisible ? (
              <img
                src={imageUrl}
                alt={`Scene ${sceneIndex + 1} preview`}
                className="w-full aspect-video object-cover"
                loading="lazy"
                onError={(e) => {
                  console.error(`[SceneCard ${sceneIndex}] Image failed to load:`, imageUrl);
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <div className="w-full aspect-video bg-white/5 flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              </div>
            )}
          </div>
        );
      })()}

      {/* Hover Effect Indicator */}
      <div className="absolute inset-0 rounded-lg border-2 border-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

