'use client';

import { useProjectStore } from '@/lib/state/project-store';
import VideoPlayer from './VideoPlayer';
import SeedFrameSelector from './SeedFrameSelector';
import { Loader2, Image as ImageIcon, Video, CheckCircle2, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { generateImage, pollImageStatus, generateVideo, pollVideoStatus, extractFrames } from '@/lib/api-client';
import { ImageGenerationRequest } from '@/lib/types';

export default function EditorView() {
  const { 
    project, 
    currentSceneIndex, 
    scenes,
    setSceneStatus,
    addGeneratedImage,
    selectImage,
    setVideoPath,
    setSeedFrames,
    selectSeedFrame,
    addChatMessage,
    setCurrentSceneIndex
  } = useProjectStore();
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [isExtractingFrames, setIsExtractingFrames] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regeneratePrompt, setRegeneratePrompt] = useState<string>('');

  if (!project || !project.storyboard || project.storyboard.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <p className="text-sm">No scene selected. Choose a scene from the storyboard.</p>
      </div>
    );
  }

  const currentScene = project.storyboard[currentSceneIndex];
  if (!currentScene) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <p className="text-sm">Scene not found.</p>
      </div>
    );
  }

  // Get actual scene state with images, videos, and seed frames
  const sceneState = scenes[currentSceneIndex];
  const sceneHasImage = sceneState?.generatedImages && sceneState.generatedImages.length > 0;
  const selectedImage = sceneState?.selectedImageId 
    ? sceneState.generatedImages.find(img => img.id === sceneState.selectedImageId)
    : sceneState?.generatedImages[0];
  const sceneHasVideo = !!sceneState?.videoLocalPath;
  const seedFrames = sceneState?.seedFrames || [];

  // Get seed frame from previous scene (for scenes 1-4)
  const getSeedFrameUrl = (): string | undefined => {
    if (currentSceneIndex === 0) return undefined;
    const previousScene = scenes[currentSceneIndex - 1];
    if (previousScene?.selectedSeedFrameIndex !== undefined && previousScene.seedFrames) {
      const selectedFrame = previousScene.seedFrames[previousScene.selectedSeedFrameIndex];
      return selectedFrame?.url;
    }
    return undefined;
  };

  const getProductReferenceImage = (): string | undefined => {
    // For Scene 0, no reference needed
    if (currentSceneIndex === 0) return undefined;
    
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
    const referenceUrls: string[] = [];
    
    // Use the first scene's generated image as the primary reference for product consistency
    if (currentSceneIndex > 0 && scenes[0]?.generatedImages?.length > 0) {
      const firstSceneImage = scenes[0].generatedImages[0];
      if (firstSceneImage?.url) {
        referenceUrls.push(firstSceneImage.url);
      }
    }
    
    // Also include the previous scene's selected image if available (for visual continuity)
    if (currentSceneIndex > 0) {
      const previousScene = scenes[currentSceneIndex - 1];
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

  const handleGenerateImage = async (customPrompt?: string) => {
    if (!project) return;
    
    setIsGeneratingImage(true);
    setError(null);
    
    try {
      // Update scene status
      setSceneStatus(currentSceneIndex, 'generating_image');
      addChatMessage({
        role: 'agent',
        content: `Generating image for Scene ${currentSceneIndex + 1}/5...`,
        type: 'status',
      });

      // For product consistency: use Scene 0's image as seed for all subsequent scenes
      const productReferenceImage = getProductReferenceImage();
      const seedFrameUrl = productReferenceImage || getSeedFrameUrl();
      const referenceImageUrls = getReferenceImageUrls();
      
      // Prepare request
      const request: ImageGenerationRequest = {
        prompt: customPrompt || currentScene.imagePrompt,
        projectId: project.id,
        sceneIndex: currentSceneIndex,
        seedImage: seedFrameUrl, // Use product reference image for consistency
        referenceImageUrls,
      };

      // Start image generation
      const response = await generateImage(request);
      
      if (!response.success || !response.predictionId) {
        throw new Error(response.error || 'Failed to start image generation');
      }

      // Poll for completion
      const status = await pollImageStatus(response.predictionId, {
        interval: 2000,
        timeout: 300000, // 5 minutes
        projectId: project.id,
        sceneIndex: currentSceneIndex,
        prompt: customPrompt || currentScene.imagePrompt,
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
        // Add generated image to store
        addGeneratedImage(currentSceneIndex, status.image);
        
        // Auto-select the first image
        if (!sceneState?.selectedImageId) {
          selectImage(currentSceneIndex, status.image.id);
        }

        addChatMessage({
          role: 'agent',
          content: `✓ Image generated for Scene ${currentSceneIndex + 1}`,
          type: 'status',
        });
      } else {
        throw new Error(status.error || 'Image generation failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate image';
      setError(errorMessage);
      setSceneStatus(currentSceneIndex, 'pending');
      addChatMessage({
        role: 'agent',
        content: `❌ Error: ${errorMessage}`,
        type: 'error',
      });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleRegenerateImage = async () => {
    // If user has entered a custom prompt, use it; otherwise use scene prompt
    const prompt = regeneratePrompt.trim() || currentScene.imagePrompt;
    await handleGenerateImage(prompt);
    setRegeneratePrompt(''); // Clear prompt after regeneration
  };

  const handleGenerateVideo = async () => {
    if (!project || !selectedImage) {
      setError('Please generate and select an image first');
      return;
    }

    setIsGeneratingVideo(true);
    setError(null);

    try {
      // Update scene status
      setSceneStatus(currentSceneIndex, 'generating_video');
      addChatMessage({
        role: 'agent',
        content: `Generating video for Scene ${currentSceneIndex + 1}/5...`,
        type: 'status',
      });

      // Get seed frame from previous scene if available
      const seedFrameUrl = getSeedFrameUrl();

      // Start video generation
      const response = await generateVideo(
        selectedImage.url,
        currentScene.imagePrompt,
        project.id,
        currentSceneIndex,
        seedFrameUrl
      );

      if (!response.predictionId) {
        throw new Error('Failed to start video generation');
      }

      // Poll for completion
      const status = await pollVideoStatus(response.predictionId, {
        interval: 5000, // Poll every 5 seconds
        timeout: 600000, // 10 minutes
        onProgress: (progress) => {
          addChatMessage({
            role: 'agent',
            content: `Video generation in progress... (${progress.status || 'processing'})`,
            type: 'status',
          });
        },
      });

      if (status.status === 'succeeded' && status.videoPath) {
        // Update scene with video path
        setVideoPath(currentSceneIndex, status.videoPath);
        
        addChatMessage({
          role: 'agent',
          content: `✓ Video generated for Scene ${currentSceneIndex + 1}. Extracting seed frames...`,
          type: 'status',
        });

        // Auto-extract frames (except for Scene 4)
        if (currentSceneIndex < 4) {
          await handleExtractFrames(status.videoPath);
        }
      } else {
        throw new Error(status.error || 'Video generation failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate video';
      setError(errorMessage);
      setSceneStatus(currentSceneIndex, 'image_ready');
      addChatMessage({
        role: 'agent',
        content: `❌ Error: ${errorMessage}`,
        type: 'error',
      });
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const handleExtractFrames = async (videoPath: string) => {
    if (!project) return;

    setIsExtractingFrames(true);
    setError(null);

    try {
      addChatMessage({
        role: 'agent',
        content: `Extracting seed frames from Scene ${currentSceneIndex + 1}...`,
        type: 'status',
      });

      const response = await extractFrames(videoPath, project.id, currentSceneIndex);

      if (response.frames && response.frames.length > 0) {
        // Convert to SeedFrame format
        const seedFrames = response.frames.map((frame) => ({
          id: frame.id,
          url: frame.url,
          timestamp: frame.timestamp,
        }));

        setSeedFrames(currentSceneIndex, seedFrames);
        
        addChatMessage({
          role: 'agent',
          content: `✓ Seed frames extracted. Please select a frame for Scene ${currentSceneIndex + 2}.`,
          type: 'status',
        });
      } else {
        throw new Error('No frames extracted');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to extract frames';
      setError(errorMessage);
      addChatMessage({
        role: 'agent',
        content: `❌ Error: ${errorMessage}`,
        type: 'error',
      });
    } finally {
      setIsExtractingFrames(false);
    }
  };

  const handleApproveAndContinue = () => {
    // Move to next scene if available
    if (currentSceneIndex < project.storyboard.length - 1) {
      setCurrentSceneIndex(currentSceneIndex + 1);
      addChatMessage({
        role: 'agent',
        content: `Moving to Scene ${currentSceneIndex + 2}/5...`,
        type: 'status',
      });
    } else {
      addChatMessage({
        role: 'agent',
        content: 'All scenes complete! Ready to stitch final video.',
        type: 'status',
      });
    }
  };

  const handleSelectSeedFrame = (frameIndex: number) => {
    selectSeedFrame(currentSceneIndex, frameIndex);
    addChatMessage({
      role: 'agent',
      content: `✓ Seed frame ${frameIndex + 1} selected for Scene ${currentSceneIndex + 2}`,
      type: 'status',
    });
  };

  // Auto-extract frames when video is ready (if not already extracted)
  useEffect(() => {
    if (sceneHasVideo && !seedFrames.length && currentSceneIndex < 4 && !isExtractingFrames) {
      const videoPath = sceneState?.videoLocalPath;
      if (videoPath) {
        handleExtractFrames(videoPath);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneHasVideo, seedFrames.length, currentSceneIndex, isExtractingFrames]);

  return (
    <div className="h-full flex flex-col p-4">
      {/* Scene Header */}
      <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Scene {currentSceneIndex + 1}: {currentScene.description}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {currentScene.suggestedDuration}s • {currentScene.imagePrompt}
            </p>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
          >
            ×
          </button>
        </div>
      )}

      {/* Main Preview Area */}
      <div className="flex-1 overflow-y-auto">
        {!sceneHasImage && !sceneHasVideo && (
          <div className="flex flex-col items-center justify-center h-full bg-gray-50 dark:bg-gray-900 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700">
            <ImageIcon className="w-12 h-12 text-gray-400 dark:text-gray-500 mb-4" />
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              No image generated yet
            </p>
            <button
              onClick={() => handleGenerateImage()}
              disabled={isGeneratingImage}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGeneratingImage ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <ImageIcon className="w-4 h-4" />
                  Generate Image
                </>
              )}
            </button>
          </div>
        )}

        {sceneHasImage && !sceneHasVideo && (
          <div className="space-y-4">
            {/* Image Preview with Metadata (Phase 9.1.2) */}
            <div className="relative bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden group">
              {selectedImage && (
                <>
                  <img
                    src={selectedImage.url}
                    alt={`Scene ${currentSceneIndex + 1} generated image`}
                    className="w-full aspect-video object-contain"
                    loading="lazy"
                  />
                  {/* Metadata overlay on hover */}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center justify-between">
                      <span>Generated: {new Date(selectedImage.createdAt).toLocaleString()}</span>
                      <span>ID: {selectedImage.id.slice(0, 8)}...</span>
                    </div>
                  </div>
                </>
              )}
              <div className="absolute top-4 right-4 flex gap-2">
                <button
                  onClick={handleRegenerateImage}
                  disabled={isGeneratingImage}
                  className="px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors shadow-md"
                >
                  {isGeneratingImage ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Regenerate'
                  )}
                </button>
              </div>
            </div>

            {/* Regenerate Prompt Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Custom Prompt (optional)
              </label>
              <textarea
                value={regeneratePrompt}
                onChange={(e) => setRegeneratePrompt(e.target.value)}
                placeholder="Enter a custom prompt to regenerate with different style..."
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={2}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Leave empty to use the original scene prompt
              </p>
            </div>

            {/* Image Variations (if multiple images) */}
            {sceneState?.generatedImages && sceneState.generatedImages.length > 1 && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Select Image Variation
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {sceneState.generatedImages.map((img) => (
                    <button
                      key={img.id}
                      onClick={() => selectImage(currentSceneIndex, img.id)}
                      className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                        selectedImage?.id === img.id
                          ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-200 dark:ring-blue-800'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <img
                        src={img.url}
                        alt="Variation"
                        className="w-full h-full object-cover"
                      />
                      {selectedImage?.id === img.id && (
                        <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                          <CheckCircle2 className="w-6 h-6 text-blue-500 dark:text-blue-400" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Generate Video Button */}
            <button
              onClick={handleGenerateVideo}
              disabled={isGeneratingVideo || !selectedImage}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGeneratingVideo ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating Video...
                </>
              ) : (
                <>
                  <Video className="w-5 h-5" />
                  Generate Video
                </>
              )}
            </button>
          </div>
        )}

        {sceneHasVideo && (
          <div className="space-y-4">
            {/* Video Preview */}
            <VideoPlayer
              src={sceneState?.videoLocalPath}
              className="w-full"
            />

            {/* Seed Frame Selection */}
            {seedFrames.length > 0 && currentSceneIndex < 4 && (
              <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <SeedFrameSelector
                  frames={seedFrames}
                  selectedFrameIndex={sceneState?.selectedSeedFrameIndex}
                  onSelectFrame={handleSelectSeedFrame}
                />
              </div>
            )}

            {/* Frame Extraction Status */}
            {isExtractingFrames && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500 dark:text-blue-400" />
                <p className="text-sm text-blue-700 dark:text-blue-400">
                  Extracting seed frames...
                </p>
              </div>
            )}

            {/* Approve & Continue */}
            <button
              onClick={handleApproveAndContinue}
              disabled={currentSceneIndex < 4 && seedFrames.length > 0 && sceneState?.selectedSeedFrameIndex === undefined}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <CheckCircle2 className="w-5 h-5" />
              {currentSceneIndex < project.storyboard.length - 1
                ? 'Approve & Continue to Next Scene'
                : 'All Scenes Complete'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

