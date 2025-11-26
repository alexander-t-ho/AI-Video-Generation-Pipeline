'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, X, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useProjectStore } from '@/lib/state/project-store';
import { GeneratedImage } from '@/lib/types';
import { generateComposite, generateImage, pollImageStatus } from '@/lib/api-client';
import { getPublicBackgrounds, publicBackgroundToUploadedImage, PublicBackground } from '@/lib/backgrounds/public-backgrounds';
import { useMediaDragDrop } from '@/lib/hooks/useMediaDragDrop';

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
  const { project, scenes, updateSceneSettings, addGeneratedImage, toggleReferenceImage } = useProjectStore();
  const [showBackgroundModal, setShowBackgroundModal] = useState(false);
  const [isGeneratingComposite, setIsGeneratingComposite] = useState(false);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const [publicBackgrounds, setPublicBackgrounds] = useState<PublicBackground[]>([]);
  const [backgroundPrompt, setBackgroundPrompt] = useState('');
  const [isGeneratingBackground, setIsGeneratingBackground] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

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
    // Search in uploaded images
    if (project?.uploadedImages) {
      for (const uploadedImage of project.uploadedImages) {
        if (uploadedImage.id === itemId) return uploadedImage.localPath || uploadedImage.url;
        const processed = uploadedImage.processedVersions?.find(p => p.id === itemId);
        if (processed) return processed.localPath || processed.url;
      }
    }

    // Search in generated images
    for (const scn of scenes) {
      const img = scn.generatedImages?.find((i: GeneratedImage) => i.id === itemId);
      if (img) return img.localPath || img.url;
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
        // Add the composite image to generated images (Zustand store)
        console.log('[SceneComposition] Adding composite to generated images:', {
          sceneIndex,
          imageId: response.image.id,
          imageUrl: response.image.url,
        });
        addGeneratedImage(sceneIndex, response.image);

        // Persist to database
        const currentScene = project.storyboard[sceneIndex];
        if (currentScene?.id) {
          try {
            console.log('[SceneComposition] Persisting composite to database...');
            const dbResponse = await fetch(`/api/projects/${project.id}/scenes/${currentScene.id}/images`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                url: response.image.url,
                s3Key: response.image.s3Key,
                localPath: response.image.localPath,
                prompt: response.image.prompt,
                replicateId: response.image.replicateId,
                isSelected: false,
              }),
            });

            if (!dbResponse.ok) {
              console.warn('[SceneComposition] Failed to persist composite to database:', await dbResponse.text());
            } else {
              console.log('[SceneComposition] Composite persisted to database successfully');
            }
          } catch (dbError) {
            console.warn('[SceneComposition] Error persisting composite to database:', dbError);
            // Don't throw - the image is still in the store and usable
          }
        }

        // Update scene to mark this as the composite image
        updateSceneSettings(sceneIndex, {
          compositeImageId: response.image.id,
        });

        // Don't auto-select the composite - let user drag it to video tab in manual mode

        console.log('[SceneComposition] Composite generated successfully and added to Media Drawer:', response.image);
        alert('✓ Composite generated! Check the "Generated Images" section in the Media Drawer.');
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
      {/* Collapsible Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/10"
      >
        <span className="text-sm font-medium text-white">Scene Composition</span>
        {isCollapsed ? (
          <ChevronDown className="w-4 h-4 text-white/60" />
        ) : (
          <ChevronUp className="w-4 h-4 text-white/60" />
        )}
      </button>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <>
          {/* Use Seed Frame Toggle (only for scenes > 0) */}
          {sceneIndex > 0 && scenes[sceneIndex - 1]?.seedFrames && scenes[sceneIndex - 1].seedFrames!.length > 0 && (
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

          {/* Reference Images (3), Background & Composite (5 total) */}
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

            {/* Background Box */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-white/80">Background</label>
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

            {/* Composite Box */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-white/80">Composite</label>
              <div
                className="relative aspect-video rounded-lg border-2 border-white/20 overflow-hidden bg-white/5"
              >
                {compositeImage ? (
                  <>
                    <img
                      src={getImageUrl(compositeImage)}
                      alt="Composite"
                      className="w-full h-full object-cover"
                    />
                    {!isGeneratingComposite && (
                      <button
                        onClick={handleGenerateComposite}
                        className="absolute top-1 right-1 px-2 py-1 text-[10px] font-medium bg-blue-500/80 hover:bg-blue-500 text-white border border-blue-400/30 rounded transition-colors"
                        title="Regenerate composite"
                      >
                        Regenerate
                      </button>
                    )}
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    {isGeneratingComposite ? (
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
                        <p className="text-xs text-white/40">Generating...</p>
                      </div>
                    ) : (
                      <button
                        onClick={handleGenerateComposite}
                        disabled={(!referenceImage1 && !referenceImage2) || !backgroundImage}
                        className="px-3 py-2 text-xs font-medium bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-400/30 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
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
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Background Generation */}
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
        </>
      )}

      {/* Modals - outside collapsible section */}
      {/* Background Selection Modal */}
      <ImageSelectionModal
        isOpen={showBackgroundModal}
        onClose={() => setShowBackgroundModal(false)}
        title="Select Background Image"
        images={getAvailableBackgrounds()}
        onSelect={handleBackgroundSelect}
        selectedImageId={scene.backgroundImageId}
      />
    </div>
  );
}
