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
  const { project, scenes, updateSceneSettings, addGeneratedImage, selectImage } = useProjectStore();
  const [showReferenceModal, setShowReferenceModal] = useState(false);
  const [showBackgroundModal, setShowBackgroundModal] = useState(false);
  const [isGeneratingComposite, setIsGeneratingComposite] = useState(false);
  const referenceInputRef = useRef<HTMLInputElement>(null);
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

  // Drag-drop for reference box
  const referenceDropZone = useMediaDragDrop({
    dropZoneId: 'reference-box',
    acceptedTypes: ['image', 'frame'],
    onDrop: (itemId, itemType) => {
      console.log('[SceneComposition] Reference dropped:', itemId, itemType);
      updateSceneSettings(sceneIndex, { referenceImageId: itemId });
    },
  });

  // Drag-drop for background box
  const backgroundDropZone = useMediaDragDrop({
    dropZoneId: 'background-box',
    acceptedTypes: ['image'],
    onDrop: (itemId, itemType) => {
      console.log('[SceneComposition] Background dropped:', itemId, itemType);
      updateSceneSettings(sceneIndex, { backgroundImageId: itemId });
    },
  });

  const scene = project?.storyboard[sceneIndex];
  const sceneState = scenes[sceneIndex];

  // Get reference image
  const getReferenceImage = () => {
    if (!scene || !project) return null;
    if (!scene.referenceImageId) return null;

    // Check uploaded images
    if (project.uploadedImages) {
      for (const uploadedImage of project.uploadedImages) {
        if (uploadedImage.id === scene.referenceImageId) return uploadedImage;
        const processed = uploadedImage.processedVersions?.find(
          (p) => p.id === scene.referenceImageId
        );
        if (processed) return processed;
      }
    }

    // Check generated images
    for (const scn of scenes) {
      const img = scn.generatedImages?.find((i: GeneratedImage) => i.id === scene.referenceImageId);
      if (img) return img;
    }

    return null;
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

  const referenceImage = getReferenceImage();
  const backgroundImage = getBackgroundImage();
  const compositeImage = getCompositeImage();

  // Get available reference images for modal
  const getAvailableReferences = () => {
    const refs: Array<{ id: string; url: string; label?: string; originalName?: string }> = [];

    // Add uploaded images
    if (project?.uploadedImages) {
      project.uploadedImages.forEach((uploadedImage) => {
        refs.push({
          id: uploadedImage.id,
          url: getImageUrl(uploadedImage),
          label: 'Original',
          originalName: uploadedImage.originalName,
        });

        uploadedImage.processedVersions?.forEach((processed) => {
          refs.push({
            id: processed.id,
            url: getImageUrl(processed),
            label: `Processed ${processed.iteration}`,
            originalName: uploadedImage.originalName,
          });
        });
      });
    }

    // Add generated images
    scenes.forEach((scn, idx) => {
      scn.generatedImages?.forEach((img: GeneratedImage) => {
        refs.push({
          id: img.id,
          url: getImageUrl(img),
          label: `Scene ${idx + 1}`,
        });
      });
    });

    return refs;
  };

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

  const handleReferenceSelect = (imageId: string) => {
    updateSceneSettings(sceneIndex, { referenceImageId: imageId });
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
    if (!referenceImage || !backgroundImage || !project) {
      alert('Please select both a reference image and a background image first');
      return;
    }

    setIsGeneratingComposite(true);
    try {
      console.log('Generating composite with:', {
        reference: referenceImage,
        background: backgroundImage,
      });

      // Get the URLs for the images
      const referenceUrl = getImageUrl(referenceImage);
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
          {/* Reference, Background & Composite */}
          <div className="grid grid-cols-3 gap-3">
            {/* Reference Box */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-white/80">Reference</label>
              <div
                onClick={() => setShowReferenceModal(true)}
                onDrop={referenceDropZone.handleDrop}
                onDragOver={referenceDropZone.handleDragOver}
                onDragLeave={referenceDropZone.handleDragLeave}
                className={`relative aspect-video rounded-lg border-2 border-dashed cursor-pointer transition-all overflow-hidden ${
                  referenceDropZone.isOverDropZone
                    ? 'border-blue-400 bg-blue-500/10'
                    : referenceImage
                    ? 'border-white/20 hover:border-white/40'
                    : 'border-white/20 hover:border-white/40 bg-white/5'
                }`}
              >
                {referenceImage ? (
                  <img
                    src={getImageUrl(referenceImage)}
                    alt="Reference"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <Upload className="w-6 h-6 text-white/40" />
                    <p className="text-xs text-white/40">Click or drag</p>
                  </div>
                )}
                <input
                  ref={referenceInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e, 'reference')}
                />
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
                        <div className="w-6 h-6 text-white/20">
                          <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
                            <rect x="3" y="3" width="8" height="8" fill="currentColor" opacity="0.5" />
                            <rect x="13" y="3" width="8" height="8" fill="currentColor" opacity="0.3" />
                            <rect x="3" y="13" width="8" height="8" fill="currentColor" opacity="0.3" />
                            <rect x="13" y="13" width="8" height="8" fill="currentColor" opacity="0.5" />
                          </svg>
                        </div>
                        <p className="text-xs text-white/30">No composite</p>
                      </>
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

          {/* Generate Composite Button */}
          {referenceImage && backgroundImage && !compositeImage && (
            <button
              onClick={handleGenerateComposite}
              disabled={isGeneratingComposite}
              className="w-full px-3 py-2 text-xs font-medium bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-400/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingComposite ? 'Generating Composite...' : 'Generate Composite'}
            </button>
          )}
        </>
      )}

      {/* Modals - outside collapsible section */}
      {/* Reference Selection Modal */}
      <ImageSelectionModal
        isOpen={showReferenceModal}
        onClose={() => setShowReferenceModal(false)}
        title="Select Reference Image"
        images={getAvailableReferences()}
        onSelect={handleReferenceSelect}
        selectedImageId={scene.referenceImageId}
      />

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
