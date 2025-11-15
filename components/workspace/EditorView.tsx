'use client';

import { useProjectStore } from '@/lib/state/project-store';
import VideoPlayer from './VideoPlayer';
import SeedFrameSelector from './SeedFrameSelector';
import DevPanel from './DevPanel';
import { Loader2, Image as ImageIcon, Video, CheckCircle2, X, Edit2, Save, X as XIcon, Settings } from 'lucide-react';
import { useState, useEffect } from 'react';
import { generateImage, pollImageStatus, generateVideo, pollVideoStatus, uploadImageToS3, extractFrames } from '@/lib/api-client';
import { GeneratedImage, SeedFrame } from '@/lib/types';

interface ImagePreviewModalProps {
  image: GeneratedImage;
  isOpen: boolean;
  onClose: () => void;
}

function ImagePreviewModal({ image, isOpen, onClose }: ImagePreviewModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-5xl max-h-[90vh] bg-white dark:bg-gray-800 rounded-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-75 transition-opacity"
        >
          <X className="w-6 h-6" />
        </button>
        <img
          src={`/api/serve-image?path=${encodeURIComponent(image.localPath)}`}
          alt="Preview"
          className="max-w-full max-h-[90vh] object-contain"
        />
      </div>
    </div>
  );
}

interface GeneratingImage {
  predictionId: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  image?: GeneratedImage;
}

