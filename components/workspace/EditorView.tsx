'use client';

import { useProjectStore, useSceneStore, useUIStore } from '@/lib/state/project-store';
import VideoPlayer from './VideoPlayer';
import SeedFrameSelector from './SeedFrameSelector';
import { Loader2, Image as ImageIcon, Video, CheckCircle2, X, Edit2, Save, X as XIcon, Upload, XCircle, ChevronUp, ChevronDown, Trash2, Copy } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { generateImage, pollImageStatus, generateVideo, pollVideoStatus, uploadImageToS3, extractFrames, uploadImages, deleteGeneratedImage } from '@/lib/api-client';
import { GeneratedImage, SeedFrame } from '@/lib/types';
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
  } = useProjectStore();

  const {
    scenes,
    setSceneStatus,
    addGeneratedImage,
    selectImage,
    deleteGeneratedImage: removeGeneratedImage,
    setVideoPath,
    setSeedFrames,
    selectSeedFrame,
    updateScenePrompt,
    updateSceneSettings,
    duplicateScene,
  } = useSceneStore();

  const {
    setViewMode,
    setCurrentSceneIndex,
    mediaDrawer,
    addChatMessage,
  } = useUIStore();
  
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [generatingImages, setGeneratingImages] = useState<GeneratingImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<GeneratedImage | null>(null);
  const [isExtractingFrames, setIsExtractingFrames] = useState(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [editedVideoPrompt, setEditedVideoPrompt] = useState('');
  const [editedNegativePrompt, setEditedNegativePrompt] = useState('');
  const [editedDuration, setEditedDuration] = useState<number | ''>('');
  const [editedUseSeedFrame, setEditedUseSeedFrame] = useState<boolean>(false);
  const [customImageFiles, setCustomImageFiles] = useState<File[]>([]);
  const [customImagePreviews, setCustomImagePreviews] = useState<Array<{ url: string; source: 'file' | 'media' | 'url' } | null>>([]);
  const [droppedImageUrls, setDroppedImageUrls] = useState<string[]>([]); // Store original URLs from dropped media
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [enlargedSeedFrameUrl, setEnlargedSeedFrameUrl] = useState<string | null>(null);
  const [seedImageId, setSeedImageId] = useState<string | null>(null);
  const [isDuplicating, setIsDuplicating] = useState(false);

  const handleDuplicateScene = async () => {
    if (!project || isDuplicating) return;

    setIsDuplicating(true);
    try {
      addChatMessage({
        role: 'agent',
        content: `Duplicating Scene ${currentSceneIndex + 1}...`,
        type: 'status',
      });

      await duplicateScene(currentSceneIndex);

      addChatMessage({
        role: 'agent',
        content: `✓ Scene ${currentSceneIndex + 1} duplicated successfully`,
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
      setIsDuplicating(false);
    }
  };

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
  // Only count images that aren't used for composition (background, composite, reference)
  const regularImages = sceneImages.filter((img: GeneratedImage) => {
    return img.id !== currentScene.backgroundImageId &&
           img.id !== currentScene.compositeImageId &&
           img.id !== currentScene.referenceImageId;
  });
  const sceneHasImage = regularImages.length > 0;
  const selectedImage = sceneImages.find(img => img.id === (selectedImageId || sceneState?.selectedImageId));
  const sceneHasVideo = !!sceneState?.videoLocalPath;
  const seedFrames = sceneState?.seedFrames || [];

  // Update selected image ID when scene state changes
  useEffect(() => {
    if (sceneState?.selectedImageId) {
      setSelectedImageId(sceneState.selectedImageId);
    }
  }, [sceneState?.selectedImageId]);

  // Initialize edited fields when scene changes - load current scene's saved values
  useEffect(() => {
    if (currentScene) {
      setEditedPrompt(currentScene.imagePrompt);
      setEditedVideoPrompt(currentScene.videoPrompt || currentScene.imagePrompt); // Fallback to imagePrompt for backward compatibility
      setEditedNegativePrompt(currentScene.negativePrompt || '');
      setEditedDuration(currentScene.customDuration || '');
      // Default to false (opt-in for longer scenes), or use saved value
      setEditedUseSeedFrame(currentScene.useSeedFrame !== undefined ? currentScene.useSeedFrame : false);
      // Initialize custom images - support both single string (legacy) and array
      const imageInputs = currentScene.customImageInput
        ? (Array.isArray(currentScene.customImageInput) ? currentScene.customImageInput : [currentScene.customImageInput])
        : [];
      setCustomImageFiles([]);
      setDroppedImageUrls([]);
      setCustomImagePreviews(imageInputs.map(url => ({ url, source: 'media' as const })));
    }
  }, [currentSceneIndex, currentScene?.imagePrompt, currentScene?.videoPrompt, currentScene?.negativePrompt, currentScene?.customDuration, currentScene?.customImageInput, currentScene?.useSeedFrame]);

  // Auto-populate seed image (slot 0) when useSeedFrame is checked and we have a previous scene
  useEffect(() => {
    if (currentSceneIndex > 0 && currentScene?.useSeedFrame) {
      const previousScene = scenes[currentSceneIndex - 1];
      const selectedSeedFrameIndex = previousScene?.selectedSeedFrameIndex ?? 0;
      const seedFrame = previousScene?.seedFrames?.[selectedSeedFrameIndex];

      if (seedFrame) {
        const seedFrameUrl = seedFrame.url.startsWith('http://') || seedFrame.url.startsWith('https://') || seedFrame.url.startsWith('/api')
          ? seedFrame.url
          : `/api/serve-image?path=${encodeURIComponent(seedFrame.localPath || seedFrame.url)}`;

        // Only auto-populate if slot 0 is empty or was auto-populated before
        setCustomImagePreviews(prev => {
          const newPreviews = [...prev];
          // Auto-populate if empty or if it's a URL (likely auto-populated before)
          if (!newPreviews[0] || newPreviews[0].source === 'url') {
            newPreviews[0] = {
              url: seedFrameUrl,
              source: 'url' as const
            };
            console.log('[EditorView] Auto-populated seed image from previous scene on scene change');
          }
          return newPreviews;
        });
      }
    } else if (currentSceneIndex === 0 || !currentScene?.useSeedFrame) {
      // Clear auto-populated seed image for scene 0 or when useSeedFrame is false
      setCustomImagePreviews(prev => {
        const newPreviews = [...prev];
        if (newPreviews[0]?.source === 'url') {
          newPreviews[0] = null;
          console.log('[EditorView] Cleared auto-populated seed image');
        }
        return newPreviews;
      });
    }
  }, [currentSceneIndex, currentScene?.useSeedFrame, scenes]);

  const handleGenerateImage = async () => {
    if (!project?.id) return;

    setIsGeneratingImage(true);
    setGeneratingImages([]);
    
    // Check for selected image BEFORE clearing it (for use as seed)
    const currentSelectedImageBeforeClear = selectedImage || (sceneState?.selectedImageId 
      ? sceneImages.find((img: GeneratedImage) => img.id === sceneState.selectedImageId)
      : null);
    
    // Only clear selectedImageId if we're not using it as seed
    const preserveSelection = currentSelectedImageBeforeClear && currentSelectedImageBeforeClear.localPath;
    if (!preserveSelection) {
      setSelectedImageId(null);
    }

    // Initialize 3 generating image slots
    const initialGenerating: GeneratingImage[] = Array(3).fill(null).map(() => ({
      predictionId: '',
      status: 'starting',
    }));
    setGeneratingImages(initialGenerating);

    try {
      setSceneStatus(currentSceneIndex, 'generating_image');

      // Get reference images from project (uploaded images for object consistency) - limit to 3
      let referenceImageUrls = (project.referenceImageUrls || []).slice(0, 3);

      // Get seed frame from previous scene (for Scenes 1-4, to use as seed image for image-to-image generation)
      let seedImageUrl: string | undefined = undefined;
      let seedFrameUrl: string | undefined = undefined;
      let currentSeedImageId: string | undefined = undefined;
      
      // Check if user wants to use seed image (from model parameters)
      const useSeedImage = currentScene?.modelParameters?.useSeedImage !== false; // Default to true

      // Priority: Media drawer seed image > Custom image input > Selected image > seed frame > reference image
      // First, check if a seed image is selected in the media drawer (purple selection)
      if (useSeedImage && mediaDrawer.seedImageId) {
        let foundSeedImage: any = null;

        // Check generated images across all scenes
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
          currentSeedImageId = foundSeedImage.id;
          setSeedImageId(foundSeedImage.id); // Store for UI highlighting
          console.log(`[EditorView] Scene ${currentSceneIndex}: Using media drawer seed image for i2i:`, seedImageUrl?.substring(0, 80) + '...');
        }
      } else if (useSeedImage && currentSelectedImageBeforeClear && currentSelectedImageBeforeClear.localPath) {
        // Use selected image as seed image (highest priority)
        let formattedUrl = currentSelectedImageBeforeClear.localPath;
        if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://') && !formattedUrl.startsWith('/api')) {
          formattedUrl = `/api/serve-image?path=${encodeURIComponent(currentSelectedImageBeforeClear.localPath)}`;
        }
        seedImageUrl = formattedUrl;
        currentSeedImageId = currentSelectedImageBeforeClear.id;
        setSeedImageId(currentSelectedImageBeforeClear.id); // Store for UI highlighting
        console.log(`[EditorView] Scene ${currentSceneIndex}: Using selected image as seed image:`, seedImageUrl.substring(0, 80) + '...');
      } else {
        // Handle custom image inputs (can be single string or array)
        const customImageInputs = currentScene.customImageInput
          ? (Array.isArray(currentScene.customImageInput) ? currentScene.customImageInput : [currentScene.customImageInput])
          : [];

        if (customImageInputs.length > 0) {
          // Use first custom image as seed image (for image-to-image)
          seedImageUrl = customImageInputs[0];
          // If it's a local path, convert to serveable URL
          if (!seedImageUrl.startsWith('http://') && !seedImageUrl.startsWith('https://') && !seedImageUrl.startsWith('/api')) {
            seedImageUrl = `/api/serve-image?path=${encodeURIComponent(seedImageUrl)}`;
          }
          setSeedImageId(null); // Custom images aren't from the grid, so no image ID to highlight
          console.log(`[EditorView] Scene ${currentSceneIndex}: Using custom image input as seed image:`, seedImageUrl.substring(0, 80) + '...');
          
          // Add all custom images to reference images for IP-Adapter
          const customImageUrls = customImageInputs.map(url => {
            if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/api')) {
              return `/api/serve-image?path=${encodeURIComponent(url)}`;
            }
            return url;
          });
          referenceImageUrls = [...customImageUrls, ...referenceImageUrls].slice(0, 3);
          console.log(`[EditorView] Scene ${currentSceneIndex}: Using ${Math.min(customImageUrls.length, 3)} custom image(s) as reference images via IP-Adapter`);
        } else if (currentSceneIndex > 0) {
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
      }

      // Generate 3 images in parallel
      const imagePromises = Array(3).fill(null).map(async (_, index) => {
        try {
          // Create prediction
          // Strategy: Use seed frame as seed image for image-to-image generation
          // For Scene 0: Use reference image as seed image if available
          // For Scenes 1-4: Use seed frame from previous scene as seed image
          const response = await generateImage({
            prompt: currentScene.imagePrompt,
            projectId: project.id,
            sceneIndex: currentSceneIndex,
            seedImage: seedImageUrl, // Custom image input, seed frame from previous scene, or reference image for Scene 0
            referenceImageUrls, // Reference images via IP-Adapter (for object consistency)
            seedFrame: seedFrameUrl, // Seed frame URL (same as seedImage for scenes 1-4, unless custom image input is used)
            negativePrompt: currentScene.negativePrompt, // Optional negative prompt
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

            // Auto-select first image when it's generated (unless we preserved a previous selection)
            if (index === 0 && !preserveSelection) {
              setSelectedImageId(statusResponse.image.id);
              selectImage(currentSceneIndex, statusResponse.image.id);
            } else if (preserveSelection && currentSeedImageId === currentSelectedImageBeforeClear?.id) {
              // Restore the selected image ID if we preserved it
              setSelectedImageId(currentSelectedImageBeforeClear.id);
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
    // When user selects an image, it becomes the seed image for next generation
    const selectedImg = sceneImages.find((img: GeneratedImage) => img.id === imageId);
    if (selectedImg && selectedImg.localPath) {
      setSeedImageId(imageId);
    }
  };

  const handleRegenerateVideo = async () => {
    // Regenerate video using the same logic as handleGenerateVideo
    await handleGenerateVideo();
  };

  const handleGenerateVideo = async () => {
    if (!project?.id) return;

    setIsGeneratingVideo(true);
    try {
      setSceneStatus(currentSceneIndex, 'generating_video');

      // Get seed frame from previous scene (if available and not Scene 0)
      // Seed frame will be used as the base image for continuity
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
            const localPath = selectedFrame.localPath || selectedFrame.url;
            try {
              const { s3Url: frameS3Url } = await uploadImageToS3(localPath, project.id);
              seedFrameUrl = frameS3Url;
            } catch (error) {
              console.error('Error uploading seed frame:', error);
              throw new Error('Failed to upload seed frame. Please try again.');
            }
          }
        }
      }

      // Use seed frame as base image if available (for continuity), otherwise use generated image
      let imageToUse: string | undefined;
      let baseImageSource: string;

      if (seedFrameUrl) {
        imageToUse = seedFrameUrl;
        baseImageSource = 'seed frame';
      } else {
        if (!selectedImage) {
          throw new Error('Please generate or select an image first');
        }
        imageToUse = selectedImage.localPath || selectedImage.url;
        baseImageSource = 'generated image';
      }

      console.log(`[EditorView] Scene ${currentSceneIndex}: Using ${baseImageSource} for video generation`);

      // Upload image to S3 if it's a local path, otherwise use the URL directly
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

      // Handle last frame (slot index 4) if provided
      // NOTE: For Google Veo models, this enables "interpolation mode"
      // - Standard mode: Uses only the starting frame (seed frame or generated image)
      // - Interpolation mode: Uses both starting frame AND last_frame to generate transition video
      // - These modes are mutually exclusive - you use one OR the other
      let lastFrameUrl: string | undefined;
      const lastFramePreview = customImagePreviews[4]; // Slot 4 is the last frame
      if (lastFramePreview) {
        // Upload last frame to S3 if it's a local file
        try {
          if (lastFramePreview.source === 'file') {
            // Find the file for slot 4
            let fileIndex = 0;
            for (let i = 0; i < 4; i++) {
              if (customImagePreviews[i]?.source === 'file') {
                fileIndex++;
              }
            }
            const lastFrameFile = customImageFiles[fileIndex];
            if (lastFrameFile) {
              // Upload the file using uploadImages
              const uploadResult = await uploadImages([lastFrameFile], project.id, false);
              if (uploadResult.images && uploadResult.images.length > 0) {
                lastFrameUrl = uploadResult.images[0].url;
                console.log('[EditorView] Uploaded last frame to S3:', lastFrameUrl.substring(0, 80) + '...');
              }
            }
          } else if (lastFramePreview.url.startsWith('http://') || lastFramePreview.url.startsWith('https://')) {
            lastFrameUrl = lastFramePreview.url;
          } else if (lastFramePreview.url.startsWith('/api/serve-image')) {
            // Extract the local path and upload it
            const localPath = decodeURIComponent(lastFramePreview.url.split('path=')[1]);
            const uploadResult = await uploadImageToS3(localPath, project.id);
            lastFrameUrl = uploadResult.s3Url;
            console.log('[EditorView] Uploaded last frame (from local path) to S3:', lastFrameUrl.substring(0, 80) + '...');
          }
        } catch (error) {
          console.error('Error uploading last frame:', error);
          // Don't throw - continue without last frame
        }
      }

      // Generate video
      // Get model parameters from current scene and add last_frame if provided
      // NOTE: When last_frame is provided, we're using "interpolation mode"
      // where the model generates a transition from the starting frame to the last_frame
      const modelParameters = {
        ...(currentScene.modelParameters || {}),
        ...(lastFrameUrl ? { last_frame: lastFrameUrl } : {}),
      };

      console.log('[EditorView] Video generation mode:', lastFrameUrl ? 'Interpolation (start → end)' : 'Standard (from start frame)');
      console.log('[EditorView] Video generation parameters:', {
        baseImage: s3Url,
        seedFrame: seedFrameUrl,
        lastFrame: lastFrameUrl,
        mode: lastFrameUrl ? 'interpolation' : 'standard',
      });

      const videoResponse = await generateVideo(
        s3Url, // Base image (seed frame if available, otherwise generated image)
        currentScene.videoPrompt || currentScene.imagePrompt, // Fallback to imagePrompt for backward compatibility
        project.id,
        currentSceneIndex,
        seedFrameUrl, // Pass seed frame URL for reference
        currentScene.customDuration, // Pass custom duration if set
        undefined, // subsceneIndex not used
        modelParameters // Pass model-specific parameters (including last_frame if provided)
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
    // Regenerate - selected image will be used as seed if available
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

    // Move to next scene and switch to images tab (seed frames already extracted after video generation)
    const nextSceneIndex = currentSceneIndex + 1;
    setCurrentSceneIndex(nextSceneIndex);
    setViewMode('images'); // Switch to images tab for next scene
  };

  const handleSelectSeedFrame = (frameIndex: number) => {
    selectSeedFrame(currentSceneIndex, frameIndex);
  };

  const handleTogglePromptExpansion = () => {
    if (!isPromptExpanded) {
      // Expanding: Initialize edit fields and enter edit mode
      setEditedPrompt(currentScene.imagePrompt);
      setEditedVideoPrompt(currentScene.videoPrompt || currentScene.imagePrompt); // Fallback to imagePrompt for backward compatibility
      setEditedNegativePrompt(currentScene.negativePrompt || '');
      setEditedDuration(currentScene.customDuration || '');
      // Initialize custom images - support both single string (legacy) and array
      const imageInputs = currentScene.customImageInput 
        ? (Array.isArray(currentScene.customImageInput) ? currentScene.customImageInput : [currentScene.customImageInput])
        : [];
      setCustomImageFiles([]);
      setDroppedImageUrls([]);
      setCustomImagePreviews(imageInputs.map(url => ({ url, source: 'media' as const })));
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
    if (!preview) return;

    // Revoke blob URL if it's from a file
    if (preview.source === 'file' && preview.url.startsWith('blob:')) {
      URL.revokeObjectURL(preview.url);
    }

    // If it was a file, remove from files array
    if (preview.source === 'file') {
      // Find the corresponding file index
      let fileIndex = 0;
      for (let i = 0; i < index; i++) {
        if (customImagePreviews[i]?.source === 'file') {
          fileIndex++;
        }
      }
      setCustomImageFiles(prev => prev.filter((_, i) => i !== fileIndex));
    } else {
      // If it was from media drawer, remove from dropped URLs
      const droppedIndex = customImagePreviews.slice(0, index).filter(p => p?.source === 'media').length;
      setDroppedImageUrls(prev => prev.filter((_, i) => i !== droppedIndex));
    }

    // Set slot to null instead of removing (maintains 4-slot structure)
    setCustomImagePreviews(prev => {
      const newPreviews = [...prev];
      newPreviews[index] = null as any;
      return newPreviews;
    });
  };

  const handleDeleteGeneratedImage = async (image: GeneratedImage) => {
    try {
      // Call API to delete the image files
      await deleteGeneratedImage(image.id, image.localPath, image.s3Key);

      // Remove from state
      removeGeneratedImage(currentSceneIndex, image.id);

      // Clear seed image if it was the deleted image
      if (seedImageId === image.id) {
        setSeedImageId(null);
      }

      console.log(`[EditorView] Deleted image: ${image.id}`);
    } catch (error) {
      console.error(`[EditorView] Failed to delete image:`, error);
      // Could show a toast notification here, but for now just log
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
        const image = scene.generatedImages.find(img => img.id === itemId);
        if (image) {
          // Prefer localPath over url for consistency
          return image.localPath || image.url || null;
        }
      }
    }

    // Search in seed frames
    for (const scene of scenes) {
      if (scene.seedFrames) {
        const frame = scene.seedFrames.find(f => f.id === itemId);
        if (frame) {
          // Prefer localPath over url
          return frame.localPath || frame.url || null;
        }
      }
    }

    // Search in uploaded images (Brand Assets)
    if (project?.uploadedImages) {
      // Check original images
      const uploadedImage = project.uploadedImages.find(img => img.id === itemId);
      if (uploadedImage) {
        return uploadedImage.localPath || uploadedImage.url || null;
      }

      // Check processed versions
      for (const uploadedImage of project.uploadedImages) {
        if (uploadedImage.processedVersions) {
          const processed = uploadedImage.processedVersions.find(p => p.id === itemId);
          if (processed) {
            return processed.localPath || processed.url || null;
          }
        }
      }
    }

    // Search in background images
    if (project?.backgroundImages) {
      // Check original background images
      const backgroundImage = project.backgroundImages.find(img => img.id === itemId);
      if (backgroundImage) {
        return backgroundImage.localPath || backgroundImage.url || null;
      }

      // Check processed versions of backgrounds
      for (const backgroundImage of project.backgroundImages) {
        if (backgroundImage.processedVersions) {
          const processed = backgroundImage.processedVersions.find(p => p.id === itemId);
          if (processed) {
            return processed.localPath || processed.url || null;
          }
        }
      }
    }

    return null;
  };

  // Handle media drop from media drawer
  const handleMediaDropOnImageInput = (itemId: string, itemType: 'image' | 'video' | 'frame') => {
    console.log('[EditorView] Media dropped:', { itemId, itemType });

    if (itemType === 'video') {
      alert('Videos cannot be used as image input. Please use an image or frame.');
      return;
    }

    // Check if we've reached the limit (4 slots: 1 seed + 3 reference)
    const filledSlots = customImagePreviews.filter(p => p !== null && p !== undefined).length;
    if (filledSlots >= 4) {
      alert('You can only add up to 4 images (1 seed + 3 reference).');
      return;
    }

    const imageUrl = findImageUrlFromItem(itemId, itemType);
    console.log('[EditorView] Found image URL:', imageUrl);

    if (imageUrl) {
      // Store the original URL/path for saving
      setDroppedImageUrls(prev => [...prev, imageUrl]);

      // Set as custom image preview
      // If it's a local path, convert to serveable URL for preview
      let previewUrl = imageUrl;
      if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://') && !imageUrl.startsWith('/api') && !imageUrl.startsWith('blob:')) {
        previewUrl = `/api/serve-image?path=${encodeURIComponent(imageUrl)}`;
      }

      console.log('[EditorView] Preview URL:', previewUrl);

      // Find first empty slot
      const newPreviews = [...customImagePreviews];
      for (let i = 0; i < 4; i++) {
        if (!newPreviews[i]) {
          newPreviews[i] = { url: previewUrl, source: 'media' };
          console.log('[EditorView] Set preview in slot', i, newPreviews[i]);
          setCustomImagePreviews(newPreviews);
          return;
        }
      }

      // If all slots are filled (shouldn't reach here due to check above)
      alert('All image slots are filled. Remove an image first.');
    } else {
      console.error('[EditorView] Could not find image with ID:', itemId);
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

    // Check if adding these files would exceed the limit (4 slots)
    const currentCount = customImagePreviews.filter(p => p !== null && p !== undefined).length;
    if (currentCount + files.length > 4) {
      alert(`You can only add up to 4 images (1 seed + 3 reference). Currently have ${currentCount}, trying to add ${files.length}.`);
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
      // Find empty slots and fill them
      const newPreviews = [...customImagePreviews];
      const newFiles = [...customImageFiles];

      let fileIdx = 0;
      for (let slotIdx = 0; slotIdx < 4 && fileIdx < validFiles.length; slotIdx++) {
        if (!newPreviews[slotIdx]) {
          newPreviews[slotIdx] = previews[fileIdx];
          newFiles.push(validFiles[fileIdx]);
          fileIdx++;
        }
      }

      setCustomImagePreviews(newPreviews);
      setCustomImageFiles(newFiles);
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
      return; // Don't save if image prompt is empty
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

      // Get URLs from media drawer drops
      if (droppedImageUrls.length > 0) {
        mediaUrls.push(...droppedImageUrls);
      } else {
        // Get URLs from existing media previews
        customImagePreviews
          .filter((p): p is { url: string; source: 'file' | 'media' } => p !== null && p.source === 'media')
          .forEach(preview => {
            // Extract original URL from preview (remove /api/serve-image wrapper if present)
            const url = preview.url.startsWith('/api/serve-image?path=')
              ? decodeURIComponent(preview.url.split('path=')[1])
              : preview.url;
            mediaUrls.push(url);
          });
      }

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
              if (preview && preview.source === 'file' && preview.url.startsWith('blob:')) {
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
        videoPrompt: editedVideoPrompt.trim() || editedPrompt.trim(), // Fallback to imagePrompt if videoPrompt is empty
        negativePrompt: editedNegativePrompt.trim() || undefined,
        customDuration: editedDuration ? Number(editedDuration) : undefined,
        customImageInput: imageInput,
        useSeedFrame: editedUseSeedFrame,
      });
    }, 1000); // 1 second debounce
  }, [editedPrompt, editedVideoPrompt, editedNegativePrompt, editedDuration, editedUseSeedFrame, customImageFiles, customImagePreviews, droppedImageUrls, currentSceneIndex, project, updateSceneSettings]);

  // Auto-save on text field changes
  useEffect(() => {
    if (isPromptExpanded && editedPrompt.trim()) {
      autoSave(true); // Skip images for text-only changes
    }
  }, [editedPrompt, editedVideoPrompt, editedNegativePrompt, editedDuration, editedUseSeedFrame, isPromptExpanded, autoSave]);

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
      if (preview && preview.source === 'file' && preview.url.startsWith('blob:')) {
        URL.revokeObjectURL(preview.url);
      }
    });
    
    // Reset to scene's current images
    const imageInputs = currentScene.customImageInput 
      ? (Array.isArray(currentScene.customImageInput) ? currentScene.customImageInput : [currentScene.customImageInput])
      : [];
    setCustomImageFiles([]);
    setDroppedImageUrls([]);
    setCustomImagePreviews(imageInputs.map(url => ({ url, source: 'media' as const })));
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setIsEditingPrompt(false);
    setIsPromptExpanded(false);
  };

  // Combine generated images with currently generating ones
  // Filter out images used for scene composition (background, composite, reference)
  const filteredSceneImages = sceneImages.filter((img: GeneratedImage) => {
    // Exclude background images
    if (currentScene.backgroundImageId === img.id) return false;
    // Exclude composite images
    if (currentScene.compositeImageId === img.id) return false;
    // Exclude reference images
    if (currentScene.referenceImageId === img.id) return false;
    return true;
  });

  const allImages = [...filteredSceneImages];
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
    <div className="h-full flex flex-col bg-black">
      {/* Scene Selector */}
      <div className="px-6 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white/80 uppercase tracking-wide">Current Scene:</span>
          <div className="flex gap-2">
            {project.storyboard.map((scene, index) => (
              <button
                key={scene.id}
                onClick={() => setCurrentSceneIndex(index)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  index === currentSceneIndex
                    ? 'bg-white/20 text-white'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                Scene {scene.order % 1 === 0 ? scene.order + 1 : (Math.floor(scene.order) + 1) + '.' + Math.round((scene.order % 1) * 10)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        {/* Scene Header */}
        <div className="mb-4 pb-4 border-b border-white/20">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-white">
              Scene {currentScene.order % 1 === 0 ? currentScene.order + 1 : (Math.floor(currentScene.order) + 1) + '.' + Math.round((currentScene.order % 1) * 10)}: {currentScene.description}
            </h3>
            <button
              onClick={handleDuplicateScene}
              disabled={isDuplicating}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/10 text-white/80 rounded-lg hover:bg-white/20 disabled:opacity-50 transition-colors border border-white/20"
              title="Duplicate this scene"
            >
              {isDuplicating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Duplicating...
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Duplicate Scene
                </>
              )}
            </button>
          </div>

          {/* Prompt Editor - Always Expanded */}
          <div className="mt-4 space-y-3">
            {/* Video Prompt */}
            <div>
              <label className="block text-xs font-medium text-white mb-1">
                Video Prompt <span className="text-white/60">*</span>
              </label>
              <textarea
                value={editedVideoPrompt}
                onChange={(e) => setEditedVideoPrompt(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 text-white placeholder-white/40 resize-none backdrop-blur-sm"
                rows={4}
                placeholder="Enter video prompt describing motion/action (required)..."
                required
              />
            </div>

            {/* Negative Prompt */}
            <div>
              <label className="block text-xs font-medium text-white mb-1">
                Negative Prompt <span className="text-white/60 text-xs">(optional)</span>
              </label>
              <textarea
                value={editedNegativePrompt}
                onChange={(e) => setEditedNegativePrompt(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 text-white placeholder-white/40 resize-y min-h-[2.5rem] backdrop-blur-sm"
                rows={2}
                placeholder="What to avoid in the video (optional)..."
              />
            </div>

            {/* Duration and Use Seed Frame */}
            <div className="flex items-start gap-4">
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
                    placeholder="8"
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
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editedUseSeedFrame}
                        onChange={(e) => {
                          const isChecked = e.target.checked;
                          setEditedUseSeedFrame(isChecked);

                          // Auto-populate seed image (slot 0) when checkbox is checked
                          if (isChecked && seedFrameUrl) {
                            const newPreviews = [...customImagePreviews];
                            newPreviews[0] = {
                              url: seedFrameUrl,
                              source: 'url' as const
                            };
                            setCustomImagePreviews(newPreviews);
                            console.log('[EditorView] Auto-populated seed image from previous scene seed frame');
                          } else if (!isChecked) {
                            // Clear seed image slot when unchecked (only if auto-populated)
                            const newPreviews = [...customImagePreviews];
                            if (newPreviews[0]?.source === 'url') {
                              newPreviews[0] = null;
                              setCustomImagePreviews(newPreviews);
                              console.log('[EditorView] Cleared auto-populated seed image slot');
                            }
                          }
                        }}
                        className="w-4 h-4 text-white/60 bg-white/10 border-white/20 rounded focus:ring-white/40 focus:ring-2"
                      />
                      <span className="text-xs font-medium text-white/80">
                        Use seed frame for continuity
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
                );
              })()}
            </div>

            {/* Image Input - Seed, Reference, and Last Frame in same row */}
            <div className="space-y-2">
              {/* Labels Row */}
              <div className="grid grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs font-medium text-white">
                    Seed Image <span className="text-white/60 text-xs">(First frame)</span>
                  </label>
                </div>
                <div className="col-span-3">
                  <label className="block text-xs font-medium text-white">
                    Reference Images <span className="text-white/60 text-xs">(Up to 3 references)</span>
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-medium text-white">
                    Last Frame <span className="text-white/60 text-xs">(Interpolation mode)</span>
                  </label>
                  <p className="text-xs text-white/40 mt-0.5">
                    Optional: Creates transition from start to end frame
                  </p>
                </div>
              </div>

              {/* Images Row */}
              <div className="grid grid-cols-5 gap-3">
                {/* Seed Image - Column 1 */}
                <div>
                  {(() => {
                    const slotIndex = 0;
                    const preview = customImagePreviews[slotIndex];

                    return (
                      <div className="relative">
                        <label
                          onDragOver={handleFileDragOver}
                          onDragLeave={handleFileDragLeave}
                          onDrop={handleDropZone}
                          className={`block w-full aspect-video rounded-lg border-2 border-dashed cursor-pointer transition-colors overflow-hidden ${
                            isOverDropZone
                              ? 'border-blue-400 bg-blue-500/10'
                              : 'border-blue-400/40 hover:border-blue-400/60 bg-blue-500/5'
                          }`}
                        >
                          {preview ? (
                            <>
                              <img
                                src={preview.url}
                                alt="Seed image"
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleRemoveImage(slotIndex);
                                }}
                                className="absolute -top-2 -right-2 p-1 bg-red-500/80 text-white rounded-full hover:bg-red-600 transition-colors border border-red-400/50 z-10"
                                type="button"
                                title="Remove image"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center p-2">
                              <Upload className="w-6 h-6 text-blue-400/50 mb-1" />
                              <span className="text-xs text-blue-400/70 text-center">Drop or click to upload</span>
                            </div>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (file.size > 10 * 1024 * 1024) {
                                  alert(`${file.name} is too large (max 10MB).`);
                                  return;
                                }
                                const previewUrl = URL.createObjectURL(file);
                                const newPreviews = [...customImagePreviews];
                                const newFiles = [...customImageFiles];

                                let fileIndex = 0;
                                for (let i = 0; i < slotIndex; i++) {
                                  if (customImagePreviews[i]?.source === 'file') {
                                    fileIndex++;
                                  }
                                }

                                newPreviews[slotIndex] = { url: previewUrl, source: 'file' };
                                newFiles.splice(fileIndex, 0, file);

                                setCustomImagePreviews(newPreviews);
                                setCustomImageFiles(newFiles);
                              }
                              e.target.value = '';
                            }}
                            className="hidden"
                          />
                        </label>
                      </div>
                    );
                  })()}
                </div>

                {/* Reference Images - Columns 2-4 */}
                {[1, 2, 3].map((slotIndex) => {
                  const preview = customImagePreviews[slotIndex];

                  return (
                    <div key={`slot-${slotIndex}`} className="relative">
                        <label
                          onDragOver={handleFileDragOver}
                          onDragLeave={handleFileDragLeave}
                          onDrop={handleDropZone}
                          className={`block w-full aspect-video rounded-lg border-2 border-dashed cursor-pointer transition-colors overflow-hidden ${
                            isOverDropZone
                              ? 'border-white/40 bg-white/10'
                              : 'border-white/20 hover:border-white/30 bg-white/5'
                          }`}
                        >
                          {preview ? (
                            <>
                              <img
                                src={preview.url}
                                alt={`Reference image ${slotIndex}`}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleRemoveImage(slotIndex);
                                }}
                                className="absolute -top-2 -right-2 p-1 bg-red-500/80 text-white rounded-full hover:bg-red-600 transition-colors border border-red-400/50 z-10"
                                type="button"
                                title="Remove image"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center p-2">
                              <Upload className="w-6 h-6 text-white/30 mb-1" />
                              <span className="text-xs text-white/40 text-center">Ref {slotIndex}</span>
                            </div>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (file.size > 10 * 1024 * 1024) {
                                  alert(`${file.name} is too large (max 10MB).`);
                                  return;
                                }
                                const previewUrl = URL.createObjectURL(file);
                                const newPreviews = [...customImagePreviews];
                                const newFiles = [...customImageFiles];

                                let fileIndex = 0;
                                for (let i = 0; i < slotIndex; i++) {
                                  if (customImagePreviews[i]?.source === 'file') {
                                    fileIndex++;
                                  }
                                }

                                newPreviews[slotIndex] = { url: previewUrl, source: 'file' };
                                newFiles.splice(fileIndex, 0, file);

                                setCustomImagePreviews(newPreviews);
                                setCustomImageFiles(newFiles);
                              }
                              e.target.value = '';
                            }}
                            className="hidden"
                          />
                        </label>
                        <div className="absolute bottom-1 left-1 right-1 text-center">
                          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-white/10 text-white/60">
                            Ref {slotIndex}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                {/* Last Frame - Column 5 */}
                <div>
                  {(() => {
                    const slotIndex = 4;
                    const preview = customImagePreviews[slotIndex];

                    return (
                      <div className="relative">
                        <label
                          onDragOver={handleFileDragOver}
                          onDragLeave={handleFileDragLeave}
                          onDrop={handleDropZone}
                          className={`block w-full aspect-video rounded-lg border-2 border-dashed cursor-pointer transition-colors overflow-hidden ${
                            isOverDropZone
                              ? 'border-purple-400 bg-purple-500/10'
                              : 'border-purple-400/40 hover:border-purple-400/60 bg-purple-500/5'
                          }`}
                        >
                          {preview ? (
                            <>
                              <img
                                src={preview.url}
                                alt="Last frame"
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleRemoveImage(slotIndex);
                                }}
                                className="absolute -top-2 -right-2 p-1 bg-red-500/80 text-white rounded-full hover:bg-red-600 transition-colors border border-red-400/50 z-10"
                                type="button"
                                title="Remove image"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center p-2">
                              <Upload className="w-6 h-6 text-purple-400/50 mb-1" />
                              <span className="text-xs text-purple-400/70 text-center">Last frame</span>
                            </div>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (file.size > 10 * 1024 * 1024) {
                                  alert(`${file.name} is too large (max 10MB).`);
                                  return;
                                }
                                const previewUrl = URL.createObjectURL(file);
                                const newPreviews = [...customImagePreviews];
                                const newFiles = [...customImageFiles];

                                let fileIndex = 0;
                                for (let i = 0; i < slotIndex; i++) {
                                  if (customImagePreviews[i]?.source === 'file') {
                                    fileIndex++;
                                  }
                                }

                                newPreviews[slotIndex] = { url: previewUrl, source: 'file' };
                                newFiles.splice(fileIndex, 0, file);

                                setCustomImagePreviews(newPreviews);
                                setCustomImageFiles(newFiles);
                              }
                              e.target.value = '';
                            }}
                            className="hidden"
                          />
                        </label>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

          {/* Video Generation Area */}
        <div className="space-y-4">
          {/* Generate Video Button */}
          {!sceneHasVideo && (
            <button
              onClick={handleGenerateVideo}
              disabled={isGeneratingVideo}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-blue-500"
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
          )}

          {sceneHasVideo && (
            <>
              {/* Video Preview */}
              <div className="relative">
                <VideoPlayer
                  src={sceneState?.videoLocalPath ? (
                    sceneState.videoLocalPath.startsWith('http://') || sceneState.videoLocalPath.startsWith('https://')
                      ? sceneState.videoLocalPath
                      : `/api/serve-video?path=${encodeURIComponent(sceneState.videoLocalPath)}`
                  ) : undefined}
                  className="w-full"
                />
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
                <div className="p-4 bg-white/5 rounded-lg border border-white/20">
                  <SeedFrameSelector
                    frames={seedFrames}
                    selectedFrameIndex={sceneState?.selectedSeedFrameIndex}
                    onSelectFrame={handleSelectSeedFrame}
                  />
                </div>
              )}

              {/* Continue Button */}
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
                    View Final Video
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    Continue to Next Scene
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
      </div>
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
