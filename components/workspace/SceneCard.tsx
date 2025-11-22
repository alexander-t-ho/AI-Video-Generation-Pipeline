'use client';

import { Scene } from '@/lib/types';
import { CheckCircle2, Loader2, AlertCircle, Image as ImageIcon, Video } from 'lucide-react';
import { useProjectStore } from '@/lib/state/project-store';
import { generateImage, pollImageStatus, generateVideo, pollVideoStatus } from '@/lib/api-client';
import { ImageGenerationRequest } from '@/lib/types';
import { useState, useEffect, useRef } from 'react';

interface SceneCardProps {
  scene: Scene;
  sceneIndex: number;
  status?: 'pending' | 'generating_image' | 'image_ready' | 'generating_video' | 'video_ready' | 'completed';
  isSelected?: boolean;
  onClick?: () => void;
}

export default function SceneCard({
  scene,
  sceneIndex,
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
    clearSceneError
  } = useProjectStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const sceneError = sceneErrors[sceneIndex];
  const [isVisible, setIsVisible] = useState(sceneIndex < 3); // First 3 cards visible by default
  const cardRef = useRef<HTMLDivElement>(null);

  // Intersection observer for lazy loading thumbnail
  useEffect(() => {
    // Skip if already visible
    if (isVisible || !cardRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); // Stop observing once visible
        }
      },
      {
        root: null,
        rootMargin: '50px', // Load 50px before card enters viewport
        threshold: 0.01,
      }
    );

    observer.observe(cardRef.current);

    return () => {
      observer.disconnect();
    };
  }, [isVisible]);

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
    if (previousScene?.selectedSeedFrameIndex !== undefined && previousScene.seedFrames) {
      const selectedFrame = previousScene.seedFrames[previousScene.selectedSeedFrameIndex];
      return selectedFrame?.url;
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
    if (!project || isGenerating) return;

    setIsGenerating(true);
    try {
      setSceneStatus(sceneIndex, 'generating_image');
      addChatMessage({
        role: 'agent',
        content: `Generating image for Scene ${sceneIndex + 1}/5...`,
        type: 'status',
      });

      // Get reference images from project (uploaded images for object consistency) - limit to 3
      let referenceImageUrls = (project.referenceImageUrls || []).slice(0, 3);

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
        const validatedCustomImages: string[] = [];
        for (const url of customImageInputs) {
          if (!url || typeof url !== 'string') {
            console.warn(`[SceneCard] Invalid custom image URL: ${url}`);
            continue;
          }
          
          // Convert local paths to serveable URLs
          let formattedUrl = url;
          if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://') && !formattedUrl.startsWith('/api')) {
            formattedUrl = `/api/serve-image?path=${encodeURIComponent(url)}`;
          }
          validatedCustomImages.push(formattedUrl);
        }
        
        if (validatedCustomImages.length === 0) {
          console.error(`[SceneCard] No valid custom images found after validation`);
        } else {
          // Use first custom image as seed image (for image-to-image)
          seedImageUrl = validatedCustomImages[0];
          console.log(`[SceneCard] Scene ${sceneIndex}: Using custom image input as seed image:`, seedImageUrl.substring(0, 80) + '...');
          
          // Add all custom images to reference images for IP-Adapter (limit to 3 total)
          referenceImageUrls = [...validatedCustomImages, ...referenceImageUrls].slice(0, 3);
          console.log(`[SceneCard] Scene ${sceneIndex}: Using ${Math.min(validatedCustomImages.length, 3)} custom image(s) as reference images via IP-Adapter`);
        }
      } else if (mediaDrawer.seedImageId) {
        // Check if a seed image is selected in the media drawer (purple selection)
        // Search for the seed image across all media sources
        let foundSeedImage: any = null;

        // Check generated images
        for (const scn of scenes) {
          const foundImg = scn.generatedImages?.find((img: any) => img.id === mediaDrawer.seedImageId);
          if (foundImg) {
            foundSeedImage = foundImg;
            break;
          }
          const foundFrame = scn.seedFrames?.find((frame: any) => frame.id === mediaDrawer.seedImageId);
          if (foundFrame) {
            foundSeedImage = foundFrame;
            break;
          }
        }

        // Check uploaded images
        if (!foundSeedImage && project.uploadedImages) {
          const foundUpload = project.uploadedImages.find((img: any) => img.id === mediaDrawer.seedImageId);
          if (foundUpload) {
            foundSeedImage = foundUpload;
          }
          // Also check processed versions
          if (!foundSeedImage) {
            for (const uploadedImage of project.uploadedImages) {
              const foundProcessed = uploadedImage.processedVersions?.find((pv: any) => pv.id === mediaDrawer.seedImageId);
              if (foundProcessed) {
                foundSeedImage = foundProcessed;
                break;
              }
            }
          }
        }

        if (foundSeedImage) {
          // Convert to serveable URL
          let imageUrl = foundSeedImage.url;
          if (foundSeedImage.localPath) {
            imageUrl = foundSeedImage.localPath;
          }

          // Format URL
          if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://') && !imageUrl.startsWith('/api')) {
            imageUrl = `/api/serve-image?path=${encodeURIComponent(imageUrl)}`;
          }

          seedImageUrl = imageUrl;
          console.log(`[SceneCard] Scene ${sceneIndex}: Using media drawer seed image for i2i:`, seedImageUrl?.substring(0, 80) + '...');
        }
      } else if (sceneIndex > 0) {
        // Only use seed frame if explicitly enabled via checkbox
        const useSeedFrame = scene.useSeedFrame === true;
        if (useSeedFrame) {
          const previousScene = scenes[sceneIndex - 1];
          if (previousScene?.seedFrames && previousScene.seedFrames.length > 0) {
            // Use selected seed frame, or default to first frame if none selected
            const selectedIndex = previousScene.selectedSeedFrameIndex ?? 0;
            const selectedFrame = previousScene.seedFrames[selectedIndex];

            // Ensure the seed frame URL is a public URL (S3 or serveable)
            if (selectedFrame?.url) {
              const frameUrl = selectedFrame.url;
              // If it's a local path, convert to serveable URL
              if (!frameUrl.startsWith('http://') && !frameUrl.startsWith('https://') && !frameUrl.startsWith('/api')) {
                seedFrameUrl = `/api/serve-image?path=${encodeURIComponent(selectedFrame.localPath || frameUrl)}`;
              } else {
                seedFrameUrl = frameUrl;
              }

              // Use the seed frame as the seed image for image-to-image generation
              seedImageUrl = seedFrameUrl;
              console.log(`[SceneCard] Scene ${sceneIndex}: Using seed frame as seed image for image-to-image generation:`, seedImageUrl!.substring(0, 80) + '...');
            }
          }
        } else {
          console.log(`[SceneCard] Scene ${sceneIndex}: Seed frame checkbox is disabled, not using seed frame`);
        }
      } else if (referenceImageUrls.length > 0) {
        // For Scene 0: Use reference image as seed image if available
        seedImageUrl = referenceImageUrls[0];
        console.log(`[SceneCard] Scene ${sceneIndex}: Using reference image as seed image:`, seedImageUrl!.substring(0, 80) + '...');
      }

      // Get prompt adjustment mode from runtime config
      const { getRuntimeConfig } = await import('@/lib/config/model-runtime');
      const runtimeConfig = getRuntimeConfig();
      const promptAdjustmentMode = runtimeConfig.promptAdjustmentMode || 'scene-specific';

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

      const response = await generateImage(request);
      
      if (!response.success || !response.predictionId) {
        throw new Error(response.error || 'Failed to start image generation');
      }

      const status = await pollImageStatus(response.predictionId, {
        interval: 2000,
        timeout: 300000,
        projectId: project.id,
        sceneIndex,
        prompt: scene.imagePrompt,
      });

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
      } else {
        throw new Error(status.error || 'Image generation failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate image';
      setSceneStatus(sceneIndex, 'pending');
      addChatMessage({
        role: 'agent',
        content: `❌ Error: ${errorMessage}`,
        type: 'error',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateVideo = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!project || isGenerating) return;

    const sceneState = scenes[sceneIndex];
    const selectedImage = sceneState?.selectedImageId
      ? sceneState.generatedImages.find(img => img.id === sceneState.selectedImageId)
      : sceneState?.generatedImages[0];

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
        content: `Generating video for Scene ${sceneIndex + 1}/5...`,
        type: 'status',
      });

      // Get the seed frame URL if this is not Scene 0
      const seedFrameUrl = getSeedFrameUrl();

      // Use seed frame as base image if available (for continuity), otherwise use selected generated image
      const baseImageUrl = seedFrameUrl || (() => {
        let imgUrl = selectedImage.localPath || selectedImage.url;
        if (imgUrl.startsWith('/api') || imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
          return imgUrl;
        }
        return `/api/serve-image?path=${encodeURIComponent(imgUrl)}`;
      })();

      console.log(`[SceneCard] Scene ${sceneIndex}: Using ${seedFrameUrl ? 'seed frame' : 'generated image'} as base image for video:`, baseImageUrl.substring(0, 80) + '...');

      const response = await generateVideo(
        baseImageUrl,
        scene.videoPrompt || scene.imagePrompt, // Fallback to imagePrompt for backward compatibility
        project.id,
        sceneIndex,
        seedFrameUrl,
        scene.suggestedDuration // Pass scene duration to video generation
      );

      if (!response.predictionId) {
        throw new Error('Failed to start video generation');
      }

      const status = await pollVideoStatus(response.predictionId, {
        interval: 5000,
        timeout: 600000,
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
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-white/10 text-sm font-semibold text-white/90 border border-white/20 flex-shrink-0">
          {sceneIndex + 1}
        </span>
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
      
      {/* Thumbnail Preview */}
      {scenes[sceneIndex]?.generatedImages?.[0] && (
        <div className="mt-2 rounded overflow-hidden border border-white/20">
          {isVisible ? (
            <img
              src={scenes[sceneIndex].generatedImages[0].localPath
                ? `/api/serve-image?path=${encodeURIComponent(scenes[sceneIndex].generatedImages[0].localPath)}`
                : scenes[sceneIndex].generatedImages[0].url.startsWith('/api')
                  ? scenes[sceneIndex].generatedImages[0].url
                  : `/api/serve-image?path=${encodeURIComponent(scenes[sceneIndex].generatedImages[0].localPath || scenes[sceneIndex].generatedImages[0].url)}`
              }
              alt={`Scene ${sceneIndex + 1} preview`}
              className="w-full aspect-video object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full aspect-video bg-white/5 flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </div>
      )}

      {/* Hover Effect Indicator */}
      <div className="absolute inset-0 rounded-lg border-2 border-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

