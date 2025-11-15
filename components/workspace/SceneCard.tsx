'use client';

import { Scene } from '@/lib/types';
import { CheckCircle2, Clock, Loader2, AlertCircle, Image as ImageIcon, Video } from 'lucide-react';
import { useProjectStore } from '@/lib/state/project-store';
import { generateImage, pollImageStatus, generateVideo, pollVideoStatus } from '@/lib/api-client';
import { ImageGenerationRequest } from '@/lib/types';
import { useState } from 'react';

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
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full animate-success">
            <CheckCircle2 className="w-3 h-3" />
            Completed
          </span>
        );
      case 'video_ready':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full">
            <CheckCircle2 className="w-3 h-3" />
            Video Ready
          </span>
        );
      case 'image_ready':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-full">
            <CheckCircle2 className="w-3 h-3" />
            Image Ready
          </span>
        );
      case 'generating_video':
      case 'generating_image':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full">
            <Loader2 className="w-3 h-3 animate-spin" />
            Generating...
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full">
            Pending
          </span>
        );
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 group animate-fade-in ${
        isSelected
          ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20 shadow-md ring-2 ring-blue-200 dark:ring-blue-800'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md hover:scale-[1.02] active:scale-[0.98]'
      }`}
    >
      {/* Scene Number Badge */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300">
            {sceneIndex + 1}
          </span>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {scene.suggestedDuration}s
            </span>
          </div>
        </div>
        {getStatusBadge()}
      </div>

      {/* Description */}
      <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2 line-clamp-2">
        {scene.description}
      </h3>

      {/* Image Prompt Preview */}
      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3">
        {scene.imagePrompt}
      </p>

      {/* Error Display with Retry */}
      {sceneError && (
        <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-red-700 dark:text-red-400">{sceneError.message}</p>
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
                  className="mt-1 text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline disabled:opacity-50"
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
              className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
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
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium bg-purple-500 text-white rounded-md hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
        <div className="mt-3 rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
          <img
            src={scenes[sceneIndex].generatedImages[0].url}
            alt={`Scene ${sceneIndex + 1} preview`}
            className="w-full aspect-video object-cover"
            loading="lazy"
          />
        </div>
      )}

      {/* Hover Effect Indicator */}
      <div className="absolute inset-0 rounded-lg border-2 border-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

