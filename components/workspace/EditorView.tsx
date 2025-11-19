'use client';

import { useProjectStore } from '@/lib/state/project-store';
import VideoPlayer from './VideoPlayer';
import SeedFrameSelector from './SeedFrameSelector';
import { Loader2, Image as ImageIcon, Video, CheckCircle2, X, Edit2, Save, X as XIcon, Upload, XCircle, ChevronUp, ChevronDown } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { generateImage, pollImageStatus, generateVideo, pollVideoStatus, uploadImageToS3, extractFrames, uploadImages } from '@/lib/api-client';
import { GeneratedImage, GeneratedVideo, SeedFrame } from '@/lib/types';
import { UploadedImage, ProcessedImage } from '@/lib/storage/image-storage';
import { useMediaDragDrop } from '@/lib/hooks/useMediaDragDrop';

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
    updateSceneSettings,
  } = useProjectStore();
  
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [generatingImages, setGeneratingImages] = useState<GeneratingImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<GeneratedImage | null>(null);
  const [isExtractingFrames, setIsExtractingFrames] = useState(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [editedNegativePrompt, setEditedNegativePrompt] = useState('');
  const [editedDuration, setEditedDuration] = useState<number | ''>('');
  const [editedUseSeedFrame, setEditedUseSeedFrame] = useState<boolean>(false);
  const [customImageFiles, setCustomImageFiles] = useState<File[]>([]);
  const [customImagePreviews, setCustomImagePreviews] = useState<Array<{ url: string; source: 'file' | 'media' }>>([]);
  const [droppedImageUrls, setDroppedImageUrls] = useState<string[]>([]); // Store original URLs from dropped media
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [enlargedSeedFrameUrl, setEnlargedSeedFrameUrl] = useState<string | null>(null);

  if (!project || !project.storyboard || project.storyboard.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-white/60">
        <p className="text-sm">No scene selected. Choose a scene from the storyboard.</p>
      </div>
    );
  }

  const currentScene = project.storyboard[currentSceneIndex];
  if (!currentScene) {
    return (
      <div className="flex items-center justify-center h-full text-white/60">
        <p className="text-sm">Scene not found.</p>
      </div>
    );
  }

  // Get actual scene state
  const sceneState = scenes[currentSceneIndex];
  const sceneImages = sceneState?.generatedImages || [];
  const sceneHasImage = sceneImages.length > 0;
  const selectedImage = sceneImages.find((img: GeneratedImage) => img.id === (selectedImageId || sceneState?.selectedImageId));
  // Get selected video (prefer selectedVideoId, fallback to videoLocalPath for backward compatibility)
  const selectedVideo = sceneState?.generatedVideos?.find((v: GeneratedVideo) => v.id === sceneState.selectedVideoId) 
    || (sceneState?.videoLocalPath ? {
      id: 'legacy',
      url: sceneState.videoLocalPath.startsWith('http://') || sceneState.videoLocalPath.startsWith('https://')
        ? sceneState.videoLocalPath
        : `/api/serve-video?path=${encodeURIComponent(sceneState.videoLocalPath)}`,
      localPath: sceneState.videoLocalPath,
      actualDuration: sceneState.actualDuration,
      timestamp: new Date().toISOString(),
    } : undefined);
  
  // Ensure video URL is properly formatted for playback
  const videoUrl = selectedVideo?.url || (selectedVideo?.localPath 
    ? (selectedVideo.localPath.startsWith('http://') || selectedVideo.localPath.startsWith('https://')
      ? selectedVideo.localPath
      : `/api/serve-video?path=${encodeURIComponent(selectedVideo.localPath)}`)
    : undefined);
  
  const sceneHasVideo = !!selectedVideo && !!videoUrl;
  const seedFrames = sceneState?.seedFrames || [];

  // Update selected image ID when scene state changes
  useEffect(() => {
    if (sceneState?.selectedImageId) {
      setSelectedImageId(sceneState.selectedImageId);
    }
  }, [sceneState?.selectedImageId]);

  // Initialize edited fields when scene changes or editing starts
  useEffect(() => {
    if (currentScene) {
      setEditedPrompt(currentScene.imagePrompt);
      setEditedNegativePrompt(currentScene.negativePrompt || '');
      setEditedDuration(currentScene.customDuration || '');
      // Default to false (opt-in for longer scenes), or use saved value
      setEditedUseSeedFrame(currentScene.useSeedFrame !== undefined ? currentScene.useSeedFrame : false);
      // Initialize custom images - support both single string (legacy) and array
      const imageInputs = currentScene.customImageInput 
        ? (Array.isArray(currentScene.customImageInput) ? currentScene.customImageInput : [currentScene.customImageInput])
        : [];
      setCustomImageFiles([]);
      // Populate droppedImageUrls with saved images so they're preserved when adding new ones
      setDroppedImageUrls(imageInputs.map((url: string) => {
        // Convert serveable URLs back to original paths if needed
        if (url.startsWith('/api/serve-image?path=')) {
          return decodeURIComponent(url.split('path=')[1]);
        }
        return url;
      }));
      // Set previews with properly formatted URLs
      setCustomImagePreviews(imageInputs.map((url: string) => {
        // Convert local paths to serveable URLs for preview
        let previewUrl = url;
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/api') && !url.startsWith('blob:')) {
          previewUrl = `/api/serve-image?path=${encodeURIComponent(url)}`;
        }
        return { url: previewUrl, source: 'media' as const };
      }));
    }
  }, [currentScene?.imagePrompt, currentScene?.negativePrompt, currentScene?.customDuration, currentScene?.customImageInput, currentScene?.useSeedFrame, currentSceneIndex]);

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

      // Priority: Custom image input > seed frame > reference image
      // Handle custom image inputs (can be single string or array)
      const customImageInputs = currentScene.customImageInput
        ? (Array.isArray(currentScene.customImageInput) ? currentScene.customImageInput : [currentScene.customImageInput])
        : [];

      if (customImageInputs.length > 0) {
        // Validate and format custom image URLs
        const validatedCustomImages: string[] = [];
        for (const url of customImageInputs) {
          if (!url || typeof url !== 'string') {
            console.warn(`[EditorView] Invalid custom image URL: ${url}`);
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
          console.error(`[EditorView] No valid custom images found after validation`);
        } else {
          // Use first custom image as seed image (for image-to-image)
          seedImageUrl = validatedCustomImages[0];
          console.log(`[EditorView] Scene ${currentSceneIndex}: Using custom image input as seed image:`, seedImageUrl.substring(0, 80) + '...');
          
          // Add all custom images to reference images for IP-Adapter
          referenceImageUrls = [...validatedCustomImages, ...referenceImageUrls];
          console.log(`[EditorView] Scene ${currentSceneIndex}: Using ${validatedCustomImages.length} custom image(s) as reference images via IP-Adapter`);
        }
      } else if (currentSceneIndex > 0) {
        // Only use seed frame if explicitly enabled via checkbox
        const useSeedFrame = currentScene.useSeedFrame === true;
        if (useSeedFrame) {
          const previousScene = scenes[currentSceneIndex - 1];
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
              console.log(`[EditorView] Scene ${currentSceneIndex}: Using seed frame as seed image for image-to-image generation:`, seedImageUrl!.substring(0, 80) + '...');
            }
          }
        } else {
          console.log(`[EditorView] Scene ${currentSceneIndex}: Seed frame checkbox is disabled, not using seed frame`);
        }
      } else if (referenceImageUrls.length > 0) {
        // For Scene 0: Use reference image as seed image if available
        seedImageUrl = referenceImageUrls[0];
        console.log(`[EditorView] Scene ${currentSceneIndex}: Using reference image as seed image:`, seedImageUrl!.substring(0, 80) + '...');
      }

      // Generate 5 images in parallel
      const imagePromises = Array(5).fill(null).map(async (_, index) => {
        try {
          // Create prediction
          // Strategy: Use seed frame as seed image for image-to-image generation
          // For Scene 0: Use reference image as seed image if available
          // For Scenes 1-4: Use seed frame from previous scene as seed image
          // Get prompt adjustment mode from runtime config
          const { getRuntimeConfig } = await import('@/lib/config/model-runtime');
          const runtimeConfig = getRuntimeConfig();
          const promptAdjustmentMode = runtimeConfig.promptAdjustmentMode || 'scene-specific';

          const response = await generateImage({
            prompt: currentScene.imagePrompt,
            projectId: project.id,
            sceneIndex: currentSceneIndex,
            seedImage: seedImageUrl, // Custom image input, seed frame from previous scene, or reference image for Scene 0
            referenceImageUrls, // Reference images via IP-Adapter (for object consistency)
            seedFrame: seedFrameUrl, // Seed frame URL (same as seedImage for scenes 1-4, unless custom image input is used)
            negativePrompt: currentScene.negativePrompt, // Optional negative prompt
            promptAdjustmentMode, // Prompt adjustment mode from runtime config
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
            return { success: true, index };
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
          return { success: false, index, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      });

      const results = await Promise.all(imagePromises);
      const successCount = results.filter(r => r.success).length;
      
      if (successCount > 0) {
        // At least one image succeeded
        setSceneStatus(currentSceneIndex, 'image_ready');
      } else {
        // All images failed - show error and reset status
        const errorMessages = results
          .filter(r => !r.success && r.error)
          .map(r => r.error)
          .filter((msg, idx, arr) => arr.indexOf(msg) === idx); // Unique errors
        
        const errorMessage = errorMessages.length > 0 
          ? `All image generations failed. ${errorMessages[0]}`
          : 'All image generations failed. Please try again.';
        
        console.error('[EditorView] All image generations failed:', errorMessages);
        alert(errorMessage);
        setSceneStatus(currentSceneIndex, 'pending');
      }
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

  const handleRegenerateVideo = async () => {
    // Clear seed frames for current scene before regenerating
    // This ensures new seed frames are extracted from the newly generated video
    setSeedFrames(currentSceneIndex, []);
    console.log(`[EditorView] Cleared seed frames for Scene ${currentSceneIndex + 1} before regeneration`);
    
    // Regenerate video using the same logic as handleGenerateVideo
    await handleGenerateVideo();
  };

  const handleGenerateVideo = async () => {
    if (!project?.id) return;

    setIsGeneratingVideo(true);
    try {
      setSceneStatus(currentSceneIndex, 'generating_video');

      // For Scene 0: Use generated scene image (with vehicle in context) instead of character reference
      // This prevents the fade from character image to scene - video starts directly in the scene
      // For Scenes 1-4: Use selected generated image
      let imageToUse: string | undefined;
      
      if (currentSceneIndex === 0) {
        // Scene 0: Prioritize generated scene image (which includes vehicle in scene context)
        // This ensures the video starts directly in the scene without fading from character image
        if (selectedImage) {
          imageToUse = selectedImage.localPath;
          console.log('[EditorView] Scene 0: Using generated scene image (with vehicle in context) for video generation');
        } else {
          // Fallback to reference image if no generated scene image available
          const referenceImageUrls = project.referenceImageUrls || [];
          if (referenceImageUrls.length > 0) {
            const refImage = referenceImageUrls[0];
            if (refImage.startsWith('http://') || refImage.startsWith('https://')) {
              imageToUse = refImage;
              console.log('[EditorView] Scene 0: No generated image available, using reference image URL as fallback');
            } else {
              imageToUse = refImage;
              console.log('[EditorView] Scene 0: No generated image available, using reference image (local path) as fallback');
            }
          } else {
            throw new Error('No image available for video generation. Please generate a scene image first.');
          }
        }
      } else {
        // Scenes 1-4: Use selected generated image
        if (!selectedImage) {
          throw new Error('Please select an image first');
        }
        imageToUse = selectedImage.localPath;
        console.log(`[EditorView] Scene ${currentSceneIndex}: Using selected generated image for video generation`);
      }

      // Upload image to S3 if it's a local path, otherwise use the URL directly
      if (!imageToUse) {
        throw new Error('No image available for video generation');
      }
      let s3Url: string;
      if (imageToUse.startsWith('http://') || imageToUse.startsWith('https://')) {
        // Already a public URL, use it directly
        s3Url = imageToUse;
        console.log('[EditorView] Image is already a public URL, using directly:', s3Url.substring(0, 80) + '...');
      } else {
        // Local path, upload to S3
        const uploadResult = await uploadImageToS3(imageToUse, project.id);
        s3Url = uploadResult.s3Url;
        console.log('[EditorView] Uploaded image to S3:', s3Url.substring(0, 80) + '...');
      }

      // Get seed frame from previous scene (if enabled and not Scene 0)
      // When enabled, the seed frame will be used as the first frame of the generated clip
      let seedFrameUrl: string | undefined;
      const useSeedFrame = currentScene.useSeedFrame === true; // Only use if explicitly enabled
      if (currentSceneIndex > 0 && useSeedFrame) {
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

      // Get scene duration (customDuration takes precedence over suggestedDuration)
      const sceneDuration = currentScene.customDuration || currentScene.suggestedDuration;
      
      // Generate video
      const videoResponse = await generateVideo(
        s3Url,
        currentScene.imagePrompt,
        project.id,
        currentSceneIndex,
        seedFrameUrl, // Pass seed frame for scenes 1-4
        sceneDuration // Pass scene-specific duration (will be rounded up to model-acceptable values)
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
        // Set the video path for the current scene
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
            // Clear any existing seed frames for this scene before extracting new ones
            // This ensures we only use frames from the current video generation
            setSeedFrames(currentSceneIndex, []);
            console.log(`[EditorView] Cleared existing seed frames for Scene ${currentSceneIndex + 1} before extraction`);
            
            // IMPORTANT: Use the video path from videoStatus (which we just received)
            // and verify it's for the correct scene index
            let videoPath = videoStatus.videoPath;
            
            // Verify the video path matches the current scene index
            // Video files are named like: scene-{sceneIndex}-{timestamp}.mp4
            const sceneIndexInPath = videoPath.match(/scene-(\d+)-/);
            if (sceneIndexInPath) {
              const pathSceneIndex = parseInt(sceneIndexInPath[1]);
              if (pathSceneIndex !== currentSceneIndex) {
                console.error(`[EditorView] CRITICAL: Video path scene index mismatch!`);
                console.error(`[EditorView] Expected scene ${currentSceneIndex}, but video path contains scene ${pathSceneIndex}`);
                console.error(`[EditorView] Video path: ${videoPath}`);
                console.error(`[EditorView] This will cause seed frames to be extracted from the wrong scene!`);
                // Try to get the correct video path from scene state (might be updated by now)
                const currentSceneState = scenes[currentSceneIndex];
                const currentSelectedVideo = currentSceneState?.generatedVideos?.find((v: GeneratedVideo) => v.id === currentSceneState.selectedVideoId)
                  || (currentSceneState?.videoLocalPath ? { localPath: currentSceneState.videoLocalPath } : undefined);
                if (currentSelectedVideo?.localPath) {
                  const correctPathSceneIndex = currentSelectedVideo.localPath.match(/scene-(\d+)-/);
                  if (correctPathSceneIndex && parseInt(correctPathSceneIndex[1]) === currentSceneIndex) {
                    console.log(`[EditorView] Using corrected video path from scene state: ${currentSelectedVideo.localPath}`);
                    videoPath = currentSelectedVideo.localPath;
                  } else {
                    throw new Error(`Cannot extract seed frames: Video path is for scene ${pathSceneIndex}, but we need scene ${currentSceneIndex}`);
                  }
                } else {
                  throw new Error(`Cannot extract seed frames: Video path is for scene ${pathSceneIndex}, but we need scene ${currentSceneIndex}`);
                }
              } else {
                console.log(`[EditorView] ✓ Verified: Video path matches current scene ${currentSceneIndex + 1}`);
              }
            } else {
              console.warn(`[EditorView] Could not verify scene index in video path: ${videoPath}`);
              console.warn(`[EditorView] Proceeding with extraction, but path format may be unexpected`);
            }
            
            console.log(`[EditorView] Extracting seed frames from Scene ${currentSceneIndex + 1} video: ${videoPath}`);
            console.log(`[EditorView] Calling extractFrames with sceneIndex=${currentSceneIndex} (Scene ${currentSceneIndex + 1})`);

            // If it's a URL, we can't extract frames from it directly
            if (videoPath.startsWith('http://') || videoPath.startsWith('https://')) {
              console.warn('Video path is a URL, cannot extract frames. Expected local path.');
            } else {
              // Double-check the video file exists and matches the scene
              console.log(`[EditorView] Verifying video file exists and is for correct scene...`);
              const response = await extractFrames(
                videoPath,
                project.id,
                currentSceneIndex
              );
              console.log(`[EditorView] ✓ extractFrames completed for Scene ${currentSceneIndex + 1}, got ${response.frames?.length || 0} frames`);

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
    if (!project?.id || !selectedVideo) return;

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
    // Just select the frame - the checkbox controls whether it's actually used
    selectSeedFrame(currentSceneIndex, frameIndex);
  };

  const handleTogglePromptExpansion = () => {
    if (!isPromptExpanded) {
      // Expanding: Initialize edit fields and enter edit mode
      setEditedPrompt(currentScene.imagePrompt);
      setEditedNegativePrompt(currentScene.negativePrompt || '');
      setEditedDuration(currentScene.customDuration || '');
      // Initialize custom images - support both single string (legacy) and array
      const imageInputs = currentScene.customImageInput 
        ? (Array.isArray(currentScene.customImageInput) ? currentScene.customImageInput : [currentScene.customImageInput])
        : [];
      setCustomImageFiles([]);
      // Populate droppedImageUrls with saved images so they're preserved when adding new ones
      setDroppedImageUrls(imageInputs.map((url: string) => {
        // Convert serveable URLs back to original paths if needed
        if (url.startsWith('/api/serve-image?path=')) {
          return decodeURIComponent(url.split('path=')[1]);
        }
        return url;
      }));
      // Set previews with properly formatted URLs
      setCustomImagePreviews(imageInputs.map((url: string) => {
        // Convert local paths to serveable URLs for preview
        let previewUrl = url;
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/api') && !url.startsWith('blob:')) {
          previewUrl = `/api/serve-image?path=${encodeURIComponent(url)}`;
        }
        return { url: previewUrl, source: 'media' as const };
      }));
      setIsEditingPrompt(true);
      setIsPromptExpanded(true);
    } else {
      // Collapsing: Just close the editor (auto-save has already saved changes)
      // Clear any pending saves
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      setIsEditingPrompt(false);
      setIsPromptExpanded(false);
    }
  };

  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Check if adding these files would exceed the limit
    const currentCount = customImagePreviews.length;
    if (currentCount + files.length > 3) {
      alert(`You can only add up to 3 images. Currently have ${currentCount}, trying to add ${files.length}.`);
      return;
    }

    const validFiles: File[] = [];
    const previews: Array<{ url: string; source: 'file' }> = [];

    files.forEach(file => {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert(`${file.name} is not an image file. Skipping.`);
        return;
      }
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert(`${file.name} is too large (max 10MB). Skipping.`);
        return;
      }
      validFiles.push(file);
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      previews.push({ url: previewUrl, source: 'file' });
    });

    if (validFiles.length > 0) {
      setCustomImageFiles(prev => [...prev, ...validFiles]);
      setCustomImagePreviews(prev => [...prev, ...previews]);
      // Clear dropped image URLs when selecting new files
      setDroppedImageUrls([]);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = (index: number) => {
    const preview = customImagePreviews[index];
    
    // Revoke blob URL if it's from a file
    if (preview.source === 'file' && preview.url.startsWith('blob:')) {
      URL.revokeObjectURL(preview.url);
    }

    // Remove from previews
    setCustomImagePreviews(prev => prev.filter((_, i) => i !== index));
    
    // If it was a file, remove from files array
    if (preview.source === 'file') {
      // Find the corresponding file index
      let fileIndex = 0;
      for (let i = 0; i < index; i++) {
        if (customImagePreviews[i].source === 'file') {
          fileIndex++;
        }
      }
      setCustomImageFiles(prev => prev.filter((_, i) => i !== fileIndex));
    } else {
      // If it was from media drawer, remove from dropped URLs
      const droppedIndex = customImagePreviews.slice(0, index).filter(p => p.source === 'media').length;
      setDroppedImageUrls(prev => prev.filter((_, i) => i !== droppedIndex));
    }
  };

  // Find image URL from itemId and itemType (for drag and drop from media drawer)
  const findImageUrlFromItem = (itemId: string, itemType: 'image' | 'video' | 'frame'): string | null => {
    if (itemType === 'video') {
      // Videos are not supported as image input
      return null;
    }

    // Search in generated images
    for (const scene of scenes) {
      if (scene.generatedImages) {
        const image = scene.generatedImages.find((img: GeneratedImage) => img.id === itemId);
        if (image) {
          // Return the URL - could be local path or S3 URL
          return image.url || image.localPath || null;
        }
      }
    }

    // Search in seed frames
    for (const scene of scenes) {
      if (scene.seedFrames) {
        const frame = scene.seedFrames.find((f: SeedFrame) => f.id === itemId);
        if (frame) {
          // Return the URL - could be S3 URL or local path
          return frame.url || frame.localPath || null;
        }
      }
    }

    // Search in uploaded images
    if (project?.uploadedImages) {
      // Check original images
      const uploadedImage = project.uploadedImages.find((img: UploadedImage) => img.id === itemId);
      if (uploadedImage) {
        return uploadedImage.url || uploadedImage.localPath || null;
      }

      // Check processed versions
      for (const uploadedImage of project.uploadedImages) {
        if (uploadedImage.processedVersions) {
          const processed = uploadedImage.processedVersions.find((p: ProcessedImage) => p.id === itemId);
          if (processed) {
            return processed.url || processed.localPath || null;
          }
        }
      }
    }

    return null;
  };

  // Handle media drop from media drawer
  const handleMediaDropOnImageInput = (itemId: string, itemType: 'image' | 'video' | 'frame') => {
    if (itemType === 'video') {
      alert('Videos cannot be used as image input. Please use an image or frame.');
      return;
    }

    // Check if we've reached the limit
    if (customImagePreviews.length >= 3) {
      alert('You can only add up to 3 images.');
      return;
    }

    const imageUrl = findImageUrlFromItem(itemId, itemType);
    if (imageUrl) {
      // Store the original URL/path for saving
      setDroppedImageUrls(prev => [...prev, imageUrl]);
      
      // Set as custom image preview
      // If it's a local path, convert to serveable URL for preview
      let previewUrl = imageUrl;
      if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://') && !imageUrl.startsWith('/api') && !imageUrl.startsWith('blob:')) {
        previewUrl = `/api/serve-image?path=${encodeURIComponent(imageUrl)}`;
      }
      setCustomImagePreviews(prev => [...prev, { url: previewUrl, source: 'media' }]);
    } else {
      alert('Could not find the dropped image. Please try again.');
    }
  };

  // Handle file drop from computer
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    if (files.length === 0) {
      return;
    }

    // Check if adding these files would exceed the limit
    const currentCount = customImagePreviews.length;
    if (currentCount + files.length > 3) {
      alert(`You can only add up to 3 images. Currently have ${currentCount}, trying to add ${files.length}.`);
      return;
    }

    const validFiles: File[] = [];
    const previews: Array<{ url: string; source: 'file' }> = [];

    files.forEach(file => {
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert(`${file.name} is too large (max 10MB). Skipping.`);
        return;
      }
      validFiles.push(file);
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      previews.push({ url: previewUrl, source: 'file' });
    });

    if (validFiles.length > 0) {
      setCustomImageFiles(prev => [...prev, ...validFiles]);
      setCustomImagePreviews(prev => [...prev, ...previews]);
    }
  };

  // Set up drag and drop for image input area (from media drawer)
  const { handleDragOver: handleMediaDragOver, handleDragLeave: handleMediaDragLeave, handleDrop: handleMediaDrop, isOverDropZone } = useMediaDragDrop({
    onDrop: handleMediaDropOnImageInput,
    acceptedTypes: ['image', 'frame'],
  });

  // Handle drag over for file drops
  const handleFileDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Also handle media drawer drag over
    handleMediaDragOver(e);
  };

  // Handle drag leave for file drops
  const handleFileDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Also handle media drawer drag leave
    handleMediaDragLeave();
  };

  // Handle drop (both files and media drawer)
  const handleDropZone = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Check if it's a file drop (has files)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileDrop(e);
    } else {
      // Otherwise, try media drawer drop
      handleMediaDrop(e);
    }
  };

  // Auto-save function with debouncing
  const autoSave = useCallback(async (skipImages = false) => {
    if (!editedPrompt.trim()) {
      return; // Don't save if prompt is empty
    }

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce the save
    saveTimeoutRef.current = setTimeout(async () => {
      let imageInputUrls: string[] = [];

      // Collect all image URLs from different sources
      const mediaUrls: string[] = [];
      const fileUrls: string[] = [];

      // Get URLs from media drawer drops (primary source)
      // Also include any media previews that aren't in droppedImageUrls yet
      const existingMediaUrls = new Set(droppedImageUrls);
      customImagePreviews
        .filter(p => p.source === 'media')
        .forEach(preview => {
          // Extract original URL from preview (remove /api/serve-image wrapper if present)
          const url = preview.url.startsWith('/api/serve-image?path=')
            ? decodeURIComponent(preview.url.split('path=')[1])
            : preview.url;
          // Only add if not already in droppedImageUrls
          if (!existingMediaUrls.has(url)) {
            existingMediaUrls.add(url);
          }
        });
      
      // Use all collected media URLs
      mediaUrls.push(...Array.from(existingMediaUrls));

      // Upload files if any were selected (only if not skipping)
      if (!skipImages && customImageFiles.length > 0 && project) {
        setIsUploadingImage(true);
        try {
          const uploadResult = await uploadImages(customImageFiles, project.id, false);
          if (uploadResult.images && uploadResult.images.length > 0) {
            // Use the uploaded image URLs
            fileUrls.push(...uploadResult.images.map(img => img.url));
            // Clean up preview URLs
            customImagePreviews.forEach(preview => {
              if (preview.source === 'file' && preview.url.startsWith('blob:')) {
                URL.revokeObjectURL(preview.url);
              }
            });
            // Clear files after upload
            setCustomImageFiles([]);
          }
        } catch (error) {
          console.error('Failed to upload images:', error);
          // Don't alert on auto-save failures, just log
        } finally {
          setIsUploadingImage(false);
        }
      }

      // Combine all URLs: files first (uploaded), then media (for consistent ordering)
      imageInputUrls = [...fileUrls, ...mediaUrls];

      // Convert to single string if only one image (for backward compatibility)
      // Or keep as array if multiple images
      const imageInput = imageInputUrls.length === 0 
        ? undefined 
        : imageInputUrls.length === 1 
          ? imageInputUrls[0] 
          : imageInputUrls;

      // Update scene settings
      updateSceneSettings(currentSceneIndex, {
        imagePrompt: editedPrompt.trim(),
        negativePrompt: editedNegativePrompt.trim() || undefined,
        customDuration: editedDuration ? Number(editedDuration) : undefined,
        customImageInput: imageInput,
        useSeedFrame: editedUseSeedFrame,
      });
    }, 1000); // 1 second debounce
  }, [editedPrompt, editedNegativePrompt, editedDuration, editedUseSeedFrame, customImageFiles, customImagePreviews, droppedImageUrls, currentSceneIndex, project, updateSceneSettings]);

  // Auto-save on text field changes
  useEffect(() => {
    if (isPromptExpanded && editedPrompt.trim()) {
      autoSave(true); // Skip images for text-only changes
    }
  }, [editedPrompt, editedNegativePrompt, editedDuration, editedUseSeedFrame, isPromptExpanded, autoSave]);

  // Auto-save when images change (with upload)
  useEffect(() => {
    if (isPromptExpanded && (customImageFiles.length > 0 || droppedImageUrls.length > 0 || customImagePreviews.length > 0)) {
      autoSave(false); // Include images
    }
  }, [customImagePreviews.length, droppedImageUrls.length, isPromptExpanded, autoSave]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleCancelEditPrompt = () => {
    // Clear pending saves
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setEditedPrompt(currentScene.imagePrompt);
    setEditedNegativePrompt(currentScene.negativePrompt || '');
    setEditedDuration(currentScene.customDuration || '');
    setEditedUseSeedFrame(currentScene.useSeedFrame !== undefined ? currentScene.useSeedFrame : false);
    
    // Clean up blob URLs
    customImagePreviews.forEach(preview => {
      if (preview.source === 'file' && preview.url.startsWith('blob:')) {
        URL.revokeObjectURL(preview.url);
      }
    });
    
    // Reset to scene's current images
    const imageInputs = currentScene.customImageInput 
      ? (Array.isArray(currentScene.customImageInput) ? currentScene.customImageInput : [currentScene.customImageInput])
      : [];
    setCustomImageFiles([]);
    // Populate droppedImageUrls with saved images
    setDroppedImageUrls(imageInputs.map((url: string) => {
      // Convert serveable URLs back to original paths if needed
      if (url.startsWith('/api/serve-image?path=')) {
        return decodeURIComponent(url.split('path=')[1]);
      }
      return url;
    }));
    // Set previews with properly formatted URLs
    setCustomImagePreviews(imageInputs.map((url: string) => {
      // Convert local paths to serveable URLs for preview
      let previewUrl = url;
      if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/api') && !url.startsWith('blob:')) {
        previewUrl = `/api/serve-image?path=${encodeURIComponent(url)}`;
      }
      return { url: previewUrl, source: 'media' as const };
    }));
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setIsEditingPrompt(false);
    setIsPromptExpanded(false);
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
      {/* Scene Header */}
      <div className="mb-4 pb-4 border-b border-white/20">
        <div className="flex items-start justify-between">
          <div className="flex-1 pr-12">
            <h3 className="text-lg font-semibold text-white">
              Scene {currentSceneIndex + 1}: {currentScene.description.charAt(0).toUpperCase() + currentScene.description.slice(1)}
            </h3>
            <div className="mt-2">
              <div className="flex items-start gap-2">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  {isPromptExpanded ? (
                    <>
                      <span className="text-sm text-white/60 pt-0.5">
                        {currentScene.customDuration || currentScene.suggestedDuration}s •
                      </span>
                      <div className="flex-1 flex flex-col gap-3">
                      {/* Prompt (Required) */}
                      <div>
                        <label className="block text-xs font-medium text-white mb-1">
                          Prompt <span className="text-white/60">*</span>
                        </label>
                        <textarea
                          value={editedPrompt}
                          onChange={(e) => setEditedPrompt(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 text-white placeholder-white/40 resize-none backdrop-blur-sm"
                          rows={3}
                          placeholder="Enter image prompt (required)..."
                          required
                        />
                      </div>

                      {/* Negative Prompt (Optional) */}
                      <div>
                        <label className="block text-xs font-medium text-white mb-1">
                          Negative Prompt <span className="text-white/60 text-xs">(optional)</span>
                        </label>
                        <textarea
                          value={editedNegativePrompt}
                          onChange={(e) => setEditedNegativePrompt(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 text-white placeholder-white/40 resize-y min-h-[2.5rem] backdrop-blur-sm"
                          rows={1}
                          placeholder="What to avoid in the image (optional)..."
                          style={{ height: 'auto' }}
                          onInput={(e) => {
                            const target = e.currentTarget;
                            target.style.height = 'auto';
                            target.style.height = `${target.scrollHeight}px`;
                          }}
                        />
                      </div>

                      {/* Duration and Use Seed Frame - Side by Side */}
                      <div className="flex items-start gap-8">
                        {/* Duration (Optional) */}
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-white mb-1">
                            Duration <span className="text-white/60 text-xs">(optional, up to 10 seconds)</span>
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              max="10"
                              step="0.1"
                              value={editedDuration}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEditedDuration(val === '' ? '' : Number(val));
                              }}
                              className="w-24 px-3 py-2 text-sm bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 text-white placeholder-white/40 backdrop-blur-sm"
                              placeholder="seconds"
                            />
                            <span className="text-xs text-white/60">seconds</span>
                          </div>
                        </div>
                        
                        {/* Use Seed Frame Toggle */}
                        {currentSceneIndex > 0 && (() => {
                          const previousScene = scenes[currentSceneIndex - 1];
                          const selectedSeedFrameIndex = previousScene?.selectedSeedFrameIndex ?? 0;
                          const seedFrame = previousScene?.seedFrames?.[selectedSeedFrameIndex];
                          const seedFrameUrl = seedFrame?.url 
                            ? (seedFrame.url.startsWith('http://') || seedFrame.url.startsWith('https://') || seedFrame.url.startsWith('/api')
                                ? seedFrame.url
                                : `/api/serve-image?path=${encodeURIComponent(seedFrame.localPath || seedFrame.url)}`)
                            : null;
                          
                          return (
                            <div className="flex-1">
                              <label className="block text-xs font-medium text-white mb-1">
                                Use seed frame
                              </label>
                              <div className="flex items-center gap-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={editedUseSeedFrame}
                                    onChange={(e) => setEditedUseSeedFrame(e.target.checked)}
                                    className="w-4 h-4 text-white/60 bg-white/10 border-white/20 rounded focus:ring-white/40 focus:ring-2"
                                  />
                                  <span className="text-xs font-medium text-white/80">
                                    Enable for longer scenes that will be stitched together
                                  </span>
                                </label>
                                {editedUseSeedFrame && seedFrameUrl && (
                                  <div 
                                    className="relative w-12 h-12 rounded border border-white/20 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                                    onDoubleClick={() => setEnlargedSeedFrameUrl(seedFrameUrl)}
                                    title="Double-click to enlarge"
                                  >
                                    <img
                                      src={seedFrameUrl}
                                      alt="Seed frame preview"
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Image Input (Optional) */}
                      <div>
                        <label className="block text-xs font-medium text-white mb-1">
                          Image Input <span className="text-white/60 text-xs">(optional, up to 3 images)</span>
                        </label>
                        <div className="space-y-2">
                          {/* Display uploaded images */}
                          {customImagePreviews.length > 0 && (
                            <div className="grid grid-cols-3 gap-2">
                              {customImagePreviews.map((preview, index) => (
                                <div key={index} className="relative">
                                  <img
                                    src={preview.url}
                                    alt={`Preview ${index + 1}`}
                                    className="w-full h-24 object-cover rounded-lg border border-white/20"
                                  />
                                  <button
                                    onClick={() => handleRemoveImage(index)}
                                    className="absolute -top-2 -right-2 p-1 bg-white/20 text-white rounded-full hover:bg-white/30 transition-colors border border-white/20"
                                    type="button"
                                    title="Remove image"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-1 py-0.5 rounded-b-lg text-center">
                                    {index + 1}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Upload area - show if less than 3 images */}
                          {customImagePreviews.length < 3 && (
                            <label
                              onDragOver={handleFileDragOver}
                              onDragLeave={handleFileDragLeave}
                              onDrop={handleDropZone}
                              className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                                isOverDropZone
                                  ? 'border-white/40 bg-white/10'
                                  : 'border-white/20 hover:bg-white/5'
                              }`}
                            >
                              <Upload className={`w-6 h-6 mb-2 ${isOverDropZone ? 'text-white/80' : 'text-white/40'}`} />
                              <span className={`text-sm text-center px-2 ${isOverDropZone ? 'text-white/80 font-medium' : 'text-white/60'}`}>
                                {isOverDropZone 
                                  ? 'Drop images here' 
                                  : `Click to upload or drag images here (${customImagePreviews.length}/3)`}
                              </span>
                              <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={handleImageFileSelect}
                                className="hidden"
                              />
                            </label>
                          )}

                          {/* Model limitation note */}
                          {customImagePreviews.length > 0 && (
                            <p className="text-xs text-white/60 italic">
                              Note: Depending on the selected model, only the first {customImagePreviews.length > 1 ? 'few' : 'image'} may be used. FLUX models typically support up to 5 images via IP-Adapter, while Gen-4 Image models support 1-3 reference images.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    </>
                  ) : (
                    <>
                      <span className="text-sm text-white/60 pt-0.5">
                        {currentScene.customDuration || currentScene.suggestedDuration}s •
                      </span>
                      <p className="text-sm text-white/60 flex-1">
                        {currentScene.imagePrompt}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex-shrink-0 pl-2">
                  <button
                    onClick={handleTogglePromptExpansion}
                    className="p-1 text-white/60 hover:text-white rounded hover:bg-white/10 transition-colors"
                    title={isPromptExpanded ? "Collapse prompt" : "Expand to edit prompt and settings"}
                  >
                    {isPromptExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Preview Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {!sceneHasImage && !sceneHasVideo && !isGeneratingImage && (
          <div className="flex flex-col items-center justify-center h-full bg-white/5 rounded-lg border-2 border-dashed border-white/20">
            <ImageIcon className="w-12 h-12 text-white/40 mb-4" />
            <p className="text-sm text-white/60 mb-4">
              No image generated yet
            </p>
            <button
              onClick={handleGenerateImage}
              disabled={isGeneratingImage}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-white/20"
            >
              <ImageIcon className="w-4 h-4" />
              Generate Images
            </button>
          </div>
        )}

        {/* Image Generation Grid */}
        {(isGeneratingImage || sceneHasImage) && !sceneHasVideo && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-white">
                {isGeneratingImage ? 'Generating images...' : 'Select an image'}
              </h4>
              {sceneHasImage && (
                <button
                  onClick={handleRegenerateImage}
                  disabled={isGeneratingImage}
                  className="px-3 py-1.5 text-sm bg-white/10 text-white/80 rounded-lg hover:bg-white/20 disabled:opacity-50 transition-colors border border-white/20"
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
                        ? 'border-white ring-2 ring-white/20'
                        : 'border-white/20 hover:border-white/40'
                    } ${isGenerating ? 'cursor-not-allowed' : ''}`}
                  >
                    {isLoading ? (
                      <div className="w-full h-full bg-white/5 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-white/40 animate-spin" />
                      </div>
                    ) : image.localPath ? (
                      <>
                        <img
                          src={`/api/serve-image?path=${encodeURIComponent(image.localPath)}`}
                          alt={`Generated image ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {isSelected && !isGenerating && (
                          <div className="absolute top-2 right-2 bg-white/20 backdrop-blur-sm border border-white/30 text-white rounded-full p-1">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="w-full h-full bg-white/5 flex items-center justify-center">
                        <ImageIcon className="w-8 h-8 text-white/40" />
                      </div>
                    )}
              </div>
                );
              })}
            </div>

            {/* Generate Video Button - Show as soon as one image is ready */}
            {selectedImage && selectedImage.localPath && (
            <button
              onClick={handleGenerateVideo}
              disabled={isGeneratingVideo}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white/20 text-white rounded-lg hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-white/20"
            >
              {isGeneratingVideo ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating Video...
                </>
              ) : (
                <>
                  <Video className="w-5 h-5" />
                  {isGeneratingImage ? (
                    <>Generate Video from Selected Image (other images still generating...)</>
                  ) : (
                    <>Generate Video from Selected Image</>
                  )}
                </>
              )}
            </button>
            )}
          </div>
        )}

        {sceneHasVideo && (
          <div className="space-y-4">
            {/* Video Preview */}
            <div className="relative">
              <VideoPlayer
                src={videoUrl}
                className="w-full"
              />
              {/* Regenerate Button */}
              <button
                onClick={handleRegenerateVideo}
                disabled={isGeneratingVideo}
                className="absolute top-4 right-4 px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-white/20 backdrop-blur-sm flex items-center gap-2"
                title="Regenerate video"
              >
                {isGeneratingVideo ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <Video className="w-4 h-4" />
                    Regenerate
                  </>
                )}
              </button>
            </div>

            {/* Seed Frame Selection */}
            {seedFrames.length > 0 && currentSceneIndex < 4 && (
              <div className="mt-6 p-4 bg-white/5 rounded-lg border border-white/20">
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
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white/20 text-white rounded-lg hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-white/20"
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

      {/* Enlarged Seed Frame Modal */}
      {enlargedSeedFrameUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setEnlargedSeedFrameUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full h-full flex items-center justify-center">
            <img
              src={enlargedSeedFrameUrl}
              alt="Seed frame (enlarged)"
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setEnlargedSeedFrameUrl(null)}
              className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