export default function EditorView() {
  const { 
    project, 
    currentSceneIndex, 
    scenes,
    setSceneStatus,
    addGeneratedImage,
    selectImage,
    setVideoPath,
    setCurrentSceneIndex,
    setSeedFrames,
    setViewMode,
    selectSeedFrame,
    updateScenePrompt,
  } = useProjectStore();
  
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [generatingImages, setGeneratingImages] = useState<GeneratingImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<GeneratedImage | null>(null);
  const [isExtractingFrames, setIsExtractingFrames] = useState(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [isDevPanelOpen, setIsDevPanelOpen] = useState(false);

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

  // Get actual scene state
  const sceneState = scenes[currentSceneIndex];
  const sceneImages = sceneState?.generatedImages || [];
  const sceneHasImage = sceneImages.length > 0;
  const selectedImage = sceneImages.find(img => img.id === (selectedImageId || sceneState?.selectedImageId));
  const sceneHasVideo = !!sceneState?.videoLocalPath;
  const seedFrames = sceneState?.seedFrames || [];

  // Update selected image ID when scene state changes
  useEffect(() => {
    if (sceneState?.selectedImageId) {
      setSelectedImageId(sceneState.selectedImageId);
    }
  }, [sceneState?.selectedImageId]);

  // Initialize edited prompt when scene changes or editing starts
  useEffect(() => {
    if (currentScene) {
      setEditedPrompt(currentScene.imagePrompt);
    }
  }, [currentScene?.imagePrompt, currentSceneIndex]);

  const handleGenerateImage = async () => {
    if (!project?.id) return;

    setIsGeneratingImage(true);
    setGeneratingImages([]);
    setSelectedImageId(null);

    // Initialize 5 generating image slots
    const initialGenerating: GeneratingImage[] = Array(5).fill(null).map(() => ({
      predictionId: '',
      status: 'starting',
    }));
    setGeneratingImages(initialGenerating);

    try {
      setSceneStatus(currentSceneIndex, 'generating_image');

      // Get reference images from project (uploaded images for object consistency)
      let referenceImageUrls = project.referenceImageUrls || [];

      // Get seed frame from previous scene (for Scenes 1-4, to use as seed image for image-to-image generation)
      let seedImageUrl: string | undefined = undefined;
      let seedFrameUrl: string | undefined = undefined;

      if (currentSceneIndex > 0) {
        const previousScene = scenes[currentSceneIndex - 1];
        if (previousScene?.seedFrames && previousScene.seedFrames.length > 0) {
          // Use selected seed frame, or default to first frame if none selected
          const selectedIndex = previousScene.selectedSeedFrameIndex ?? 0;
          const selectedFrame = previousScene.seedFrames[selectedIndex];

          // Ensure the seed frame URL is a public URL (S3 or serveable)
          if (selectedFrame?.url) {
            seedFrameUrl = selectedFrame.url;
            // If it's a local path, convert to serveable URL
            if (!seedFrameUrl.startsWith('http://') && !seedFrameUrl.startsWith('https://') && !seedFrameUrl.startsWith('/api')) {
              seedFrameUrl = `/api/serve-image?path=${encodeURIComponent(selectedFrame.localPath || selectedFrame.url)}`;
            }

            // Use the seed frame as the seed image for image-to-image generation
            seedImageUrl = seedFrameUrl;
            console.log(`[EditorView] Scene ${currentSceneIndex}: Using seed frame as seed image for image-to-image generation:`, seedImageUrl.substring(0, 80) + '...');
          }
        }
      } else if (referenceImageUrls.length > 0) {
        // For Scene 0: Use reference image as seed image if available
        seedImageUrl = referenceImageUrls[0];
        console.log(`[EditorView] Scene ${currentSceneIndex}: Using reference image as seed image:`, seedImageUrl.substring(0, 80) + '...');
      }

      // Generate 5 images in parallel
      const imagePromises = Array(5).fill(null).map(async (_, index) => {
        try {
          // Create prediction
          // Strategy: Use seed frame as seed image for image-to-image generation
          // For Scene 0: Use reference image as seed image if available
          // For Scenes 1-4: Use seed frame from previous scene as seed image
          const response = await generateImage({
            prompt: currentScene.imagePrompt,
            projectId: project.id,
            sceneIndex: currentSceneIndex,
            seedImage: seedImageUrl, // Seed frame from previous scene (or reference image for Scene 0)
            referenceImageUrls, // Reference images via IP-Adapter (for object consistency)
            seedFrame: seedFrameUrl, // Seed frame URL (same as seedImage for scenes 1-4)
          });

          // Check if predictionId exists
          if (!response.predictionId) {
            throw new Error('Failed to get prediction ID from image generation response');
          }

          // Update generating state
          setGeneratingImages(prev => {
            const updated = [...prev];
            updated[index] = {
              predictionId: response.predictionId || '',
              status: response.status || 'starting',
            };
            return updated;
          });

          // Poll for completion
          const statusResponse = await pollImageStatus(
            response.predictionId || '',
            {
              interval: 2000,
              projectId: project.id,
              sceneIndex: currentSceneIndex,
              prompt: currentScene.imagePrompt,
              onProgress: (status) => {
                setGeneratingImages(prev => {
                  const updated = [...prev];
                  updated[index] = {
                    ...updated[index],
                    status: status.status === 'canceled' ? 'failed' : status.status,
                  };
                  return updated;
                });
              },
            }
          );

          if (statusResponse.status === 'succeeded' && statusResponse.image) {
            // Add image to store
            addGeneratedImage(currentSceneIndex, statusResponse.image);

            // Auto-select first image when it's generated
            if (index === 0 && !selectedImageId) {
              setSelectedImageId(statusResponse.image.id);
              selectImage(currentSceneIndex, statusResponse.image.id);
            }

            // Update generating state
            setGeneratingImages(prev => {
              const updated = [...prev];
              updated[index] = {
                ...updated[index],
                status: 'succeeded',
                image: statusResponse.image,
              };
              return updated;
            });
          } else {
            throw new Error(statusResponse.error || 'Image generation failed');
          }
        } catch (error) {
          console.error(`Failed to generate image ${index + 1}:`, error);
          setGeneratingImages(prev => {
            const updated = [...prev];
            updated[index] = {
              ...updated[index],
              status: 'failed',
            };
            return updated;
          });
        }
      });

      await Promise.all(imagePromises);
      setSceneStatus(currentSceneIndex, 'image_ready');
    } catch (error) {
      console.error('Error generating images:', error);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleSelectImage = (imageId: string) => {
    setSelectedImageId(imageId);
    selectImage(currentSceneIndex, imageId);
  };

  const handleGenerateVideo = async () => {
    if (!project?.id || !selectedImage) return;

    setIsGeneratingVideo(true);
    try {
      setSceneStatus(currentSceneIndex, 'generating_video');

      // Upload selected image to S3 first
      const { s3Url } = await uploadImageToS3(selectedImage.localPath, project.id);

      // Get seed frame from previous scene (if not Scene 0)
      let seedFrameUrl: string | undefined;
      if (currentSceneIndex > 0) {
        const previousScene = scenes[currentSceneIndex - 1];
        if (previousScene?.seedFrames && previousScene.seedFrames.length > 0) {
          const selectedIndex = previousScene.selectedSeedFrameIndex ?? 0;
          const selectedFrame = previousScene.seedFrames[selectedIndex];
          
          // Check if frame URL is already a public URL (S3 or served via API)
          if (selectedFrame.url.startsWith('http://') || selectedFrame.url.startsWith('https://')) {
            seedFrameUrl = selectedFrame.url; // Already an S3/public URL
          } else {
            // Upload to S3 (or get public URL via API fallback)
            // The uploadImageToS3 API will handle S3 upload or return a public URL
            const localPath = selectedFrame.localPath || selectedFrame.url;
            try {
              const { s3Url: frameS3Url } = await uploadImageToS3(localPath, project.id);
              seedFrameUrl = frameS3Url; // This will be either S3 URL or public URL from API
            } catch (error) {
              console.error('Error uploading seed frame:', error);
              // If upload fails, we can't proceed - the API requires a public URL
              throw new Error('Failed to upload seed frame. Please try again.');
            }
          }
        }
      }

      // Generate video
      const videoResponse = await generateVideo(
        s3Url,
        currentScene.imagePrompt,
        project.id,
        currentSceneIndex,
        seedFrameUrl // Pass seed frame for scenes 1-4
      );

      // Poll for video completion (pass projectId and sceneIndex to trigger download)
      const videoStatus = await pollVideoStatus(videoResponse.predictionId, {
        interval: 5000,
        projectId: project.id,
        sceneIndex: currentSceneIndex,
        onProgress: (status) => {
          console.log('Video generation progress:', status);
        },
      });

      if (videoStatus.status === 'succeeded' && videoStatus.videoPath) {
        setVideoPath(currentSceneIndex, videoStatus.videoPath);
        setSceneStatus(currentSceneIndex, 'video_ready');

        // Show warning if download failed but using Replicate URL
        if (videoStatus.error) {
          console.warn('Video download failed, using Replicate URL:', videoStatus.error);
        }

        // Extract seed frames immediately after video generation (for the next scene)
        // Only extract if this isn't the last scene
        if (currentSceneIndex < 4) {
          setIsExtractingFrames(true);
          try {
            // Check if video path is a URL (Replicate URL) or local path
            let videoPath = videoStatus.videoPath;

            // If it's a URL, we can't extract frames from it directly
            if (videoPath.startsWith('http://') || videoPath.startsWith('https://')) {
              console.warn('Video path is a URL, cannot extract frames. Expected local path.');
            } else {
              const response = await extractFrames(
                videoPath,
                project.id,
                currentSceneIndex
              );

              if (response.frames && response.frames.length > 0) {
                // Upload seed frames to S3 so they can be used for video generation
                const uploadedFrames = await Promise.all(
                  response.frames.map(async (frame) => {
                    try {
                      // Upload frame to S3
                      const { s3Url } = await uploadImageToS3(frame.url, project.id);
                      return {
                        ...frame,
                        url: s3Url, // Update to S3 URL for video generation
                        localPath: frame.url, // Keep local path for reference
                      };
                    } catch (error) {
                      console.error('Error uploading seed frame to S3:', error);
                      // If S3 upload fails, convert local path to serveable URL
                      const localPath = (frame as any).localPath || frame.url;
                      if (!localPath.startsWith('http://') && !localPath.startsWith('https://') && !localPath.startsWith('/api')) {
                        return {
                          ...frame,
                          url: `/api/serve-image?path=${encodeURIComponent(localPath)}`,
                          localPath: localPath,
                        } as SeedFrame;
                      }
                      return frame as SeedFrame;
                    }
                  })
                );

                // Store seed frames in CURRENT scene (to be used for next scene)
                setSeedFrames(currentSceneIndex, uploadedFrames);
                console.log(`Extracted and stored ${uploadedFrames.length} seed frames for Scene ${currentSceneIndex + 1} (for use in Scene ${currentSceneIndex + 2})`);
              }
            }
          } catch (error) {
            console.error('Error extracting seed frames:', error);
            // Don't fail the entire video generation if seed frame extraction fails
          } finally {
            setIsExtractingFrames(false);
          }
        }
      } else if (videoStatus.status === 'succeeded' && !videoStatus.videoPath) {
        // Video succeeded but no path available (shouldn't happen with our fix, but handle it)
        throw new Error(videoStatus.error || 'Video generated but no video path available. Please try again.');
      } else {
        throw new Error(videoStatus.error || 'Video generation failed');
      }
    } catch (error) {
      console.error('Error generating video:', error);
      alert('Failed to generate video: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const handleRegenerateImage = async () => {
    // Clear current images and regenerate
    setSelectedImageId(null);
    await handleGenerateImage();
  };

  const handleApproveAndContinue = async () => {
    if (!project?.id || !sceneState?.videoLocalPath) return;

    // Mark current scene as completed
    setSceneStatus(currentSceneIndex, 'completed');

    // If this is the last scene (Scene 4), navigate to timeline view
    if (currentSceneIndex >= 4) {
      setViewMode('timeline');
      return;
    }

    // Move to next scene (seed frames already extracted after video generation)
    const nextSceneIndex = currentSceneIndex + 1;
    setCurrentSceneIndex(nextSceneIndex);
  };

  const handleSelectSeedFrame = (frameIndex: number) => {
    selectSeedFrame(currentSceneIndex, frameIndex);
  };

  const handleStartEditPrompt = () => {
    setEditedPrompt(currentScene.imagePrompt);
    setIsEditingPrompt(true);
  };

  const handleSavePrompt = () => {
    if (editedPrompt.trim()) {
      updateScenePrompt(currentSceneIndex, editedPrompt.trim());
      setIsEditingPrompt(false);
    }
  };

  const handleCancelEditPrompt = () => {
    setEditedPrompt(currentScene.imagePrompt);
    setIsEditingPrompt(false);
  };

  // Combine generated images with currently generating ones
  const allImages = [...sceneImages];
  generatingImages.forEach((genImg, index) => {
    if (genImg.image) {
      // Image is already in sceneImages, skip
      return;
    }
    // Add placeholder for generating images
    if (genImg.status !== 'succeeded' && genImg.status !== 'failed') {
      allImages.push({
        id: `generating-${index}`,
        url: '',
        localPath: '',
        prompt: currentScene.imagePrompt,
        replicateId: genImg.predictionId,
        createdAt: new Date().toISOString(),
      } as GeneratedImage);
    }
  });

  return (
    <div className="h-full flex flex-col p-4 relative">
      {/* Dev Panel Toggle Button */}
      <button
        onClick={() => setIsDevPanelOpen(!isDevPanelOpen)}
        className="fixed top-4 right-4 z-40 p-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 shadow-sm transition-colors"
        title="Model Configuration"
      >
        <Settings className="w-5 h-5" />
      </button>

      {/* Scene Header */}
      <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between">
          <div className="flex-1 pr-12">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Scene {currentSceneIndex + 1}: {currentScene.description}
            </h3>
            <div className="mt-2">
              <div className="flex items-start gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {currentScene.suggestedDuration}s •
                </span>
                {isEditingPrompt ? (
                  <div className="flex-1 flex flex-col gap-2">
                    <textarea
                      value={editedPrompt}
                      onChange={(e) => setEditedPrompt(e.target.value)}
                      className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-gray-900 dark:text-white resize-none"
                      rows={3}
                      placeholder="Enter image prompt..."
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSavePrompt}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                      >
                        <Save className="w-4 h-4" />
                        Save
                      </button>
                      <button
                        onClick={handleCancelEditPrompt}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                      >
                        <XIcon className="w-4 h-4" />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-start gap-2 group">
                    <p className="text-sm text-gray-500 dark:text-gray-400 flex-1">
                      {currentScene.imagePrompt}
                    </p>
                    <button
                      onClick={handleStartEditPrompt}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                      title="Edit prompt"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Preview Area */}
      <div className="flex-1 overflow-y-auto">
        {!sceneHasImage && !sceneHasVideo && (
          <div className="flex flex-col items-center justify-center h-full bg-gray-50 dark:bg-gray-900 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700">
            <ImageIcon className="w-12 h-12 text-gray-400 dark:text-gray-500 mb-4" />
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              No image generated yet
            </p>
            <button
              onClick={handleGenerateImage}
              disabled={isGeneratingImage}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGeneratingImage ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating 5 images...
                </>
              ) : (
                <>
                  <ImageIcon className="w-4 h-4" />
                  Generate Images
                </>
              )}
            </button>
          </div>
        )}

        {/* Image Generation Grid */}
        {(isGeneratingImage || sceneHasImage) && !sceneHasVideo && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {isGeneratingImage ? 'Generating images...' : 'Select an image'}
              </h4>
              {sceneHasImage && (
                <button
                  onClick={handleRegenerateImage}
                  disabled={isGeneratingImage}
                  className="px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                >
                  {isGeneratingImage ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Regenerate'
                  )}
                </button>
              )}
            </div>

            {/* Image Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {allImages.map((image, index) => {
                const isGenerating = image.id.startsWith('generating-');
                const generatingState = generatingImages.find(
                  (_, idx) => `generating-${idx}` === image.id
                );
                const isSelected = selectedImageId === image.id || (!selectedImageId && index === 0 && !isGenerating);
                const isLoading = isGenerating && generatingState?.status !== 'succeeded' && generatingState?.status !== 'failed';

                return (
                  <div
                    key={image.id}
                    onClick={() => !isGenerating && handleSelectImage(image.id)}
                    onDoubleClick={() => !isGenerating && image.localPath && setPreviewImage(image)}
                    className={`relative aspect-video rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                      isSelected && !isGenerating
                        ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    } ${isGenerating ? 'cursor-not-allowed' : ''}`}
                  >
                    {isLoading ? (
                      <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                      </div>
                    ) : image.localPath ? (
                      <>
                        <img
                          src={`/api/serve-image?path=${encodeURIComponent(image.localPath)}`}
                          alt={`Generated image ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {isSelected && !isGenerating && (
                          <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full p-1">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                        <ImageIcon className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
              </div>
                );
              })}
            </div>

            {/* Generate Video Button */}
            {selectedImage && !isGeneratingImage && (
            <button
              onClick={handleGenerateVideo}
              disabled={isGeneratingVideo}
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
                    Generate Video from Selected Image
                </>
              )}
            </button>
            )}
          </div>
        )}

        {sceneHasVideo && (
          <div className="space-y-4">
            {/* Video Preview */}
            <VideoPlayer
              src={sceneState?.videoLocalPath ? (
                sceneState.videoLocalPath.startsWith('http://') || sceneState.videoLocalPath.startsWith('https://')
                  ? sceneState.videoLocalPath // Use Replicate URL directly
                  : `/api/serve-video?path=${encodeURIComponent(sceneState.videoLocalPath)}` // Use local path via API
              ) : undefined}
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

            {/* Approve & Continue */}
            <button
              onClick={handleApproveAndContinue}
              disabled={isExtractingFrames}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isExtractingFrames ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Extracting seed frames...
                </>
              ) : currentSceneIndex >= 4 ? (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Approve & View Final Video
                </>
              ) : (
                <>
              <CheckCircle2 className="w-5 h-5" />
              Approve & Continue to Next Scene
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Image Preview Modal */}
      {previewImage && (
        <ImagePreviewModal
          image={previewImage}
          isOpen={!!previewImage}
          onClose={() => setPreviewImage(null)}
        />
      )}

      {/* Dev Panel */}
      <DevPanel isOpen={isDevPanelOpen} onClose={() => setIsDevPanelOpen(false)} />
    </div>
  );
}
