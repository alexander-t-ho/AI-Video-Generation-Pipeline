'use client';

import { useProjectStore, useSceneStore, useUIStore } from '@/lib/state/project-store';
import SceneCompositionPanel from './SceneCompositionPanel';
import { Image as ImageIcon, Loader2, CheckCircle2, Trash2, ChevronDown, ChevronUp, Upload, XCircle, Copy } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { generateImage, pollImageStatus, uploadImages } from '@/lib/api-client';
import { GeneratedImage } from '@/lib/types';
import { useMediaDragDrop } from '@/lib/hooks/useMediaDragDrop';

interface GeneratingImage {
  predictionId: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  image?: GeneratedImage;
}

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
          <ImageIcon className="w-6 h-6" />
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

export default function MediaGenerationView() {
  const { project, currentSceneIndex } = useProjectStore();
  const { scenes, setSceneStatus, addGeneratedImage, selectImage, deleteGeneratedImage: removeGeneratedImage, updateScenePrompt, updateSceneSettings, duplicateScene } = useSceneStore();
  const { mediaDrawer, addChatMessage } = useUIStore();

  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatingImages, setGeneratingImages] = useState<GeneratingImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<GeneratedImage | null>(null);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [editedVideoPrompt, setEditedVideoPrompt] = useState('');
  const [editedNegativePrompt, setEditedNegativePrompt] = useState('');
  const [editedDuration, setEditedDuration] = useState<number | ''>('');
  const [customImageFiles, setCustomImageFiles] = useState<File[]>([]);
  const [customImagePreviews, setCustomImagePreviews] = useState<Array<{ url: string; source: 'file' | 'media' }>>([]);
  const [droppedImageUrls, setDroppedImageUrls] = useState<string[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
      <div className="flex items-center justify-center h-full text-white/60 p-8">
        <div className="text-center">
          <ImageIcon className="w-16 h-16 text-white/40 mx-auto mb-4" />
          <p className="text-sm">No project loaded. Create a project from the storyboard to generate images.</p>
        </div>
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

  const sceneState = scenes[currentSceneIndex];
  const sceneImages = sceneState?.generatedImages || [];

  // Filter out composition images (background, composite, reference)
  const regularImages = sceneImages.filter((img: GeneratedImage) => {
    return img.id !== currentScene.backgroundImageId &&
           img.id !== currentScene.compositeImageId &&
           img.id !== currentScene.referenceImageId;
  });
  const sceneHasImage = regularImages.length > 0;
  const selectedImage = sceneImages.find(img => img.id === (selectedImageId || sceneState?.selectedImageId));

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
      setEditedVideoPrompt(currentScene.videoPrompt || currentScene.imagePrompt);
      setEditedNegativePrompt(currentScene.negativePrompt || '');
      setEditedDuration(currentScene.customDuration || '');
      const imageInputs = currentScene.customImageInput
        ? (Array.isArray(currentScene.customImageInput) ? currentScene.customImageInput : [currentScene.customImageInput])
        : [];
      setCustomImageFiles([]);
      setDroppedImageUrls([]);
      setCustomImagePreviews(imageInputs.map(url => ({ url, source: 'media' as const })));
    }
  }, [currentSceneIndex, currentScene?.imagePrompt, currentScene?.videoPrompt, currentScene?.negativePrompt, currentScene?.customDuration, currentScene?.customImageInput]);

  const handleGenerateImage = async () => {
    if (!project?.id) return;

    setIsGeneratingImage(true);
    setGeneratingImages([]);

    const currentSelectedImageBeforeClear = selectedImage || (sceneState?.selectedImageId
      ? sceneImages.find((img: GeneratedImage) => img.id === sceneState.selectedImageId)
      : null);

    const preserveSelection = currentSelectedImageBeforeClear && currentSelectedImageBeforeClear.localPath;
    if (!preserveSelection) {
      setSelectedImageId(null);
    }

    const initialGenerating: GeneratingImage[] = Array(3).fill(null).map(() => ({
      predictionId: '',
      status: 'starting',
    }));
    setGeneratingImages(initialGenerating);

    try {
      setSceneStatus(currentSceneIndex, 'generating_image');

      let referenceImageUrls = (project.referenceImageUrls || []).slice(0, 3);
      let seedImageUrl: string | undefined = undefined;
      let seedFrameUrl: string | undefined = undefined;
      let currentSeedImageId: string | undefined = undefined;

      const useSeedImage = currentScene?.modelParameters?.useSeedImage !== false;

      // Check for media drawer seed image
      if (useSeedImage && mediaDrawer.seedImageId) {
        let foundSeedImage: any = null;

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

        if (!foundSeedImage && project.uploadedImages) {
          const foundUpload = project.uploadedImages.find((img: any) => img.id === mediaDrawer.seedImageId);
          if (foundUpload) {
            foundSeedImage = foundUpload;
          }
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
          let imageUrl = foundSeedImage.url;
          if (foundSeedImage.localPath) {
            imageUrl = foundSeedImage.localPath;
          }

          if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://') && !imageUrl.startsWith('/api')) {
            imageUrl = `/api/serve-image?path=${encodeURIComponent(imageUrl)}`;
          }

          seedImageUrl = imageUrl;
          currentSeedImageId = foundSeedImage.id;
          setSeedImageId(foundSeedImage.id);
          console.log(`[MediaGenerationView] Scene ${currentSceneIndex}: Using media drawer seed image`);
        }
      } else if (useSeedImage && currentSelectedImageBeforeClear && currentSelectedImageBeforeClear.localPath) {
        let formattedUrl = currentSelectedImageBeforeClear.localPath;
        if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://') && !formattedUrl.startsWith('/api')) {
          formattedUrl = `/api/serve-image?path=${encodeURIComponent(currentSelectedImageBeforeClear.localPath)}`;
        }
        seedImageUrl = formattedUrl;
        currentSeedImageId = currentSelectedImageBeforeClear.id;
        setSeedImageId(currentSelectedImageBeforeClear.id);
        console.log(`[MediaGenerationView] Scene ${currentSceneIndex}: Using selected image as seed image`);
      } else {
        const customImageInputs = currentScene.customImageInput
          ? (Array.isArray(currentScene.customImageInput) ? currentScene.customImageInput : [currentScene.customImageInput])
          : [];

        if (customImageInputs.length > 0) {
          seedImageUrl = customImageInputs[0];
          if (!seedImageUrl.startsWith('http://') && !seedImageUrl.startsWith('https://') && !seedImageUrl.startsWith('/api')) {
            seedImageUrl = `/api/serve-image?path=${encodeURIComponent(seedImageUrl)}`;
          }
          setSeedImageId(null);

          const customImageUrls = customImageInputs.map(url => {
            if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/api')) {
              return `/api/serve-image?path=${encodeURIComponent(url)}`;
            }
            return url;
          });
          referenceImageUrls = [...customImageUrls, ...referenceImageUrls].slice(0, 3);
        } else if (currentSceneIndex > 0) {
          const previousScene = scenes[currentSceneIndex - 1];
          if (previousScene?.seedFrames && previousScene.seedFrames.length > 0) {
            const selectedIndex = previousScene.selectedSeedFrameIndex ?? 0;
            const selectedFrame = previousScene.seedFrames[selectedIndex];

            if (selectedFrame?.url) {
              seedFrameUrl = selectedFrame.url;
              if (!seedFrameUrl.startsWith('http://') && !seedFrameUrl.startsWith('https://') && !seedFrameUrl.startsWith('/api')) {
                seedFrameUrl = `/api/serve-image?path=${encodeURIComponent(selectedFrame.localPath || selectedFrame.url)}`;
              }
              seedImageUrl = seedFrameUrl;
            }
          }
        } else if (referenceImageUrls.length > 0) {
          seedImageUrl = referenceImageUrls[0];
        }
      }

      // Generate 3 images in parallel
      const imagePromises = Array(3).fill(null).map(async (_, index) => {
        try {
          const response = await generateImage({
            prompt: currentScene.imagePrompt,
            projectId: project.id,
            sceneIndex: currentSceneIndex,
            seedImage: seedImageUrl,
            referenceImageUrls,
            seedFrame: seedFrameUrl,
            negativePrompt: currentScene.negativePrompt,
          });

          if (!response.predictionId) {
            throw new Error('Failed to get prediction ID from image generation response');
          }

          setGeneratingImages(prev => {
            const updated = [...prev];
            updated[index] = {
              predictionId: response.predictionId || '',
              status: response.status || 'starting',
            };
            return updated;
          });

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
            addGeneratedImage(currentSceneIndex, statusResponse.image);

            if (index === 0 && !preserveSelection) {
              setSelectedImageId(statusResponse.image.id);
              selectImage(currentSceneIndex, statusResponse.image.id);
            } else if (preserveSelection && currentSeedImageId === currentSelectedImageBeforeClear?.id) {
              setSelectedImageId(currentSelectedImageBeforeClear.id);
            }

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
    const selectedImg = sceneImages.find((img: GeneratedImage) => img.id === imageId);
    if (selectedImg && selectedImg.localPath) {
      setSeedImageId(imageId);
    }
  };

  const handleRegenerateImage = async () => {
    await handleGenerateImage();
  };

  const handleDeleteGeneratedImage = async (image: GeneratedImage) => {
    try {
      await import('@/lib/api-client').then(module => module.deleteGeneratedImage(image.id, image.localPath, image.s3Key));
      removeGeneratedImage(currentSceneIndex, image.id);
      if (seedImageId === image.id) {
        setSeedImageId(null);
      }
    } catch (error) {
      console.error('[MediaGenerationView] Failed to delete image:', error);
    }
  };

  const handleTogglePromptExpansion = () => {
    if (!isPromptExpanded) {
      setEditedPrompt(currentScene.imagePrompt);
      setEditedVideoPrompt(currentScene.videoPrompt || currentScene.imagePrompt);
      setEditedNegativePrompt(currentScene.negativePrompt || '');
      setEditedDuration(currentScene.customDuration || '');
      const imageInputs = currentScene.customImageInput
        ? (Array.isArray(currentScene.customImageInput) ? currentScene.customImageInput : [currentScene.customImageInput])
        : [];
      setCustomImageFiles([]);
      setDroppedImageUrls([]);
      setCustomImagePreviews(imageInputs.map(url => ({ url, source: 'media' as const })));
      setIsEditingPrompt(true);
      setIsPromptExpanded(true);
    } else {
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

    const currentCount = customImagePreviews.length;
    if (currentCount + files.length > 3) {
      alert(`You can only add up to 3 images. Currently have ${currentCount}, trying to add ${files.length}.`);
      return;
    }

    const validFiles: File[] = [];
    const previews: Array<{ url: string; source: 'file' }> = [];

    files.forEach(file => {
      if (!file.type.startsWith('image/')) {
        alert(`${file.name} is not an image file. Skipping.`);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert(`${file.name} is too large (max 10MB). Skipping.`);
        return;
      }
      validFiles.push(file);
      const previewUrl = URL.createObjectURL(file);
      previews.push({ url: previewUrl, source: 'file' });
    });

    if (validFiles.length > 0) {
      setCustomImageFiles(prev => [...prev, ...validFiles]);
      setCustomImagePreviews(prev => [...prev, ...previews]);
      setDroppedImageUrls([]);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = (index: number) => {
    const preview = customImagePreviews[index];

    if (preview.source === 'file' && preview.url.startsWith('blob:')) {
      URL.revokeObjectURL(preview.url);
    }

    setCustomImagePreviews(prev => prev.filter((_, i) => i !== index));

    if (preview.source === 'file') {
      let fileIndex = 0;
      for (let i = 0; i < index; i++) {
        if (customImagePreviews[i].source === 'file') {
          fileIndex++;
        }
      }
      setCustomImageFiles(prev => prev.filter((_, i) => i !== fileIndex));
    } else {
      const droppedIndex = customImagePreviews.slice(0, index).filter(p => p.source === 'media').length;
      setDroppedImageUrls(prev => prev.filter((_, i) => i !== droppedIndex));
    }
  };

  // Auto-save function
  const autoSave = useCallback(async (skipImages = false) => {
    if (!editedPrompt.trim()) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      let imageInputUrls: string[] = [];
      const mediaUrls: string[] = [];
      const fileUrls: string[] = [];

      if (droppedImageUrls.length > 0) {
        mediaUrls.push(...droppedImageUrls);
      } else {
        customImagePreviews
          .filter(p => p.source === 'media')
          .forEach(preview => {
            const url = preview.url.startsWith('/api/serve-image?path=')
              ? decodeURIComponent(preview.url.split('path=')[1])
              : preview.url;
            mediaUrls.push(url);
          });
      }

      if (!skipImages && customImageFiles.length > 0 && project) {
        setIsUploadingImage(true);
        try {
          const uploadResult = await uploadImages(customImageFiles, project.id, false);
          if (uploadResult.images && uploadResult.images.length > 0) {
            fileUrls.push(...uploadResult.images.map(img => img.url));
            customImagePreviews.forEach(preview => {
              if (preview.source === 'file' && preview.url.startsWith('blob:')) {
                URL.revokeObjectURL(preview.url);
              }
            });
            setCustomImageFiles([]);
          }
        } catch (error) {
          console.error('Failed to upload images:', error);
        } finally {
          setIsUploadingImage(false);
        }
      }

      imageInputUrls = [...fileUrls, ...mediaUrls];
      const imageInput = imageInputUrls.length === 0
        ? undefined
        : imageInputUrls.length === 1
          ? imageInputUrls[0]
          : imageInputUrls;

      updateSceneSettings(currentSceneIndex, {
        imagePrompt: editedPrompt.trim(),
        videoPrompt: editedVideoPrompt.trim() || editedPrompt.trim(),
        negativePrompt: editedNegativePrompt.trim() || undefined,
        customDuration: editedDuration ? Number(editedDuration) : undefined,
        customImageInput: imageInput,
      });
    }, 1000);
  }, [editedPrompt, editedVideoPrompt, editedNegativePrompt, editedDuration, customImageFiles, customImagePreviews, droppedImageUrls, currentSceneIndex, project, updateSceneSettings]);

  useEffect(() => {
    if (isPromptExpanded && editedPrompt.trim()) {
      autoSave(true);
    }
  }, [editedPrompt, editedVideoPrompt, editedNegativePrompt, editedDuration, isPromptExpanded, autoSave]);

  useEffect(() => {
    if (isPromptExpanded && (customImageFiles.length > 0 || droppedImageUrls.length > 0 || customImagePreviews.length > 0)) {
      autoSave(false);
    }
  }, [customImagePreviews.length, droppedImageUrls.length, isPromptExpanded, autoSave]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Combine generated images with generating ones
  const filteredSceneImages = sceneImages.filter((img: GeneratedImage) => {
    if (currentScene.backgroundImageId === img.id) return false;
    if (currentScene.compositeImageId === img.id) return false;
    if (currentScene.referenceImageId === img.id) return false;
    return true;
  });

  const allImages = [...filteredSceneImages];
  generatingImages.forEach((genImg, index) => {
    if (genImg.image) return;
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
                onClick={() => useProjectStore.getState().setCurrentSceneIndex(index)}
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

      {/* Main Content Area */}
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

          {/* Editable Image Prompt */}
          <div className="mt-3">
            <label className="block text-xs font-medium text-white mb-1">
              Image Prompt <span className="text-white/60">*</span>
            </label>
            <textarea
              value={editedPrompt}
              onChange={(e) => setEditedPrompt(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 text-white placeholder-white/40 resize-none backdrop-blur-sm"
              rows={4}
              placeholder="Enter image generation prompt..."
              required
            />
          </div>
        </div>

        {/* Scene Composition Panel */}
        <div className="mb-6 bg-white/5 rounded-lg border border-white/10 p-6">
          <SceneCompositionPanel sceneIndex={currentSceneIndex} />
        </div>

        {/* Image Generation Section */}
        <div className="space-y-4">
          {!sceneHasImage ? (
            <div className="flex flex-col items-center justify-center bg-white/5 rounded-lg border-2 border-dashed border-white/20 p-8">
              <ImageIcon className="w-12 h-12 text-white/40 mb-4" />
              <p className="text-sm text-white/60 mb-4">No images generated yet</p>
              <button
                onClick={handleGenerateImage}
                disabled={isGeneratingImage}
                className="flex items-center gap-2 px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-white/20"
              >
                {isGeneratingImage ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating 3 images...
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-4 h-4" />
                    Generate Images
                  </>
                )}
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-white">
                  {isGeneratingImage ? 'Generating images...' : 'Select an image'}
                </h4>
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
              </div>

              {/* Image Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {allImages.map((image, index) => {
                  const isGenerating = image.id.startsWith('generating-');
                  const generatingState = generatingImages.find((_, idx) => `generating-${idx}` === image.id);
                  const isSelected = selectedImageId === image.id || (!selectedImageId && index === 0 && !isGenerating);
                  const isLoading = isGenerating && generatingState?.status !== 'succeeded' && generatingState?.status !== 'failed';
                  const isSeedImage = seedImageId === image.id && !isGenerating && image.localPath;

                  return (
                    <div
                      key={image.id}
                      onClick={() => !isGenerating && handleSelectImage(image.id)}
                      onDoubleClick={() => !isGenerating && image.localPath && setPreviewImage(image)}
                      className={`relative group aspect-video rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                        isSelected && !isGenerating
                          ? isSeedImage
                            ? 'border-blue-400 ring-2 ring-blue-400/30 shadow-lg shadow-blue-400/20'
                            : 'border-white ring-2 ring-white/20'
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
                            <div className={`absolute top-2 right-2 backdrop-blur-sm border rounded-full p-1 ${
                              isSeedImage
                                ? 'bg-blue-500/30 border-blue-400/50 text-blue-200'
                                : 'bg-white/20 border-white/30 text-white'
                            }`}>
                              <CheckCircle2 className="w-4 h-4" />
                            </div>
                          )}
                          {isSeedImage && (
                            <div className="absolute bottom-2 left-2 bg-blue-500/80 backdrop-blur-sm border border-blue-400/50 text-white text-xs px-2 py-1 rounded font-medium">
                              Seed Image
                            </div>
                          )}
                          {!isGenerating && image.localPath && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteGeneratedImage(image);
                              }}
                              className="absolute top-2 left-2 w-8 h-8 bg-red-500/80 hover:bg-red-600/80 backdrop-blur-sm border border-red-400/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Delete image"
                            >
                              <Trash2 className="w-4 h-4 text-white" />
                            </button>
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
            </>
          )}
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
    </div>
  );
}
