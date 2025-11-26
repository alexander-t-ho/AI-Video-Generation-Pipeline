'use client';

import { useProjectStore, useSceneStore, useUIStore } from '@/lib/state/project-store';
import VideoPlayer from './VideoPlayer';
import { Loader2, Image as ImageIcon, Video, CheckCircle2, X, Edit2, Save, X as XIcon, Upload, XCircle, ChevronUp, ChevronDown, Trash2, Copy, Sparkles } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { generateImage, pollImageStatus, generateVideo, pollVideoStatus, uploadImageToS3, extractFrames, uploadImages, deleteGeneratedImage, enhancePrompt } from '@/lib/api-client';
import { GeneratedImage, SeedFrame } from '@/lib/types';
import { useMediaDragDrop } from '@/lib/hooks/useMediaDragDrop';
import { getPublicBackgrounds, getPublicBackgroundUrl, PublicBackground } from '@/lib/backgrounds/public-backgrounds';
import { selectSceneReferenceImages } from '@/lib/state/slices/project-core-slice';
import type { GeneratingImage } from '@/lib/state/types';
import { captureVideoFrame, uploadFrameToS3 } from '@/lib/utils/video-frame-capture';
import { v4 as uuidv4 } from 'uuid';

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
    updateSceneVideoPrompt,
    updateSceneSettings,
    duplicateScene,
    generationStates,
    setGenerationState,
    updateGeneratingImages,
  } = useSceneStore();

  const {
    setViewMode,
    setCurrentSceneIndex,
    mediaDrawer,
    addChatMessage,
    setLiveEditingPrompts,
    updateMediaDrawer,
  } = useUIStore();
  
  // Get generation state from Zustand store (persisted across navigation)
  const generationState = generationStates[currentSceneIndex] || {
    isGeneratingImage: false,
    isGeneratingVideo: false,
    generatingImages: [],
  };
  const isGeneratingImage = generationState.isGeneratingImage;
  const isGeneratingVideo = generationState.isGeneratingVideo;
  const generatingImages = generationState.generatingImages;
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<GeneratedImage | null>(null);
  const [isExtractingFrames, setIsExtractingFrames] = useState(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [editedVideoPrompt, setEditedVideoPrompt] = useState('');
  const [editedNegativePrompt, setEditedNegativePrompt] = useState('');
  const [editedDuration, setEditedDuration] = useState<number | ''>('');
  const [customImageFiles, setCustomImageFiles] = useState<File[]>([]);
  const [customImagePreviews, setCustomImagePreviews] = useState<Array<{ url: string; source: 'file' | 'media' | 'url' } | null>>([]);
  const [droppedImageUrls, setDroppedImageUrls] = useState<string[]>([]); // Store original URLs from dropped media
  const [imageInputMode, setImageInputMode] = useState<'frame' | 'reference'>('frame'); // Toggle between frame interpolation and reference images
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [enlargedSeedFrameUrl, setEnlargedSeedFrameUrl] = useState<string | null>(null);
  const [seedImageId, setSeedImageId] = useState<string | null>(null);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false);
  const videoGenerationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [publicBackgrounds, setPublicBackgrounds] = useState<PublicBackground[]>([]);
  const imageGenerationRequestIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);

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

  const handleEnhanceVideoPrompt = async () => {
    if (!project || isEnhancingPrompt) return;

    const currentPrompt = editedVideoPrompt || currentScene?.videoPrompt || currentScene?.imagePrompt;
    if (!currentPrompt) {
      addChatMessage({
        role: 'agent',
        content: `No video prompt to enhance for Scene ${currentSceneIndex + 1}`,
        type: 'error',
      });
      return;
    }

    setIsEnhancingPrompt(true);
    try {
      addChatMessage({
        role: 'agent',
        content: `Enhancing video prompt for Scene ${currentSceneIndex + 1}...`,
        type: 'status',
      });

      const response = await enhancePrompt({
        prompt: currentPrompt,
        context: {
          sceneTitle: currentScene?.description,
          characterDescription: project.characterDescription,
        },
      });

      if (response.success && response.data?.enhancedPrompt) {
        setEditedVideoPrompt(response.data.enhancedPrompt);
        updateSceneVideoPrompt(currentSceneIndex, response.data.enhancedPrompt);
        addChatMessage({
          role: 'agent',
          content: `✓ Enhanced video prompt for Scene ${currentSceneIndex + 1}`,
          type: 'status',
        });
      } else {
        throw new Error(response.error || 'Failed to enhance prompt');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to enhance prompt';
      addChatMessage({
        role: 'agent',
        content: `❌ Error: ${errorMessage}`,
        type: 'error',
      });
    } finally {
      setIsEnhancingPrompt(false);
    }
  };

  // Load public backgrounds on mount
  useEffect(() => {
    getPublicBackgrounds().then(setPublicBackgrounds).catch(console.error);
  }, []);

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

  // Track previous scene index to save changes before switching
  const prevSceneIndexRef = useRef(currentSceneIndex);

  // Initialize edited fields when scene changes - load current scene's saved values
  useEffect(() => {
    const prevSceneIndex = prevSceneIndexRef.current;

    // Save any pending changes from the previous scene before switching
    if (prevSceneIndex !== currentSceneIndex) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      // Force immediate save of previous scene's changes
      if (editedPrompt.trim()) {
        let imageInputUrls: string[] = [];

        // Collect all image URLs from different sources
        const mediaUrls: string[] = [];

        // Get URLs from media drawer drops or existing media previews
        if (droppedImageUrls.length > 0) {
          mediaUrls.push(...droppedImageUrls);
        } else {
          customImagePreviews
            .filter((p): p is { url: string; source: 'file' | 'media' } => p !== null && p.source === 'media')
            .forEach(preview => {
              const url = preview.url.startsWith('/api/serve-image?path=')
                ? decodeURIComponent(preview.url.split('path=')[1])
                : preview.url;
              mediaUrls.push(url);
            });
        }

        imageInputUrls = mediaUrls;

        const imageInput = imageInputUrls.length === 0
          ? undefined
          : imageInputUrls.length === 1
            ? imageInputUrls[0]
            : imageInputUrls;

        // Update the PREVIOUS scene's settings immediately
        updateSceneSettings(prevSceneIndex, {
          imagePrompt: editedPrompt.trim(),
          videoPrompt: editedVideoPrompt.trim() || editedPrompt.trim(),
          negativePrompt: editedNegativePrompt.trim() || undefined,
          customDuration: editedDuration ? Number(editedDuration) : undefined,
          customImageInput: imageInput,
        });
      }

      // Update the ref for next time
      prevSceneIndexRef.current = currentSceneIndex;
    }

    // Load the new scene's data
    if (currentScene) {
      setEditedPrompt(currentScene.imagePrompt);
      setEditedVideoPrompt(currentScene.videoPrompt || currentScene.imagePrompt); // Fallback to imagePrompt for backward compatibility
      setEditedNegativePrompt(currentScene.negativePrompt || '--no watermark --no warped face --no floating limbs --no text artifacts --no distorted hands --no blurry edges');
      setEditedDuration(currentScene.customDuration || '');

      // Initialize custom images and reference images
      setCustomImageFiles([]);
      setDroppedImageUrls([]);

      // Auto-populate reference images from scene.referenceImageUrls
      if (currentScene.referenceImageUrls && currentScene.referenceImageUrls.length > 0) {
        console.log(`[EditorView] Auto-populating ${currentScene.referenceImageUrls.length} reference images for scene ${currentSceneIndex + 1}:`, currentScene.referenceImageUrls);

        // Create array with 4 slots (0 = seed/first frame, 1-3 = references)
        const previews: Array<{ url: string; source: 'file' | 'media' | 'url' } | null> = [null, null, null, null];

        // Fill slots 1, 2, 3 with reference images
        currentScene.referenceImageUrls.forEach((url, index) => {
          const slotIndex = index + 1; // Slots 1, 2, 3 (not 0, which is for seed frame)
          if (slotIndex <= 3) {
            previews[slotIndex] = {
              url,
              source: 'url' as const
            };
            console.log(`[EditorView] ✓ Populated reference slot ${slotIndex} with:`, url.substring(0, 80));
          }
        });

        setCustomImagePreviews(previews);
      } else {
        // Fall back to legacy customImageInput if no referenceImageUrls
        const imageInputs = currentScene.customImageInput
          ? (Array.isArray(currentScene.customImageInput) ? currentScene.customImageInput : [currentScene.customImageInput])
          : [];

        if (imageInputs.length > 0) {
          setCustomImagePreviews(
            imageInputs
              .filter((url): url is string => url !== null && url !== undefined)
              .map(url => ({ url, source: 'media' as const }))
          );
        } else {
          setCustomImagePreviews([]);
        }
      }
    }
  }, [currentSceneIndex, updateSceneSettings, currentScene]);

  // REMOVED: Auto-population of slot 0 was confusing because:
  // 1. Slot 0 is NOT used in video generation
  // 2. Video generation always uses the selected image from the main grid
  // 3. This made it appear like users needed to provide a "first frame" when they don't
  //
  // If you need slot 0, you can manually drag an image into it

  // Migration removed: Per-scene references are now assigned in setStoryboard/setUploadedImages
  // No longer need to clear and re-trigger AI analysis

  // Auto-populate reference images (slots 1, 2, 3) with AI-powered smart selection
  // Store them in the scene's referenceImageUrls field for per-scene reference management
  useEffect(() => {
    const uploadedImages = project?.uploadedImages;
    const currentScene = project?.storyboard[currentSceneIndex];

    if (uploadedImages && uploadedImages.length > 0 && currentScene) {
      // Use AI-based smart selection: analyze scene prompt with Claude API
      const scenePrompt = editedVideoPrompt || currentScene.videoPrompt || currentScene.imagePrompt || currentScene.description || '';

      // Check if this scene has per-scene references or is using global references
      const hasSceneSpecificRefs = currentScene.referenceImageUrls && currentScene.referenceImageUrls.length > 0;
      const needsAIAnalysis = !hasSceneSpecificRefs; // Run AI if no scene-specific refs

      console.log('[EditorView] Reference check for scene', currentSceneIndex, {
        hasSceneSpecificRefs,
        needsAIAnalysis,
        currentRefs: currentScene.referenceImageUrls,
        globalRefs: project?.referenceImageUrls
      });

      // Run AI analysis if needed (as a backup - main assignment happens in setStoryboard/setUploadedImages)
      if (needsAIAnalysis) {
        console.log('[EditorView] Running AI analysis for scene', currentSceneIndex, ':', scenePrompt.substring(0, 60));

        // Call async function to get AI-selected reference images
        selectSceneReferenceImages(uploadedImages, scenePrompt).then(selectedUrls => {
          // Store AI-selected images directly in the scene
          updateSceneSettings(currentSceneIndex, { referenceImageUrls: selectedUrls });

          console.log('[EditorView] ✅ AI-populated per-scene reference images:', {
            sceneIndex: currentSceneIndex,
            sceneId: currentScene.id,
            promptSnippet: scenePrompt.substring(0, 50),
            selectedCount: selectedUrls.length,
            urls: selectedUrls
          });

          // Auto-populate the UI with the newly assigned references
          if (selectedUrls.length > 0) {
            const previews: Array<{ url: string; source: 'file' | 'media' | 'url' } | null> = [null, null, null, null];

            selectedUrls.forEach((url, index) => {
              const slotIndex = index + 1; // Slots 1, 2, 3 (not 0, which is for seed frame)
              if (slotIndex <= 3) {
                previews[slotIndex] = {
                  url,
                  source: 'url' as const
                };
              }
            });

            setCustomImagePreviews(previews);
          }
        }).catch(error => {
          console.error('[EditorView] ❌ Failed to get AI-selected reference images:', error);
        });
      } else {
        console.log('[EditorView] Skipping AI analysis - scene already has references');
      }
    }
  }, [project?.uploadedImages, currentSceneIndex, editedVideoPrompt, project?.storyboard, updateSceneSettings]);

  // Sync edited prompts to liveEditingPrompts for real-time API preview
  useEffect(() => {
    setLiveEditingPrompts(currentSceneIndex, {
      imagePrompt: editedPrompt,
      videoPrompt: editedVideoPrompt,
      negativePrompt: editedNegativePrompt,
    });
  }, [editedPrompt, editedVideoPrompt, editedNegativePrompt, currentSceneIndex, setLiveEditingPrompts]);

  const handleGenerateImage = async () => {
    if (!project?.id) return;

    // Prevent race conditions: Cancel any existing image generation requests
    if (isGeneratingImage) {
      console.log('[EditorView] Cancelling previous image generation request');
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }

    // Generate unique request ID to track this generation batch
    const requestId = `img-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    imageGenerationRequestIdRef.current = requestId;
    console.log(`[EditorView] Starting image generation batch: ${requestId}`);

    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Update generation state in Zustand store
    setGenerationState(currentSceneIndex, {
      isGeneratingImage: true,
      generatingImages: [],
    });

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
    updateGeneratingImages(currentSceneIndex, initialGenerating);

    try {
      setSceneStatus(currentSceneIndex, 'generating_image');

      // Get per-scene reference images (AI-selected based on scene type: interior vs exterior)
      // ONLY use scene-specific references, no global fallback
      let referenceImageUrls = (currentScene.referenceImageUrls || []).slice(0, 3);

      console.log(`[EditorView] Scene ${currentSceneIndex + 1}: Reference images for generation:`, {
        sceneHasRefs: !!currentScene.referenceImageUrls,
        refCount: referenceImageUrls.length,
        refs: referenceImageUrls
      });

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
          ? (Array.isArray(currentScene.customImageInput) 
              ? currentScene.customImageInput.filter((url): url is string => url !== null && url !== undefined)
              : [currentScene.customImageInput].filter((url): url is string => url !== null && url !== undefined))
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
        } else if (referenceImageUrls.length > 0) {
          // Use first reference image as seed image for I2I (for all scenes)
          seedImageUrl = referenceImageUrls[0];
          console.log(`[EditorView] Scene ${currentSceneIndex}: Using reference image as seed image for I2I:`, seedImageUrl.substring(0, 80) + '...');
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
        }
      }

      // Helper to check if error is retryable (Replicate transient errors)
      const isRetryableError = (error: Error): boolean => {
        const msg = error.message.toLowerCase();
        return msg.includes('director') ||
               msg.includes('e6716') ||
               msg.includes('unexpected error') ||
               msg.includes('temporary server') ||
               msg.includes('internal server error');
      };

      // Generate single image with retry logic
      const generateSingleImage = async (index: number, maxRetries: number = 2): Promise<void> => {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            // Check if request was cancelled before starting
            if (abortController.signal.aborted || imageGenerationRequestIdRef.current !== requestId) {
              console.log(`[EditorView] Image ${index + 1} generation cancelled (before start, attempt ${attempt + 1})`);
              return;
            }

            if (attempt > 0) {
              console.log(`[EditorView] Retrying image ${index + 1} (attempt ${attempt + 1}/${maxRetries + 1})`);
              // Brief delay before retry
              await new Promise(resolve => setTimeout(resolve, 1000));
            }

            const response = await generateImage({
              prompt: editedPrompt || currentScene.imagePrompt,
              projectId: project.id,
              sceneIndex: currentSceneIndex,
              seedImage: seedImageUrl,
              referenceImageUrls,
              seedFrame: seedFrameUrl,
              negativePrompt: editedNegativePrompt || currentScene.negativePrompt,
            });

            // Check if this request was cancelled or superseded after API call
            if (abortController.signal.aborted || imageGenerationRequestIdRef.current !== requestId) {
              console.log(`[EditorView] Image ${index + 1} generation cancelled (after API call, current: ${imageGenerationRequestIdRef.current}, this: ${requestId})`);
              return;
            }

            if (!response.predictionId) {
              throw new Error('Failed to get prediction ID from image generation response');
            }

            // Update generating state only if not cancelled
            if (!abortController.signal.aborted && imageGenerationRequestIdRef.current === requestId) {
              const currentGenState = generationStates[currentSceneIndex] || { isGeneratingImage: true, isGeneratingVideo: false, generatingImages: [] };
              const updated = [...currentGenState.generatingImages];
              updated[index] = {
                predictionId: response.predictionId || '',
                status: response.status || 'starting',
              };
              updateGeneratingImages(currentSceneIndex, updated);
            }

            // Poll for completion
            const statusResponse = await pollImageStatus(
              response.predictionId || '',
              {
                interval: 2000,
                projectId: project.id,
                sceneIndex: currentSceneIndex,
                prompt: editedPrompt || currentScene.imagePrompt,
                onProgress: (status) => {
                  // Only update if not cancelled and still the current request
                  if (!abortController.signal.aborted && imageGenerationRequestIdRef.current === requestId) {
                    const currentGenState = generationStates[currentSceneIndex] || { isGeneratingImage: true, isGeneratingVideo: false, generatingImages: [] };
                    const updated = [...currentGenState.generatingImages];
                    updated[index] = {
                      ...updated[index],
                      status: status.status === 'canceled' ? 'failed' : status.status,
                    };
                    updateGeneratingImages(currentSceneIndex, updated);
                  }
                },
              }
            );

            // Final check before updating state with results
            if (abortController.signal.aborted || imageGenerationRequestIdRef.current !== requestId) {
              console.log(`[EditorView] Image ${index + 1} generation cancelled (after polling, current: ${imageGenerationRequestIdRef.current}, this: ${requestId})`);
              return;
            }

            if (statusResponse.status === 'succeeded' && statusResponse.image) {
              addGeneratedImage(currentSceneIndex, statusResponse.image);

              if (index === 0 && !preserveSelection) {
                setSelectedImageId(statusResponse.image.id);
                selectImage(currentSceneIndex, statusResponse.image.id);
              } else if (preserveSelection && currentSeedImageId === currentSelectedImageBeforeClear?.id) {
                setSelectedImageId(currentSelectedImageBeforeClear.id);
              }

              const currentGenState = generationStates[currentSceneIndex] || { isGeneratingImage: true, isGeneratingVideo: false, generatingImages: [] };
              const updated = [...currentGenState.generatingImages];
              updated[index] = {
                ...updated[index],
                status: 'succeeded',
                image: statusResponse.image,
              };
              updateGeneratingImages(currentSceneIndex, updated);

              // Success - exit retry loop
              return;
            } else {
              throw new Error(statusResponse.error || 'Image generation failed');
            }
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // Check if we should retry
            if (attempt < maxRetries && isRetryableError(lastError)) {
              console.warn(`[EditorView] Retryable error for image ${index + 1}: ${lastError.message}`);
              continue; // Try again
            }

            // No more retries or non-retryable error
            throw lastError;
          }
        }

        // Should not reach here, but just in case
        if (lastError) {
          throw lastError;
        }
      };

      // Generate 3 images in parallel with retry logic
      const imagePromises = Array(3).fill(null).map(async (_, index) => {
        try {
          await generateSingleImage(index, 2); // Max 2 retries per image
        } catch (error) {
          // Don't log errors for aborted requests
          if (abortController.signal.aborted || imageGenerationRequestIdRef.current !== requestId) {
            console.log(`[EditorView] Image ${index + 1} generation aborted`);
            return;
          }

          console.error(`[EditorView] Failed to generate image ${index + 1}:`, error);
          const currentGenState = generationStates[currentSceneIndex] || { isGeneratingImage: true, isGeneratingVideo: false, generatingImages: [] };
          const updated = [...currentGenState.generatingImages];
          updated[index] = {
            ...updated[index],
            status: 'failed',
          };
          updateGeneratingImages(currentSceneIndex, updated);
        }
      });

      await Promise.all(imagePromises);

      // Only update status if this request wasn't cancelled
      if (!abortController.signal.aborted && imageGenerationRequestIdRef.current === requestId) {
        setSceneStatus(currentSceneIndex, 'image_ready');
        console.log(`[EditorView] Image generation batch ${requestId} completed successfully`);
      } else {
        console.log(`[EditorView] Image generation batch ${requestId} was cancelled or superseded`);
      }
    } catch (error) {
      // Don't log errors for aborted requests
      if (!abortController.signal.aborted && imageGenerationRequestIdRef.current === requestId) {
        console.error('[EditorView] Error generating images:', error);
      }
    } finally {
      // Only clear loading state if this is still the current request
      if (imageGenerationRequestIdRef.current === requestId) {
        setGenerationState(currentSceneIndex, { isGeneratingImage: false });
        abortControllerRef.current = null;
      }
    }
  };

  const handleSelectImage = (imageId: string) => {
    setSelectedImageId(imageId);
    selectImage(currentSceneIndex, imageId);
    // Don't automatically set as seed image - let user drag image to First Frame slot
    // const selectedImg = sceneImages.find((img: GeneratedImage) => img.id === imageId);
    // if (selectedImg && selectedImg.localPath) {
    //   setSeedImageId(imageId);
    //   // Sync with the global media drawer seed image (right panel)
    //   updateMediaDrawer({ seedImageId: imageId });
    // }
  };

  const handleRegenerateVideo = async () => {
    // Regenerate video using the same logic as handleGenerateVideo
    await handleGenerateVideo();
  };

  const handleGenerateVideo = async () => {
    if (!project?.id || isGeneratingVideo) return;

    // Debounce rapid clicks - prevent multiple requests within 2 seconds
    if (videoGenerationTimeoutRef.current) {
      console.log('[EditorView] Video generation request ignored - debouncing active');
      return;
    }

    setGenerationState(currentSceneIndex, { isGeneratingVideo: true });

    // Set debounce timeout to prevent rapid re-clicks
    videoGenerationTimeoutRef.current = setTimeout(() => {
      videoGenerationTimeoutRef.current = null;
    }, 2000);

    try {
      setSceneStatus(currentSceneIndex, 'generating_video');

      // In reference images mode (for Google Veo), first frame is not required
      // The model will generate video using only the reference images
      const isReferenceMode = imageInputMode === 'reference';
      
      // Use the First Frame slot (customImagePreviews[0]) for video generation
      // This allows users to manually drag in the image they want to use
      const firstFramePreview = customImagePreviews[0];
      if (!firstFramePreview && !isReferenceMode) {
        throw new Error('Please drag an image to the First Frame slot to generate video');
      }

      let imageToUse: string;
      let s3Url: string;

      if (isReferenceMode && !firstFramePreview) {
        // Reference-only mode: No first frame needed
        s3Url = ''; // Empty string, will not be used by generator
        console.log('[EditorView] Reference Images Mode: No first frame required');
      } else if (firstFramePreview) {
        // Standard/Frame mode: Process first frame
        if (firstFramePreview.source === 'file') {
          // If it's a file, we need to find it in customImageFiles
          const fileIndex = customImagePreviews.slice(0, 1).filter(p => p?.source === 'file').length - 1;
          const file = customImageFiles[fileIndex];
          if (!file) {
            throw new Error('First Frame file not found. Please try uploading again.');
          }
          // Upload the file first
          const uploadResult = await uploadImages([file], project.id, false);
          if (!uploadResult.images || uploadResult.images.length === 0) {
            throw new Error('Failed to upload First Frame image');
          }
          imageToUse = uploadResult.images[0].url;
        } else if (firstFramePreview.url.startsWith('http://') || firstFramePreview.url.startsWith('https://')) {
          imageToUse = firstFramePreview.url;
        } else if (firstFramePreview.url.startsWith('/api/serve-image')) {
          // Extract the local path
          imageToUse = decodeURIComponent(firstFramePreview.url.split('path=')[1]);
        } else {
          imageToUse = firstFramePreview.url;
        }

        console.log(`[EditorView] Scene ${currentSceneIndex}: Using First Frame slot for video generation`);
        console.log('[EditorView] First Frame path:', imageToUse.substring(0, 100) + (imageToUse.length > 100 ? '...' : ''));

        // Upload image to S3 if it's a local path, otherwise use the URL directly
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
      } else {
        // Should not reach here
        s3Url = '';
      }

      // Handle two mutually exclusive modes:
      // 1. Frame Interpolation Mode: Uses first frame (from selected image) + optional last frame (slot 4)
      // 2. Reference Images Mode: Uses first frame (from selected image) + reference images (slots 1, 2, 3)
      // NOTE: For Google Veo models, these are mutually exclusive - use one OR the other

      let lastFrameUrl: string | undefined;
      let referenceImageUrls: string[] = [];

      if (imageInputMode === 'frame') {
        // Frame Interpolation Mode - handle last frame (slot index 4) if provided
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
      } else {
        // Reference Images Mode - handle reference images (slots 1, 2, 3)
        const referenceSlots = [1, 2, 3];
        const referenceUploads: Promise<string | null>[] = [];

        for (const slotIndex of referenceSlots) {
          const preview = customImagePreviews[slotIndex];
          if (!preview) continue;

          referenceUploads.push(
            (async () => {
              try {
                if (preview.source === 'file') {
                  // Find the file for this slot
                  let fileIndex = 0;
                  for (let i = 0; i < slotIndex; i++) {
                    if (customImagePreviews[i]?.source === 'file') {
                      fileIndex++;
                    }
                  }
                  const file = customImageFiles[fileIndex];
                  if (file) {
                    const uploadResult = await uploadImages([file], project.id, false);
                    if (uploadResult.images && uploadResult.images.length > 0) {
                      console.log(`[EditorView] Uploaded reference image ${slotIndex} to S3`);
                      return uploadResult.images[0].url;
                    }
                  }
                } else if (preview.url.startsWith('http://') || preview.url.startsWith('https://')) {
                  return preview.url;
                } else if (preview.url.startsWith('/api/serve-image')) {
                  const localPath = decodeURIComponent(preview.url.split('path=')[1]);
                  const uploadResult = await uploadImageToS3(localPath, project.id);
                  console.log(`[EditorView] Uploaded reference image ${slotIndex} (from local path) to S3`);
                  return uploadResult.s3Url;
                }
              } catch (error) {
                console.error(`Error uploading reference image ${slotIndex}:`, error);
              }
              return null;
            })()
          );
        }

        const uploadedRefs = await Promise.all(referenceUploads);
        referenceImageUrls = uploadedRefs.filter((url): url is string => url !== null);

        // FALLBACK: If no custom reference images were provided, use the scene's referenceImageUrls
        // This ensures AI-selected reference images from Brand Identity are used
        if (referenceImageUrls.length === 0 && currentScene.referenceImageUrls && currentScene.referenceImageUrls.length > 0) {
          console.log(`[EditorView] No custom reference images found, using ${currentScene.referenceImageUrls.length} scene reference images from Brand Identity`);
          referenceImageUrls = currentScene.referenceImageUrls.slice(0, 3); // Limit to 3
        }

        console.log(`[EditorView] Using ${referenceImageUrls.length} reference images for video generation`);
      }

      // Generate video
      // Get model parameters from current scene and add last_frame if provided
      // Add useReferenceMode flag when in reference mode (for Google Veo)
      const modelParameters = {
        ...(currentScene.modelParameters || {}),
        ...(lastFrameUrl ? { last_frame: lastFrameUrl } : {}),
        ...(isReferenceMode ? { useReferenceMode: true } : {}),
      };

      console.log('[EditorView] Video generation mode:',
        imageInputMode === 'frame'
          ? (lastFrameUrl ? 'Frame Interpolation (start → end)' : 'Standard (from start frame)')
          : `Reference Images (${referenceImageUrls.length} refs)`
      );
      console.log('[EditorView] Video generation parameters:', {
        baseImage: s3Url.substring(0, 80) + '...',
        mode: imageInputMode,
        lastFrame: lastFrameUrl ? lastFrameUrl.substring(0, 80) + '...' : undefined,
        referenceImagesCount: referenceImageUrls.length,
      });

      // Log reference images in detail
      if (referenceImageUrls.length > 0) {
        console.log('[EditorView] Reference images being sent to video generation:');
        referenceImageUrls.forEach((url, idx) => {
          console.log(`  [${idx + 1}] ${url.substring(0, 100)}${url.length > 100 ? '...' : ''}`);
        });
      }

      const videoResponse = await generateVideo(
        s3Url, // Base image from selected image
        editedVideoPrompt || currentScene.videoPrompt || currentScene.imagePrompt, // Use edited value, fallback to imagePrompt for backward compatibility
        project.id,
        currentSceneIndex,
        undefined, // seedFrameUrl removed - users manually save last frame when needed
        (editedDuration ? Number(editedDuration) : currentScene.customDuration), // Use edited duration if set
        undefined, // subsceneIndex not used
        modelParameters, // Pass model-specific parameters (including last_frame if in frame mode)
        referenceImageUrls.length > 0 ? referenceImageUrls : undefined // Pass reference images if in reference mode
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
                // Process seed frames - they may already be uploaded to S3 by the backend
                const processedFrames = await Promise.all(
                  response.frames.map(async (frame) => {
                    // Check if frame is already an HTTP URL (already on S3)
                    if (frame.url.startsWith('http://') || frame.url.startsWith('https://')) {
                      console.log(`[EditorView] Frame already on S3: ${frame.url.substring(0, 60)}...`);
                      return frame as SeedFrame;
                    }

                    // If it's a local path, try to upload to S3
                    try {
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
                setSeedFrames(currentSceneIndex, processedFrames);
                console.log(`Extracted and stored ${processedFrames.length} seed frames for Scene ${currentSceneIndex + 1} (for use in Scene ${currentSceneIndex + 2})`);
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addChatMessage({
        role: 'agent',
        content: `❌ Failed to generate video: ${errorMessage}`,
        type: 'error',
      });
    } finally {
      setGenerationState(currentSceneIndex, { isGeneratingVideo: false });
    }
  };

  // Cleanup video generation timeout on unmount
  useEffect(() => {
    return () => {
      if (videoGenerationTimeoutRef.current) {
        clearTimeout(videoGenerationTimeoutRef.current);
      }
    };
  }, []);

  // Cleanup image generation on unmount or scene change
  useEffect(() => {
    return () => {
      // Cancel any ongoing image generation when component unmounts or scene changes
      if (abortControllerRef.current) {
        console.log('[EditorView] Cancelling image generation on unmount/scene change');
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      imageGenerationRequestIdRef.current = null;
    };
  }, [currentSceneIndex]);

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
      setEditedNegativePrompt(currentScene.negativePrompt || '--no watermark --no warped face --no floating limbs --no text artifacts --no distorted hands --no blurry edges');
      setEditedDuration(currentScene.customDuration || '');
      // Initialize custom images - support both single string (legacy) and array
      const imageInputs = currentScene.customImageInput
        ? (Array.isArray(currentScene.customImageInput) ? currentScene.customImageInput : [currentScene.customImageInput])
        : [];
      setCustomImageFiles([]);
      setDroppedImageUrls([]);
      setCustomImagePreviews(
        imageInputs
          .filter((url): url is string => url !== null && url !== undefined)
          .map(url => ({ url, source: 'media' as const }))
      );
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

    // If removing slot 0 (First Frame), clear seedImageId for API preview
    if (index === 0) {
      setSeedImageId(null);
      console.log('[EditorView] Cleared seedImageId (First Frame removed)');
    }

    // IMPORTANT: Update scene.referenceImageUrls if removing from slots 1, 2, 3
    if (index >= 1 && index <= 3) {
      const updatedReferenceUrls = [...(currentScene.referenceImageUrls || [])];

      // Remove the URL at this slot (slots 1,2,3 map to array indices 0,1,2)
      const arrayIndex = index - 1;
      if (arrayIndex < updatedReferenceUrls.length) {
        updatedReferenceUrls.splice(arrayIndex, 1);
      }

      // Update scene state
      updateSceneSettings(currentSceneIndex, { referenceImageUrls: updatedReferenceUrls });
      console.log('[EditorView] ✓ Updated scene.referenceImageUrls after removing slot', index, ':', updatedReferenceUrls);
    }

    // Set slot to null instead of removing (maintains 4-slot structure)
    setCustomImagePreviews(prev => {
      const newPreviews = [...prev];
      newPreviews[index] = null as any;
      return newPreviews;
    });
  };

  const handleClearAllImages = () => {
    // Revoke all blob URLs
    customImagePreviews.forEach(preview => {
      if (preview && preview.source === 'file' && preview.url.startsWith('blob:')) {
        URL.revokeObjectURL(preview.url);
      }
    });

    // Clear all state
    setCustomImageFiles([]);
    setDroppedImageUrls([]);
    setCustomImagePreviews([]);

    // Immediately update scene settings to clear customImageInput
    // This ensures the API Preview Panel reflects the cleared state
    updateSceneSettings(currentSceneIndex, {
      customImageInput: undefined,
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
    console.log('[EditorView] findImageUrlFromItem called:', { itemId, itemType });

    if (itemType === 'video') {
      // Videos are not supported as image input
      console.log('[EditorView] Item type is video, rejecting');
      return null;
    }

    // Check for public backgrounds (IDs start with 'public-bg-')
    if (itemId.startsWith('public-bg-')) {
      const bgId = itemId.replace('public-bg-', '');
      const publicBg = publicBackgrounds.find(bg => bg.id === bgId);
      if (publicBg) {
        const url = getPublicBackgroundUrl(publicBg.filename);
        console.log('[EditorView] Found public background:', url);
        return url;
      }
    }

    // Search in generated images
    console.log('[EditorView] Searching in generated images across', scenes.length, 'scenes');
    for (const scene of scenes) {
      if (scene.generatedImages) {
        const image = scene.generatedImages.find(img => img.id === itemId);
        if (image) {
          // Prefer localPath over url for consistency
          const url = image.localPath || image.url || null;
          console.log('[EditorView] Found in generated images:', url);
          return url;
        }
      }
    }

    // Search in seed frames
    console.log('[EditorView] Searching in seed frames');
    for (const scene of scenes) {
      if (scene.seedFrames) {
        const frame = scene.seedFrames.find(f => f.id === itemId);
        if (frame) {
          // Prefer localPath over url
          const url = frame.localPath || frame.url || null;
          console.log('[EditorView] Found in seed frames:', url);
          return url;
        }
      }
    }

    // Search in uploaded images (Brand Assets)
    console.log('[EditorView] Searching in uploaded images');
    if (project?.uploadedImages) {
      // Check original images
      const uploadedImage = project.uploadedImages.find(img => img.id === itemId);
      if (uploadedImage) {
        const url = uploadedImage.localPath || uploadedImage.url || null;
        console.log('[EditorView] Found in uploaded images:', url);
        return url;
      }

      // Check processed versions
      for (const uploadedImage of project.uploadedImages) {
        if (uploadedImage.processedVersions) {
          const processed = uploadedImage.processedVersions.find(p => p.id === itemId);
          if (processed) {
            const url = processed.localPath || processed.url || null;
            console.log('[EditorView] Found in processed versions:', url);
            return url;
          }
        }
      }
    }

    // Search in background images
    console.log('[EditorView] Searching in background images');
    if (project?.backgroundImages) {
      // Check original background images
      const backgroundImage = project.backgroundImages.find(img => img.id === itemId);
      if (backgroundImage) {
        const url = backgroundImage.localPath || backgroundImage.url || null;
        console.log('[EditorView] Found in background images:', url);
        return url;
      }

      // Check processed versions of backgrounds
      for (const backgroundImage of project.backgroundImages) {
        if (backgroundImage.processedVersions) {
          const processed = backgroundImage.processedVersions.find(p => p.id === itemId);
          if (processed) {
            const url = processed.localPath || processed.url || null;
            console.log('[EditorView] Found in processed background versions:', url);
            return url;
          }
        }
      }
    }

    // Search in additional media
    console.log('[EditorView] Searching in additional media');
    if (project?.additionalMedia) {
      const additionalMediaItem = project.additionalMedia.find(item => item.id === itemId);
      if (additionalMediaItem) {
        const url = additionalMediaItem.localPath || additionalMediaItem.url || null;
        console.log('[EditorView] Found in additional media:', url);
        return url;
      }
    }

    console.log('[EditorView] Image not found in any location');
    return null;
  };

  // Handle media drop from media drawer
  const handleMediaDropOnImageInput = (itemId: string, itemType: 'image' | 'video' | 'frame', targetSlot?: number) => {
    console.log('[EditorView] Media dropped:', { itemId, itemType, targetSlot });

    if (itemType === 'video') {
      alert('Videos cannot be used as image input. Please use an image or frame.');
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
      if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://') && !imageUrl.startsWith('/api/') && !imageUrl.startsWith('blob:')) {
        previewUrl = `/api/serve-image?path=${encodeURIComponent(imageUrl)}`;
        console.log('[EditorView] Converted local path to serve-image URL:', previewUrl);
      } else {
        console.log('[EditorView] Using URL as-is (already public or serve-image URL):', previewUrl.substring(0, 100));
      }

      const newPreviews = [...customImagePreviews];

      // If a target slot is specified, use it
      if (targetSlot !== undefined && targetSlot >= 0 && targetSlot <= 4) {
        // Replace the slot (overwrite existing if present)
        newPreviews[targetSlot] = { url: previewUrl, source: 'media' };
        console.log('[EditorView] Set preview in target slot', targetSlot, ':', previewUrl.substring(0, 100));
        setCustomImagePreviews(newPreviews);

        // If dropping on slot 0 (First Frame for video generation), update seedImageId for API preview
        if (targetSlot === 0 && itemType === 'image') {
          setSeedImageId(itemId);
          // Don't update mediaDrawer.seedImageId here - that's for image generation, not video
          console.log('[EditorView] Updated seedImageId for First Frame (video generation):', itemId);
        }

        // IMPORTANT: Update scene.referenceImageUrls for slots 1, 2, 3
        // This ensures the API call uses the dragged images
        if (targetSlot >= 1 && targetSlot <= 3) {
          const updatedReferenceUrls = [...(currentScene.referenceImageUrls || [])];

          // Ensure array has enough slots
          while (updatedReferenceUrls.length < 3) {
            updatedReferenceUrls.push('');
          }

          // Update the specific slot (slots 1,2,3 map to array indices 0,1,2)
          updatedReferenceUrls[targetSlot - 1] = imageUrl;

          // Remove empty strings
          const cleanedUrls = updatedReferenceUrls.filter(url => url && url.length > 0);

          // Update scene state
          updateSceneSettings(currentSceneIndex, { referenceImageUrls: cleanedUrls });
          console.log('[EditorView] ✓ Updated scene.referenceImageUrls for slot', targetSlot, ':', cleanedUrls);
        }

        return;
      }

      // Otherwise, find first empty slot (original behavior)
      for (let i = 0; i < 5; i++) {
        if (!newPreviews[i]) {
          newPreviews[i] = { url: previewUrl, source: 'media' };
          console.log('[EditorView] Set preview in first empty slot', i, ':', previewUrl.substring(0, 100));
          setCustomImagePreviews(newPreviews);

          // IMPORTANT: Update scene.referenceImageUrls for slots 1, 2, 3
          if (i >= 1 && i <= 3) {
            const updatedReferenceUrls = [...(currentScene.referenceImageUrls || [])];

            // Ensure array has enough slots
            while (updatedReferenceUrls.length < 3) {
              updatedReferenceUrls.push('');
            }

            // Update the specific slot (slots 1,2,3 map to array indices 0,1,2)
            updatedReferenceUrls[i - 1] = imageUrl;

            // Remove empty strings
            const cleanedUrls = updatedReferenceUrls.filter(url => url && url.length > 0);

            // Update scene state
            updateSceneSettings(currentSceneIndex, { referenceImageUrls: cleanedUrls });
            console.log('[EditorView] ✓ Updated scene.referenceImageUrls for auto-assigned slot', i, ':', cleanedUrls);
          }

          return;
        }
      }

      // If all slots are filled, inform user
      alert('All image slots are filled. Remove an image first or drop on a specific slot to replace it.');
    } else {
      console.error('[EditorView] Could not find image with ID:', itemId);
      alert('Could not find the dropped image. Please try again.');
    }
  };

  // Set up drag and drop for image input area (from media drawer)
  const { handleDragOver: handleMediaDragOver, handleDragLeave: handleMediaDragLeave, isOverDropZone } = useMediaDragDrop({
    onDrop: (itemId, itemType) => handleMediaDropOnImageInput(itemId, itemType),
    acceptedTypes: ['image', 'frame'],
  });

  // Create slot-specific drop handlers
  const createSlotDropHandler = (slotIndex: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleMediaDragLeave(); // Reset drag over state

    console.log('[EditorView] Drop event on slot', slotIndex);

    // Check if it's a file drop (has files)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Handle file drop (from computer)
      const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
      if (files.length === 0) return;

      const file = files[0]; // Only take first file for single slot drop
      if (file.size > 10 * 1024 * 1024) {
        alert(`${file.name} is too large (max 10MB).`);
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      const newPreviews = [...customImagePreviews];
      const newFiles = [...customImageFiles];

      // Calculate file index for this slot
      let fileIndex = 0;
      for (let i = 0; i < slotIndex; i++) {
        if (customImagePreviews[i]?.source === 'file') {
          fileIndex++;
        }
      }

      // Replace the slot
      newPreviews[slotIndex] = { url: previewUrl, source: 'file' };
      newFiles.splice(fileIndex, 0, file);

      setCustomImagePreviews(newPreviews);
      setCustomImageFiles(newFiles);
    } else {
      // Handle media drawer drop
      const data = e.dataTransfer.getData('application/json');
      console.log('[EditorView] Drag data from dataTransfer:', data);

      if (data) {
        try {
          const { itemId, itemType } = JSON.parse(data);
          console.log('[EditorView] Parsed drag data:', { itemId, itemType });
          if (itemId && itemType) {
            handleMediaDropOnImageInput(itemId, itemType, slotIndex);
          }
        } catch (error) {
          console.error('[EditorView] Failed to parse drag data:', error);
        }
      } else {
        // Fallback: try to get from global drag state
        const { dragDrop } = useProjectStore.getState();
        console.log('[EditorView] Fallback to drag state:', dragDrop);
        if (dragDrop.draggedItemId && dragDrop.draggedItemType) {
          handleMediaDropOnImageInput(dragDrop.draggedItemId, dragDrop.draggedItemType, slotIndex);
        }
      }
    }
  };

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

      // Build image URLs array maintaining slot positions (including nulls for empty slots)
      // This is critical for video generation to know which slot is the seed image
      const slotUrls: (string | null)[] = [];

      // Upload files if any were selected (only if not skipping)
      let uploadedFileUrls: string[] = [];
      if (!skipImages && customImageFiles.length > 0 && project) {
        setIsUploadingImage(true);
        try {
          const uploadResult = await uploadImages(customImageFiles, project.id, false);
          if (uploadResult.images && uploadResult.images.length > 0) {
            uploadedFileUrls = uploadResult.images.map(img => img.url);
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

      // Process each slot (0-4) to maintain position
      let fileUploadIndex = 0;
      for (let i = 0; i < Math.max(5, customImagePreviews.length); i++) {
        const preview = customImagePreviews[i];

        if (!preview) {
          // Empty slot - preserve null
          slotUrls[i] = null;
        } else if (preview.source === 'file') {
          // File that was uploaded
          if (fileUploadIndex < uploadedFileUrls.length) {
            slotUrls[i] = uploadedFileUrls[fileUploadIndex];
            fileUploadIndex++;
          } else {
            slotUrls[i] = null;
          }
        } else {
          // Media from drawer - extract original URL
          const url = preview.url.startsWith('/api/serve-image?path=')
            ? decodeURIComponent(preview.url.split('path=')[1])
            : preview.url;
          slotUrls[i] = url;
        }
      }

      // Remove trailing nulls to keep array compact, but preserve internal nulls
      while (slotUrls.length > 0 && slotUrls[slotUrls.length - 1] === null) {
        slotUrls.pop();
      }

      // Convert to appropriate format for storage
      const imageInput = slotUrls.length === 0
        ? undefined
        : slotUrls.length === 1
          ? slotUrls[0] // Single value (could be null)
          : slotUrls; // Array with possible nulls

      // Update scene settings
      updateSceneSettings(currentSceneIndex, {
        imagePrompt: editedPrompt.trim(),
        videoPrompt: editedVideoPrompt.trim() || editedPrompt.trim(), // Fallback to imagePrompt if videoPrompt is empty
        negativePrompt: editedNegativePrompt.trim() || undefined,
        customDuration: editedDuration ? Number(editedDuration) : undefined,
        customImageInput: imageInput,
      });
    }, 1000); // 1 second debounce
  }, [editedPrompt, editedVideoPrompt, editedNegativePrompt, editedDuration, customImageFiles, customImagePreviews, droppedImageUrls, currentSceneIndex, project, updateSceneSettings]);

  // Auto-save on text field changes
  useEffect(() => {
    if (isPromptExpanded && editedPrompt.trim()) {
      autoSave(true); // Skip images for text-only changes
    }
  }, [editedPrompt, editedVideoPrompt, editedNegativePrompt, editedDuration, isPromptExpanded, autoSave]);

  // Auto-save when images change (with upload)
  useEffect(() => {
    if (isPromptExpanded && (customImageFiles.length > 0 || droppedImageUrls.length > 0 || customImagePreviews.length > 0)) {
      autoSave(false); // Include images
    }
  }, [customImagePreviews, customImageFiles.length, droppedImageUrls.length, isPromptExpanded, autoSave]);

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
    setEditedNegativePrompt(currentScene.negativePrompt || '--no watermark --no warped face --no floating limbs --no text artifacts --no distorted hands --no blurry edges');
    setEditedDuration(currentScene.customDuration || '');

    // Clean up blob URLs
    customImagePreviews.forEach(preview => {
      if (preview && preview.source === 'file' && preview.url.startsWith('blob:')) {
        URL.revokeObjectURL(preview.url);
      }
    });

    // Reset to scene's current images
    const imageInputs = currentScene.customImageInput
      ? (Array.isArray(currentScene.customImageInput)
          ? currentScene.customImageInput
          : [currentScene.customImageInput])
      : [];
    setCustomImageFiles([]);
    setDroppedImageUrls([]);
    setCustomImagePreviews(
      imageInputs
        .filter((url): url is string => url !== null && url !== undefined)
        .map(url => ({ url, source: 'media' as const }))
    );

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
        prompt: editedPrompt || currentScene.imagePrompt,
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
              <div className="relative">
                <textarea
                  value={editedVideoPrompt}
                  onChange={(e) => setEditedVideoPrompt(e.target.value)}
                  className="w-full px-3 py-2 pr-12 text-sm bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 text-white placeholder-white/40 resize-none backdrop-blur-sm"
                  rows={4}
                  placeholder="Enter video prompt describing motion/action (required)..."
                  required
                />
                <button
                  onClick={handleEnhanceVideoPrompt}
                  disabled={isEnhancingPrompt || isGeneratingVideo}
                  className="absolute bottom-2 right-2 p-1.5 rounded-md text-white/40 hover:text-white/80 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  title="Enhance prompt with AI"
                >
                  {isEnhancingPrompt ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                </button>
              </div>
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

              {/* Save Current Frame Button */}
              {sceneHasVideo && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      if (!project?.id || !videoPlayerRef.current) return;

                      setIsExtractingFrames(true);
                      try {
                        // Capture current frame from video player using canvas
                        const frameBlob = await captureVideoFrame(videoPlayerRef.current);

                        // Upload to S3
                        const { s3Url, s3Key, preSignedUrl } = await uploadFrameToS3(frameBlob, project.id);

                        // Create seed frame object
                        const capturedFrame: SeedFrame = {
                          id: uuidv4(),
                          url: s3Url,
                          localPath: '', // No local path - frame is only on S3
                          s3Key,
                          timestamp: videoPlayerRef.current.currentTime,
                        };

                        // Add to seed frames (prepend to existing)
                        setSeedFrames(currentSceneIndex, [capturedFrame, ...(seedFrames || [])]);

                        addChatMessage({
                          role: 'agent',
                          content: '✓ Current frame saved to seed frames',
                          type: 'status',
                        });
                      } catch (error) {
                        console.error('Error saving current frame:', error);
                        addChatMessage({
                          role: 'agent',
                          content: '❌ Failed to save current frame',
                          type: 'error',
                        });
                      } finally {
                        setIsExtractingFrames(false);
                      }
                    }}
                    disabled={isExtractingFrames}
                    className="px-3 py-2 text-xs font-medium bg-white/10 text-white/80 rounded-lg hover:bg-white/20 disabled:opacity-50 transition-colors border border-white/20 flex items-center gap-2"
                  >
                    {isExtractingFrames ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save current frame
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Image Input - First Frame and Last Frame OR Reference Images */}
            <div className="space-y-3">
              {/* Mode Toggle */}
              <div className="flex items-center gap-2 p-2 bg-white/5 rounded-lg border border-white/10">
                <span className="text-xs font-medium text-white/70">Input Mode:</span>
                <div className="flex gap-1 bg-white/5 rounded-md p-0.5">
                  <button
                    onClick={() => {
                      setImageInputMode('frame');
                      // Clear all images when switching modes
                      setCustomImagePreviews([]);
                      setCustomImageFiles([]);
                      setDroppedImageUrls([]);
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                      imageInputMode === 'frame'
                        ? 'bg-blue-500 text-white'
                        : 'text-white/60 hover:text-white hover:bg-white/10'
                    }`}
                    type="button"
                  >
                    First/Last Frame
                  </button>
                  <button
                    onClick={() => {
                      setImageInputMode('reference');
                      // Clear all images when switching modes
                      setCustomImagePreviews([]);
                      setCustomImageFiles([]);
                      setDroppedImageUrls([]);
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                      imageInputMode === 'reference'
                        ? 'bg-blue-500 text-white'
                        : 'text-white/60 hover:text-white hover:bg-white/10'
                    }`}
                    type="button"
                  >
                    Reference Images
                  </button>
                </div>
              </div>

              {/* Labels Row */}
              <div className="flex items-start justify-between gap-3">
                {imageInputMode === 'frame' ? (
                  <>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-white">
                        First Frame <span className="text-white/60 text-xs">(Starting frame)</span>
                      </label>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-white">
                        Last Frame <span className="text-white/60 text-xs">(Interpolation mode)</span>
                      </label>
                      <p className="text-xs text-white/40 mt-0.5">
                        Optional: Creates transition from start to end frame
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-white">
                      Reference Images <span className="text-white/60 text-xs">(Up to 3 images)</span>
                    </label>
                    <p className="text-xs text-white/40 mt-0.5">
                      Provide style references for video generation
                    </p>
                  </div>
                )}
                <div>
                  <button
                    onClick={() => {
                      setCustomImagePreviews([]);
                      setCustomImageFiles([]);
                      setDroppedImageUrls([]);
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-md border border-white/20 hover:border-white/30 transition-colors"
                    type="button"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Images Row */}
              <div className={imageInputMode === 'frame' ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-3 gap-3'}>
                {imageInputMode === 'frame' ? (
                  <>
                    {/* First Frame - Column 1 */}
                <div>
                  {(() => {
                    const slotIndex = 0;
                    const preview = customImagePreviews[slotIndex];

                    return (
                      <div className="relative">
                        <label
                          onDragOver={handleFileDragOver}
                          onDragLeave={handleFileDragLeave}
                          onDrop={createSlotDropHandler(slotIndex)}
                          className={`block w-full h-32 rounded-lg border-2 border-dashed cursor-pointer transition-colors overflow-hidden ${
                            isOverDropZone
                              ? 'border-white/40 bg-white/10'
                              : 'border-white/20 hover:border-white/30 bg-white/5'
                          }`}
                        >
                          {preview ? (
                            <>
                              <img
                                src={preview.url}
                                alt="First frame"
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
                              <span className="text-xs text-white/40 text-center">Drop or click to upload</span>
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

                {/* Last Frame - Column 2 */}
                <div>
                  {(() => {
                    const slotIndex = 4;
                    const preview = customImagePreviews[slotIndex];

                    return (
                      <div className="relative">
                        <label
                          onDragOver={handleFileDragOver}
                          onDragLeave={handleFileDragLeave}
                          onDrop={createSlotDropHandler(slotIndex)}
                          className={`block w-full h-32 rounded-lg border-2 border-dashed cursor-pointer transition-colors overflow-hidden ${
                            isOverDropZone
                              ? 'border-white/40 bg-white/10'
                              : 'border-white/20 hover:border-white/30 bg-white/5'
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
                              <Upload className="w-6 h-6 text-white/30 mb-1" />
                              <span className="text-xs text-white/40 text-center">Last frame</span>
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
                  </>
                ) : (
                  <>
                    {/* Reference Images - 3 slots */}
                    {[1, 2, 3].map((slotNum) => {
                      const slotIndex = slotNum;
                      const preview = customImagePreviews[slotIndex];

                      return (
                        <div key={slotIndex}>
                          <div className="relative">
                            <label
                              onDragOver={handleFileDragOver}
                              onDragLeave={handleFileDragLeave}
                              onDrop={createSlotDropHandler(slotIndex)}
                              className={`block w-full h-32 rounded-lg border-2 border-dashed cursor-pointer transition-colors overflow-hidden ${
                                isOverDropZone
                                  ? 'border-white/40 bg-white/10'
                                  : 'border-white/20 hover:border-white/30 bg-white/5'
                              }`}
                            >
                              {preview ? (
                                <>
                                  <img
                                    src={preview.url}
                                    alt={`Reference ${slotNum}`}
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
                                  <span className="text-xs text-white/40 text-center">Ref {slotNum}</span>
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
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>

          {/* Video Generation Area */}
        <div className="space-y-4">
          {/* Generate Video Button */}
          {!sceneHasVideo && (
            <button
              onClick={handleGenerateVideo}
              disabled={isGeneratingVideo}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-colors border ${
                isGeneratingVideo
                  ? 'bg-white/10 text-white/40 border-white/20 opacity-50 cursor-not-allowed'
                  : 'bg-white text-black hover:bg-white/90 border-white/20'
              }`}
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
                  ref={videoPlayerRef}
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
