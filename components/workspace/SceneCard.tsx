'use client';

import { Scene } from '@/lib/types';
import { CheckCircle2, Clock, Loader2, AlertCircle, Image as ImageIcon, Video } from 'lucide-react';
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
      setViewMode('editor');
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

      // For product consistency: use Scene 0's image as seed for all subsequent scenes
      const productReferenceImage = getProductReferenceImage();
      const seedFrameUrl = productReferenceImage || getSeedFrameUrl();
      const referenceImageUrls = getReferenceImageUrls();
      const request: ImageGenerationRequest = {
        prompt: scene.imagePrompt,
        projectId: project.id,
        sceneIndex,
        seedImage: seedFrameUrl, // Use product reference image for consistency
        referenceImageUrls,
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

      const seedFrameUrl = getSeedFrameUrl();
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
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-white/10 text-white/90 rounded-full animate-success border border-white/20">
            <CheckCircle2 className="w-3 h-3" />
            Completed
          </span>
        );
      case 'video_ready':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-white/10 text-white/90 rounded-full border border-white/20">
            <CheckCircle2 className="w-3 h-3" />
            Video Ready
          </span>
        );
      case 'image_ready':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-white/10 text-white/90 rounded-full border border-white/20">
            <CheckCircle2 className="w-3 h-3" />
            Image Ready
          </span>
        );
      case 'generating_video':
      case 'generating_image':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-white/10 text-white/80 rounded-full border border-white/20">
            <Loader2 className="w-3 h-3 animate-spin" />
            Generating...
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-white/5 text-white/60 rounded-full border border-white/20">
            Pending
          </span>
        );
    }
  };

  return (
    <div
      ref={cardRef}
      onClick={handleClick}
      className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 group animate-fade-in ${
        isSelected
          ? 'border-white/40 bg-white/10 shadow-md ring-2 ring-white/20'
          : 'border-white/20 bg-white/5 hover:border-white/30 hover:shadow-md hover:scale-[1.02] active:scale-[0.98]'
      }`}
    >
      {/* Scene Number Badge */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 text-sm font-semibold text-white/90 border border-white/20">
            {sceneIndex + 1}
          </span>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-white/60" />
            <span className="text-xs text-white/60">
              {scene.suggestedDuration}s
            </span>
          </div>
        </div>
        {getStatusBadge()}
      </div>

      {/* Description */}
      <h3 className="text-sm font-medium text-white mb-2 line-clamp-2">
        {scene.description}
      </h3>

      {/* Image Prompt Preview */}
      <p className="text-xs text-white/60 line-clamp-3">
        {scene.imagePrompt}
      </p>

      {/* Error Display with Retry */}
      {sceneError && (
        <div className="mt-3 p-2 bg-white/5 border border-white/20 rounded-md">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-white/80 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-white/80">{sceneError.message}</p>
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
                  className="mt-1 text-xs text-white/60 hover:text-white/80 underline disabled:opacity-50"
                >
                  Retry
                </button>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearSceneError(sceneIndex);
              }}
              className="text-white/60 hover:text-white/80"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Quick Action Buttons */}
      <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
        {status === 'pending' && !sceneError && (
          <button
            onClick={handleGenerateImage}
            disabled={isGenerating}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium bg-white/20 text-white rounded-md hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-white/20"
          >
            {isGenerating ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <ImageIcon className="w-3 h-3" />
            )}
            Generate Image
          </button>
        )}
        {status === 'image_ready' && !sceneError && (
          <button
            onClick={handleGenerateVideo}
            disabled={isGenerating}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium bg-white/20 text-white rounded-md hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-white/20"
          >
            {isGenerating ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Video className="w-3 h-3" />
            )}
            Generate Video
          </button>
        )}
      </div>
      
      {/* Thumbnail Preview (Phase 9.1.1) */}
      {scenes[sceneIndex]?.generatedImages?.[0] && (
        <div className="mt-3 rounded-md overflow-hidden border border-white/20">
          {isVisible ? (
            <img
              src={scenes[sceneIndex].generatedImages[0].url}
              alt={`Scene ${sceneIndex + 1} preview`}
              className="w-full aspect-video object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full aspect-video bg-white/5 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </div>
      )}

      {/* Hover Effect Indicator */}
      <div className="absolute inset-0 rounded-lg border-2 border-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

