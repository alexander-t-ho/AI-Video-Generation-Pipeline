'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, X, Loader2, ChevronDown } from 'lucide-react';
import { useProjectStore } from '@/lib/state/project-store';
import { GeneratedImage } from '@/lib/types';
import { generateComposite, generateImage, pollImageStatus } from '@/lib/api-client';
import { getPublicBackgrounds, publicBackgroundToUploadedImage, PublicBackground } from '@/lib/backgrounds/public-backgrounds';
import { useMediaDragDrop } from '@/lib/hooks/useMediaDragDrop';

type CompositionMode = 'scene' | 'character';

const COMPOSITION_MODE_OPTIONS: { value: CompositionMode; label: string }[] = [
  { value: 'scene', label: 'Scene Composition' },
  { value: 'character', label: 'Character Composition' },
];

interface SceneCompositionPanelProps {
  sceneIndex: number;
}

interface ImageSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  images: Array<{
    id: string;
    url: string;
    label?: string;
    originalName?: string;
  }>;
  onSelect: (imageId: string) => void;
  selectedImageId?: string;
}

function ImageSelectionModal({
  isOpen,
  onClose,
  title,
  images,
  onSelect,
  selectedImageId,
}: ImageSelectionModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl w-full max-h-[80vh] bg-black/90 border border-white/20 rounded-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/20">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white/90 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(80vh-60px)]">
          {images.length === 0 ? (
            <p className="text-xs text-white/50 text-center py-8">
              No images available
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {images.map((img) => (
                <button
                  key={img.id}
                  onClick={() => {
                    onSelect(img.id);
                    onClose();
                  }}
                  className={`relative group rounded-lg overflow-hidden border-2 transition-all ${
                    selectedImageId === img.id
                      ? 'border-blue-400 ring-2 ring-blue-400/30'
                      : 'border-white/20 hover:border-white/40'
                  }`}
                >
                  <img
                    src={img.url}
                    alt={img.label || img.originalName || 'Image'}
                    className="w-full aspect-video object-cover"
                  />
                  {img.label && (
                    <div className="absolute top-1 left-1 px-2 py-1 bg-black/70 text-white text-[10px] rounded">
                      {img.label}
                    </div>
                  )}
                  {selectedImageId === img.id && (
                    <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                        <div className="w-3 h-3 bg-white rounded-full" />
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SceneCompositionPanel({ sceneIndex }: SceneCompositionPanelProps) {
  const { project, scenes, updateSceneSettings, addGeneratedImage, selectImage, toggleReferenceImage } = useProjectStore();
  const [showBackgroundModal, setShowBackgroundModal] = useState(false);
  const [isGeneratingComposite, setIsGeneratingComposite] = useState(false);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const [publicBackgrounds, setPublicBackgrounds] = useState<PublicBackground[]>([]);
  const [backgroundPrompt, setBackgroundPrompt] = useState('');
  const [isGeneratingBackground, setIsGeneratingBackground] = useState(false);
  const [compositionMode, setCompositionMode] = useState<CompositionMode>('scene');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isGeneratingFaceSwap, setIsGeneratingFaceSwap] = useState(false);
  const [showReferenceModal, setShowReferenceModal] = useState(false);

  // Load public backgrounds on mount
  useEffect(() => {
    async function loadPublicBackgrounds() {
      const backgrounds = await getPublicBackgrounds();
      setPublicBackgrounds(backgrounds);
    }
    loadPublicBackgrounds();
  }, []);

  // Helper function to find image URL from ID
  const findImageUrl = useCallback((itemId: string) => {
    // Search in uploaded images (including processed versions)
    if (project?.uploadedImages) {
      for (const uploadedImage of project.uploadedImages) {
        // Check original image
        if (uploadedImage.id === itemId) {
          // Return the URL, handling both local paths and S3 URLs
          if (uploadedImage.url.startsWith('http://') || uploadedImage.url.startsWith('https://')) {
            return uploadedImage.url;
          } else if (uploadedImage.localPath) {
            return `/api/serve-image?path=${encodeURIComponent(uploadedImage.localPath)}`;
          } else {
            return uploadedImage.url;
          }
        }
        // Check processed versions
        const processed = uploadedImage.processedVersions?.find(p => p.id === itemId);
        if (processed) {
          if (processed.url.startsWith('http://') || processed.url.startsWith('https://')) {
            return processed.url;
          } else if (processed.localPath) {
            return `/api/serve-image?path=${encodeURIComponent(processed.localPath)}`;
          } else {
            return processed.url;
          }
        }
      }
    }

    // Search in generated images
    for (const scn of scenes) {
      const img = scn.generatedImages?.find((i: GeneratedImage) => i.id === itemId);
      if (img) return img.url;
    }

    // Search in saved images
    if (project?.savedImages) {
      const savedImg = project.savedImages.find((s: any) => s.id === itemId);
      if (savedImg) {
        if (savedImg.url.startsWith('http://') || savedImg.url.startsWith('https://')) {
          return savedImg.url;
        } else if (savedImg.localPath) {
          return `/api/serve-image?path=${encodeURIComponent(savedImg.localPath)}`;
        } else {
          return savedImg.url;
        }
      }
    }

    return null;
  }, [project, scenes]);

  // Drag-drop for per-scene reference image slots (3 reference images per scene)
  const referenceDropZone1 = useMediaDragDrop({
    dropZoneId: 'scene-reference-0',
    acceptedTypes: ['image', 'frame'],
    onDrop: (itemId, itemType) => {
      const imageUrl = findImageUrl(itemId);
      if (imageUrl) addSceneReferenceImage(imageUrl, 0);
    },
    onFilesDrop: async (files) => {
      if (!project) return;
      const { uploadImages } = await import('@/lib/api-client');
      try {
        const result = await uploadImages(files, project.id, false);
        if (result.images && result.images.length > 0) addSceneReferenceImage(result.images[0].url, 0);
      } catch (error) {
        console.error('Failed to upload reference image:', error);
      }
    },
    maxFiles: 1,
  });

  const referenceDropZone2 = useMediaDragDrop({
    dropZoneId: 'scene-reference-1',
    acceptedTypes: ['image', 'frame'],
    onDrop: (itemId, itemType) => {
      const imageUrl = findImageUrl(itemId);
      if (imageUrl) addSceneReferenceImage(imageUrl, 1);
    },
    onFilesDrop: async (files) => {
      if (!project) return;
      const { uploadImages } = await import('@/lib/api-client');
      try {
        const result = await uploadImages(files, project.id, false);
        if (result.images && result.images.length > 0) addSceneReferenceImage(result.images[0].url, 1);
      } catch (error) {
        console.error('Failed to upload reference image:', error);
      }
    },
    maxFiles: 1,
  });

  const referenceDropZone3 = useMediaDragDrop({
    dropZoneId: 'scene-reference-2',
    acceptedTypes: ['image', 'frame'],
    onDrop: (itemId, itemType) => {
      const imageUrl = findImageUrl(itemId);
      if (imageUrl) addSceneReferenceImage(imageUrl, 2);
    },
    onFilesDrop: async (files) => {
      if (!project) return;
      const { uploadImages } = await import('@/lib/api-client');
      try {
        const result = await uploadImages(files, project.id, false);
        if (result.images && result.images.length > 0) addSceneReferenceImage(result.images[0].url, 2);
      } catch (error) {
        console.error('Failed to upload reference image:', error);
      }
    },
    maxFiles: 1,
  });

  // Drag-drop for background box
  const backgroundDropZone = useMediaDragDrop({
    dropZoneId: 'background-box',
    acceptedTypes: ['image'],
    onDrop: (itemId, itemType) => {
      console.log('[SceneComposition] Background dropped:', itemId, itemType);
      updateSceneSettings(sceneIndex, { backgroundImageId: itemId });
    },
    onFilesDrop: async (files) => {
      if (!project) return;
      console.log('[SceneComposition] Files dropped on background:', files);
      const { uploadImages } = await import('@/lib/api-client');
      try {
        const result = await uploadImages(files, project.id, false);
        if (result.images && result.images.length > 0) {
          updateSceneSettings(sceneIndex, { backgroundImageId: result.images[0].id });
        }
      } catch (error) {
        console.error('Failed to upload background image:', error);
      }
    },
    maxFiles: 1,
  });

  const scene = project?.storyboard[sceneIndex];
  const sceneState = scenes[sceneIndex];

  // Get per-scene reference images (up to 3) - AI-selected based on scene type
  const getReferenceImages = () => {
    if (!project || !scene) return [null, null, null];
    // ONLY use per-scene reference images (AI-selected), no global fallback
    const refUrls = scene.referenceImageUrls || [];

    return [0, 1, 2].map(index => {
      const url = refUrls[index];
      if (!url) return null;

      // Try to find the image object from URL
      // Check uploaded images
      if (project.uploadedImages) {
        for (const uploadedImage of project.uploadedImages) {
          if (uploadedImage.url === url) return uploadedImage;
          const processed = uploadedImage.processedVersions?.find(p => p.url === url);
          if (processed) return processed;
        }
      }

      // Check generated images
      for (const scn of scenes) {
        const img = scn.generatedImages?.find((i: GeneratedImage) => i.url === url);
        if (img) return img;
      }

      // Return a minimal object with just the URL if we can't find the full object
      return { id: url, url, localPath: url };
    });
  };

  const removeReferenceImage = (slotIndex: number) => {
    if (!scene) return;
    // ONLY use per-scene reference images (AI-selected), no global fallback
    const refUrls = scene.referenceImageUrls || [];
    if (refUrls[slotIndex]) {
      // Remove from per-scene reference images
      const newRefUrls = refUrls.filter((_, index) => index !== slotIndex);
      updateSceneSettings(sceneIndex, { referenceImageUrls: newRefUrls });
    }
  };

  const addSceneReferenceImage = (imageUrl: string, slotIndex: number) => {
    if (!scene) return;
    // ONLY use per-scene reference images (AI-selected), no global fallback
    const refUrls = [...(scene.referenceImageUrls || [])];
    refUrls[slotIndex] = imageUrl;
    updateSceneSettings(sceneIndex, { referenceImageUrls: refUrls });
  };

  // Get background image
  const getBackgroundImage = () => {
    if (!scene || !project) return null;
    if (!scene.backgroundImageId) return null;

    // Check public backgrounds first
    if (scene.backgroundImageId.startsWith('public-bg-')) {
      const publicBg = publicBackgrounds.find((bg) => `public-bg-${bg.id}` === scene.backgroundImageId);
      if (publicBg) {
        return publicBackgroundToUploadedImage(publicBg);
      }
    }

    // Check generated images (backgrounds generated via the Generate Background feature)
    const generatedBg = sceneState?.generatedImages?.find((i: GeneratedImage) => i.id === scene.backgroundImageId);
    if (generatedBg) return generatedBg;

    // Check project background images
    if (project.backgroundImages) {
      for (const backgroundImage of project.backgroundImages) {
        if (backgroundImage.id === scene.backgroundImageId) return backgroundImage;
        const processed = backgroundImage.processedVersions?.find(
          (p) => p.id === scene.backgroundImageId
        );
        if (processed) return processed;
      }
    }

    return null;
  };

  // Get composite image
  const getCompositeImage = () => {
    if (!scene || !sceneState) return null;
    if (!scene.compositeImageId) return null;
    const img = sceneState.generatedImages?.find((i: GeneratedImage) => i.id === scene.compositeImageId);
    return img || null;
  };

  // Helper function to get proper image URL
  const getImageUrl = (img: any) => {
    if (!img) return '';
    const url = img.localPath || img.url;

    // Public backgrounds can be accessed directly from /sample-backgrounds/
    if (url.startsWith('/sample-backgrounds/')) {
      return url;
    }

    // API URLs and external URLs can be used directly
    if (url.startsWith('/api') || url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    // Local files need to go through the serve-image API
    return `/api/serve-image?path=${encodeURIComponent(url)}`;
  };

  const [referenceImage1, referenceImage2, referenceImage3] = getReferenceImages();
  const backgroundImage = getBackgroundImage();
  const compositeImage = getCompositeImage();

  // Get available background images for modal
  const getAvailableBackgrounds = () => {
    const bgs: Array<{ id: string; url: string; label?: string; originalName?: string }> = [];

    // Add public backgrounds first
    publicBackgrounds.forEach((bg) => {
      const uploadedImage = publicBackgroundToUploadedImage(bg);
      bgs.push({
        id: uploadedImage.id,
        url: getImageUrl(uploadedImage),
        label: 'Public',
        originalName: bg.name,
      });
    });

    if (project?.backgroundImages) {
      project.backgroundImages.forEach((backgroundImage) => {
        bgs.push({
          id: backgroundImage.id,
          url: getImageUrl(backgroundImage),
          label: 'Original',
          originalName: backgroundImage.originalName,
        });

        backgroundImage.processedVersions?.forEach((processed) => {
          bgs.push({
            id: processed.id,
            url: getImageUrl(processed),
            label: `Processed ${processed.iteration}`,
            originalName: backgroundImage.originalName,
          });
        });
      });
    }

    return bgs;
  };

  const handleBackgroundSelect = (imageId: string) => {
    updateSceneSettings(sceneIndex, { backgroundImageId: imageId });
  };

  // Get available reference images for the reference selection modal
  const getAvailableReferences = () => {
    const refs: Array<{ id: string; url: string; label?: string; originalName?: string }> = [];

    // Add uploaded images
    if (project?.uploadedImages) {
      project.uploadedImages.forEach((img) => {
        refs.push({
          id: img.id,
          url: getImageUrl(img),
          label: 'Uploaded',
          originalName: img.originalName,
        });
      });
    }

    // Add generated images from all scenes
    scenes.forEach((scn, idx) => {
      scn.generatedImages?.forEach((img: GeneratedImage) => {
        refs.push({
          id: img.id,
          url: getImageUrl(img),
          label: `Scene ${idx + 1}`,
          originalName: img.prompt?.substring(0, 30),
        });
      });
    });

    return refs;
  };

  const handleReferenceSelect = (imageId: string) => {
    updateSceneSettings(sceneIndex, { referenceImageId: imageId });
  };

  const handleGenerateBackground = async () => {
    if (!backgroundPrompt.trim() || !project) {
      alert('Please enter a background prompt');
      return;
    }

    setIsGeneratingBackground(true);
    try {
      console.log('[SceneComposition] Generating background with prompt:', backgroundPrompt);

      // Generate the background image
      const response = await generateImage({
        prompt: backgroundPrompt,
        projectId: project.id,
        sceneIndex: sceneIndex,
        negativePrompt: 'people, person, human, face, character, text, watermark, logo',
      });

      if (!response.success || !response.predictionId) {
        throw new Error(response.error || 'Failed to start background generation');
      }

      // Poll for completion
      const statusResponse = await pollImageStatus(response.predictionId, {
        interval: 2000,
        projectId: project.id,
        sceneIndex: sceneIndex,
        prompt: backgroundPrompt,
      });

      if (statusResponse.success && statusResponse.image) {
        // Add the background to generated images
        addGeneratedImage(sceneIndex, statusResponse.image);

        // Set it as the background
        updateSceneSettings(sceneIndex, {
          backgroundImageId: statusResponse.image.id,
        });

        console.log('[SceneComposition] Background generated successfully:', statusResponse.image);

        // Clear the prompt
        setBackgroundPrompt('');
      } else {
        throw new Error(statusResponse.error || 'Background generation failed');
      }
    } catch (err) {
      console.error('[SceneComposition] Error generating background:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate background';
      alert(`Error: ${errorMessage}`);
    } finally {
      setIsGeneratingBackground(false);
    }
  };

  const handleGenerateComposite = async () => {
    // Use the first two reference images and background for composite generation
    if ((!referenceImage1 && !referenceImage2) || !backgroundImage || !project) {
      alert('Please add at least one reference image (Reference 1 or 2) and select a background image first');
      return;
    }

    setIsGeneratingComposite(true);
    try {
      console.log('Generating composite with:', {
        reference1: referenceImage1,
        reference2: referenceImage2,
        background: backgroundImage,
      });

      // Get the URLs for the images - prioritize reference1, fallback to reference2
      const referenceUrl = getImageUrl(referenceImage1 || referenceImage2);
      const backgroundUrl = getImageUrl(backgroundImage);

      // Call the composite generation API
      const response = await generateComposite(
        referenceUrl,
        backgroundUrl,
        project.id,
        sceneIndex
      );

      if (response.success && response.image) {
        // Add the composite image to generated images
        addGeneratedImage(sceneIndex, response.image);

        // Update scene to mark this as the composite image
        updateSceneSettings(sceneIndex, {
          compositeImageId: response.image.id,
        });

        // Select the composite image
        selectImage(sceneIndex, response.image.id);

        console.log('Composite generated successfully:', response.image);
      } else {
        throw new Error(response.error || 'Failed to generate composite');
      }
    } catch (err) {
      console.error('Error generating composite:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate composite';
      alert(`Error: ${errorMessage}`);
    } finally {
      setIsGeneratingComposite(false);
    }
  };

  // Character Composition: Face swap using Nano Banana Pro
  const handleGenerateFaceSwap = async () => {
    if (!referenceImage1 || !backgroundImage || !project) {
      alert('Please select both Image 1 (face to swap) and Image 2 (target image) first');
      return;
    }

    setIsGeneratingFaceSwap(true);
    try {
      console.log('[SceneComposition] Generating face swap with:', {
        image1: referenceImage1,
        image2: backgroundImage,
      });

      // Get the URLs for the images
      const image1Url = getImageUrl(referenceImage1);
      const image2Url = getImageUrl(backgroundImage);

      // Call the face swap API
      const response = await fetch('/api/generate-face-swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image1Url,
          image2Url,
          projectId: project.id,
          sceneIndex,
        }),
      });

      const result = await response.json();

      if (result.success && result.image) {
        // Add the face swap result to generated images
        addGeneratedImage(sceneIndex, result.image);

        // Update scene to mark this as the composite image
        updateSceneSettings(sceneIndex, {
          compositeImageId: result.image.id,
        });

        // Select the face swap result
        selectImage(sceneIndex, result.image.id);

        console.log('[SceneComposition] Face swap generated successfully:', result.image);
      } else {
        throw new Error(result.error || 'Failed to generate face swap');
      }
    } catch (err) {
      console.error('[SceneComposition] Error generating face swap:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate face swap';
      alert(`Error: ${errorMessage}`);
    } finally {
      setIsGeneratingFaceSwap(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'reference' | 'background') => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // TODO: Upload file
      console.log(`Upload ${type} file:`, files[0]);
    }
  };

  // Early return if scene or project is not available
  if (!scene || !project) return null;

  return (
    <div className="space-y-3">
      {/* Composition Mode Dropdown */}
      <div className="relative">
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="w-full flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/10"
        >
          <span className="text-sm font-medium text-white">
            {COMPOSITION_MODE_OPTIONS.find(o => o.value === compositionMode)?.label}
          </span>
          <ChevronDown className={`w-4 h-4 text-white/60 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {isDropdownOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 z-10 bg-black/90 border border-white/20 rounded-lg overflow-hidden">
            {COMPOSITION_MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  setCompositionMode(option.value);
                  setIsDropdownOpen(false);
                }}
                className={`w-full px-3 py-2 text-sm text-left transition-colors ${
                  compositionMode === option.value
                    ? 'bg-blue-500/20 text-blue-300'
                    : 'text-white/80 hover:bg-white/10'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Composition Content */}
      <div className="space-y-3">
          {/* Use Seed Frame Toggle (only for scenes > 0 and Scene Composition mode) */}
          {compositionMode === 'scene' && sceneIndex > 0 && scenes[sceneIndex - 1]?.seedFrames && scenes[sceneIndex - 1].seedFrames!.length > 0 && (
            <div className="flex items-center justify-between px-3 py-2 bg-white/5 rounded-lg border border-white/10">
              <div className="flex-1">
                <label className="text-sm font-medium text-white cursor-pointer" htmlFor={`use-seed-frame-${sceneIndex}`}>
                  Use last frame from previous scene
                </label>
                <p className="text-xs text-white/50 mt-0.5">
                  Enable to use the last frame of Scene {sceneIndex} as the starting point
                </p>
              </div>
              <input
                id={`use-seed-frame-${sceneIndex}`}
                type="checkbox"
                checked={scene?.useSeedFrame ?? false}
                onChange={(e) => {
                  updateSceneSettings(sceneIndex, { useSeedFrame: e.target.checked });
                }}
                className="w-5 h-5 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-2 focus:ring-blue-400/30 cursor-pointer"
              />
            </div>
          )}

          {/* Character Composition Description */}
          {compositionMode === 'character' && (
            <div className="px-3 py-2 bg-purple-500/10 border border-purple-400/30 rounded-lg">
              <p className="text-xs text-purple-300">
                Swap the face of the person in Image 1 to the face of the person in Image 2
              </p>
            </div>
          )}

          {/* Scene Composition: Reference Images (3), Background & Composite (5 total) */}
          {compositionMode === 'scene' && (
            <div className="grid grid-cols-5 gap-3">
              {/* Reference Image 1 */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-white/80">Reference 1</label>
              <div
                onDrop={referenceDropZone1.handleDrop}
                onDragOver={referenceDropZone1.handleDragOver}
                onDragLeave={referenceDropZone1.handleDragLeave}
                className={`relative aspect-video rounded-lg border-2 border-dashed cursor-pointer transition-all overflow-hidden ${
                  referenceDropZone1.isOverDropZone
                    ? 'border-blue-400 bg-blue-500/10'
                    : referenceImage1
                    ? 'border-yellow-400/50 hover:border-yellow-400/80'
                    : 'border-white/20 hover:border-white/40 bg-white/5'
                }`}
              >
                {referenceImage1 ? (
                  <>
                    <img
                      src={getImageUrl(referenceImage1)}
                      alt="Reference 1"
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeReferenceImage(0);
                      }}
                      className="absolute top-1 right-1 p-1 bg-red-500/80 hover:bg-red-500 text-white rounded-full transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                    <Upload className="w-5 h-5 text-white/40" />
                    <p className="text-xs text-white/40">Drag here</p>
                  </div>
                )}
              </div>
            </div>

            {/* Reference Image 2 */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-white/80">Reference 2</label>
              <div
                onDrop={referenceDropZone2.handleDrop}
                onDragOver={referenceDropZone2.handleDragOver}
                onDragLeave={referenceDropZone2.handleDragLeave}
                className={`relative aspect-video rounded-lg border-2 border-dashed cursor-pointer transition-all overflow-hidden ${
                  referenceDropZone2.isOverDropZone
                    ? 'border-blue-400 bg-blue-500/10'
                    : referenceImage2
                    ? 'border-yellow-400/50 hover:border-yellow-400/80'
                    : 'border-white/20 hover:border-white/40 bg-white/5'
                }`}
              >
                {referenceImage2 ? (
                  <>
                    <img
                      src={getImageUrl(referenceImage2)}
                      alt="Reference 2"
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeReferenceImage(1);
                      }}
                      className="absolute top-1 right-1 p-1 bg-red-500/80 hover:bg-red-500 text-white rounded-full transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                    <Upload className="w-5 h-5 text-white/40" />
                    <p className="text-xs text-white/40">Drag here</p>
                  </div>
                )}
              </div>
            </div>

            {/* Reference Image 3 */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-white/80">Reference 3</label>
              <div
                onDrop={referenceDropZone3.handleDrop}
                onDragOver={referenceDropZone3.handleDragOver}
                onDragLeave={referenceDropZone3.handleDragLeave}
                className={`relative aspect-video rounded-lg border-2 border-dashed cursor-pointer transition-all overflow-hidden ${
                  referenceDropZone3.isOverDropZone
                    ? 'border-blue-400 bg-blue-500/10'
                    : referenceImage3
                    ? 'border-yellow-400/50 hover:border-yellow-400/80'
                    : 'border-white/20 hover:border-white/40 bg-white/5'
                }`}
              >
                {referenceImage3 ? (
                  <>
                    <img
                      src={getImageUrl(referenceImage3)}
                      alt="Reference 3"
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeReferenceImage(2);
                      }}
                      className="absolute top-1 right-1 p-1 bg-red-500/80 hover:bg-red-500 text-white rounded-full transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                    <Upload className="w-5 h-5 text-white/40" />
                    <p className="text-xs text-white/40">Drag here</p>
                  </div>
                )}
              </div>
            </div>

            {/* Image 2 Box (Background) */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-white/80">Image 2</label>
              <div
                onClick={() => setShowBackgroundModal(true)}
                onDrop={backgroundDropZone.handleDrop}
                onDragOver={backgroundDropZone.handleDragOver}
                onDragLeave={backgroundDropZone.handleDragLeave}
                className={`relative aspect-video rounded-lg border-2 border-dashed cursor-pointer transition-all overflow-hidden ${
                  backgroundDropZone.isOverDropZone
                    ? 'border-blue-400 bg-blue-500/10'
                    : backgroundImage
                    ? 'border-white/20 hover:border-white/40'
                    : 'border-white/20 hover:border-white/40 bg-white/5'
                }`}
              >
                {backgroundImage ? (
                  <img
                    src={getImageUrl(backgroundImage)}
                    alt="Background"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <Upload className="w-6 h-6 text-white/40" />
                    <p className="text-xs text-white/40">Click or drag</p>
                  </div>
                )}
                <input
                  ref={backgroundInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e, 'background')}
                />
              </div>
            </div>

            {/* Result Box (Composite/Face Swap) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-white/80">Composite</label>
                {compositeImage && !isGeneratingComposite && (
                  <button
                    onClick={handleGenerateComposite}
                    className="px-2 py-1 text-[10px] font-medium bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-400/30 rounded transition-colors"
                    title="Regenerate composite"
                  >
                    Regenerate
                  </button>
                )}
              </div>
              <div
                className="relative aspect-video rounded-lg border-2 border-white/20 overflow-hidden bg-white/5"
              >
                {compositeImage ? (
                  <img
                    src={getImageUrl(compositeImage)}
                    alt="Composite"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    {isGeneratingComposite ? (
                      <>
                        <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
                        <p className="text-xs text-white/40">Generating...</p>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={handleGenerateComposite}
                          disabled={(!referenceImage1 && !referenceImage2) || !backgroundImage}
                          className="px-3 py-2 text-xs font-medium bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-400/30 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                          title="Generate composite from reference images and background"
                        >
                          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                            <rect x="3" y="3" width="8" height="8" fill="currentColor" opacity="0.7" />
                            <rect x="13" y="3" width="8" height="8" fill="currentColor" opacity="0.5" />
                            <rect x="3" y="13" width="8" height="8" fill="currentColor" opacity="0.5" />
                            <rect x="13" y="13" width="8" height="8" fill="currentColor" opacity="0.7" />
                          </svg>
                          Generate
                        </button>
                        <p className="text-[10px] text-white/30 text-center px-2">
                          Add reference & background
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          )}

          {/* Background Generation (Scene Composition only) */}
          {compositionMode === 'scene' && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-white/80">Generate Background</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={backgroundPrompt}
                  onChange={(e) => setBackgroundPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isGeneratingBackground) {
                      handleGenerateBackground();
                    }
                  }}
                  placeholder="Describe the background scene..."
                  className="flex-1 px-3 py-2 text-xs bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400/30 text-white placeholder-white/40"
                  disabled={isGeneratingBackground}
                />
                <button
                  onClick={handleGenerateBackground}
                  disabled={isGeneratingBackground || !backgroundPrompt.trim()}
                  className="px-4 py-2 text-xs font-medium bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-400/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isGeneratingBackground ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    'Generate'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Generate Button - Conditional based on mode */}
          {referenceImage1 && backgroundImage && !compositeImage && (
            compositionMode === 'scene' ? (
              <button
                onClick={handleGenerateComposite}
                disabled={isGeneratingComposite}
                className="w-full px-3 py-2 text-xs font-medium bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-400/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGeneratingComposite ? 'Generating Composite...' : 'Generate Composite'}
              </button>
            ) : (
              <button
                onClick={handleGenerateFaceSwap}
                disabled={isGeneratingFaceSwap}
                className="w-full px-3 py-2 text-xs font-medium bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-400/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isGeneratingFaceSwap ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Swapping Faces...
                  </>
                ) : (
                  'Swap Faces'
                )}
              </button>
            )
          )}

          {/* Character Composition: Image 1, Image 2 & Result (3 columns) */}
          {compositionMode === 'character' && (
            <div className="grid grid-cols-3 gap-3">
              {/* Image 1 Box (Reference) */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-white/80">Image 1</label>
                <div
                  onDrop={referenceDropZone1.handleDrop}
                  onDragOver={referenceDropZone1.handleDragOver}
                  onDragLeave={referenceDropZone1.handleDragLeave}
                  className={`relative aspect-video rounded-lg border-2 border-dashed cursor-pointer transition-all overflow-hidden ${
                    referenceDropZone1.isOverDropZone
                      ? 'border-blue-400 bg-blue-500/10'
                      : referenceImage1
                      ? 'border-yellow-400/50 hover:border-yellow-400/80'
                      : 'border-white/20 hover:border-white/40 bg-white/5'
                  }`}
                >
                  {referenceImage1 ? (
                    <>
                      <img
                        src={getImageUrl(referenceImage1)}
                        alt="Image 1"
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeReferenceImage(0);
                        }}
                        className="absolute top-1 right-1 p-1 bg-red-500/80 hover:bg-red-500 text-white rounded-full transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                      <Upload className="w-5 h-5 text-white/40" />
                      <p className="text-xs text-white/40">Drag here</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Image 2 Box (Background) */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-white/80">Image 2</label>
                <div
                  onClick={() => setShowBackgroundModal(true)}
                  onDrop={backgroundDropZone.handleDrop}
                  onDragOver={backgroundDropZone.handleDragOver}
                  onDragLeave={backgroundDropZone.handleDragLeave}
                  className={`relative aspect-video rounded-lg border-2 border-dashed cursor-pointer transition-all overflow-hidden ${
                    backgroundDropZone.isOverDropZone
                      ? 'border-blue-400 bg-blue-500/10'
                      : backgroundImage
                      ? 'border-white/20 hover:border-white/40'
                      : 'border-white/20 hover:border-white/40 bg-white/5'
                  }`}
                >
                  {backgroundImage ? (
                    <img
                      src={getImageUrl(backgroundImage)}
                      alt="Image 2"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                      <Upload className="w-6 h-6 text-white/40" />
                      <p className="text-xs text-white/40">Click or drag</p>
                    </div>
                  )}
                  <input
                    ref={backgroundInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileSelect(e, 'background')}
                  />
                </div>
              </div>

              {/* Result Box (Face Swap) */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-white/80">Result</label>
                <div
                  className="relative aspect-video rounded-lg border-2 border-white/20 overflow-hidden bg-white/5"
                >
                  {compositeImage ? (
                    <img
                      src={getImageUrl(compositeImage)}
                      alt="Face Swap Result"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                      {isGeneratingFaceSwap ? (
                        <>
                          <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
                          <p className="text-xs text-white/40">Swapping...</p>
                        </>
                      ) : (
                        <>
                          <div className="w-6 h-6 text-white/20">
                            <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
                              <rect x="3" y="3" width="8" height="8" fill="currentColor" opacity="0.5" />
                              <rect x="13" y="3" width="8" height="8" fill="currentColor" opacity="0.3" />
                              <rect x="3" y="13" width="8" height="8" fill="currentColor" opacity="0.3" />
                              <rect x="13" y="13" width="8" height="8" fill="currentColor" opacity="0.5" />
                            </svg>
                          </div>
                          <p className="text-xs text-white/30">No result</p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
      </div>

      {/* Modals */}
      {/* Image 1 Selection Modal */}
      <ImageSelectionModal
        isOpen={showReferenceModal}
        onClose={() => setShowReferenceModal(false)}
        title={compositionMode === 'character' ? 'Select Image 1 (Face to Swap)' : 'Select Image 1 (Reference)'}
        images={getAvailableReferences()}
        onSelect={handleReferenceSelect}
        selectedImageId={scene.referenceImageId}
      />

      {/* Image 2 Selection Modal */}
      <ImageSelectionModal
        isOpen={showBackgroundModal}
        onClose={() => setShowBackgroundModal(false)}
        title={compositionMode === 'character' ? 'Select Image 2 (Target Image)' : 'Select Image 2 (Background)'}
        images={getAvailableBackgrounds()}
        onSelect={handleBackgroundSelect}
        selectedImageId={scene.backgroundImageId}
      />
    </div>
  );
}
