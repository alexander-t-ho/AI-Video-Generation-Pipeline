'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Send, Palette, Upload, X, Loader2, Sparkles, Camera } from 'lucide-react';
import { CarVariant, CustomAsset, CarReferenceImage } from './types';
import ColorPicker from './ColorPicker';
import AngleSelectionModal from './AngleSelectionModal';
import { useProjectStore } from '@/lib/state/project-store';
import { buildAssetPrompt, parseAssetRequest, validateAssetContext } from '@/lib/utils/asset-prompt-builder';
import { generateImage, pollImageStatus } from '@/lib/api-client';
import { generateAssetAngles } from '@/lib/services/asset-generation';
import type { AngleType } from '@/lib/types';

interface AssetViewerProps {
  selectedCar: CarVariant | CustomAsset | null;
  onAddRecoloredImage?: (baseCarId: string, imageUrl: string, colorHex: string) => void;
  onAddCustomAsset?: (baseCarId: string, name: string) => void;
  onUploadImages?: () => void;
  onRemoveImage?: (assetId: string, imageId: string) => void;
  isUploading?: boolean;
}

export default function AssetViewer({
  selectedCar,
  onAddRecoloredImage,
  onAddCustomAsset,
  onUploadImages,
  onRemoveImage,
  isUploading = false
}: AssetViewerProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [adjustmentText, setAdjustmentText] = useState('');
  const [naturalLanguageRequest, setNaturalLanguageRequest] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isRecoloring, setIsRecoloring] = useState(false);
  const [recolorError, setRecolorError] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [isAngleModalOpen, setIsAngleModalOpen] = useState(false);
  const [isGeneratingAngles, setIsGeneratingAngles] = useState(false);
  const [angleGenerationProgress, setAngleGenerationProgress] = useState<{ current: number; total: number; angle: string } | null>(null);
  const [angleGenerationError, setAngleGenerationError] = useState<string | null>(null);

  const images = selectedCar?.referenceImages || [];
  const currentImage = images[currentImageIndex];
  
  // Get project store state and actions
  const { 
    project,
    setSelectedColor: storeSelectedColor, 
    setCurrentReferenceImageUrl 
  } = useProjectStore();

  // Reset to first image and clear selected color when selected car changes
  useEffect(() => {
    setCurrentImageIndex(0);
    setSelectedColor(null);
  }, [selectedCar]);

  // Ensure currentImageIndex is valid
  useEffect(() => {
    if (images.length > 0 && currentImageIndex >= images.length) {
      setCurrentImageIndex(0);
    }
  }, [images.length, currentImageIndex]);
  
  // Store current reference image URL in project state when it changes
  useEffect(() => {
    if (currentImage?.url) {
      setCurrentReferenceImageUrl(currentImage.url);
    }
  }, [currentImage?.url, setCurrentReferenceImageUrl]);

  // Keyboard navigation
  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    if (images.length === 0) return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setCurrentImageIndex(prev => prev > 0 ? prev - 1 : images.length - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setCurrentImageIndex(prev => prev < images.length - 1 ? prev + 1 : 0);
    }
  }, [images.length]);


  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [handleKeyPress]);

  const handlePreviousImage = () => {
    setCurrentImageIndex(prev => prev > 0 ? prev - 1 : images.length - 1);
  };

  const handleNextImage = () => {
    setCurrentImageIndex(prev => prev < images.length - 1 ? prev + 1 : 0);
  };

  const handleThumbnailClick = (index: number) => {
    setCurrentImageIndex(index);
  };

  const handleAdjustmentSubmit = () => {
    // Visual only for mock-up - in real implementation this would trigger image generation
    console.log('Adjustment requested:', adjustmentText);
    setAdjustmentText('');
  };
  
  const handleNaturalLanguageRequest = async () => {
    if (!naturalLanguageRequest.trim()) return;
    
    setIsGenerating(true);
    setGenerationError(null);
    
    try {
      // Validate context
      const validation = validateAssetContext(
        project?.assetDescription,
        project?.currentReferenceImageUrl
      );
      
      if (!validation.valid) {
        throw new Error(`Missing required context: ${validation.missingFields.join(', ')}`);
      }
      
      // Parse the request
      const parsed = parseAssetRequest(naturalLanguageRequest);
      
      if (!parsed.isGenerationRequest) {
        throw new Error('Request does not appear to be a generation command. Try phrases like "create a front view" or "generate a side angle".');
      }
      
      // Build the prompt
      const prompt = buildAssetPrompt(
        naturalLanguageRequest,
        project!.assetDescription!,
        parsed.usesColor ? project?.selectedColor : undefined
      );
      
      console.log('[AssetViewer] Generated prompt:', prompt);
      console.log('[AssetViewer] Using reference image:', project!.currentReferenceImageUrl);
      
      // Get project ID (or use a default for brand identity)
      const projectId = project?.id || 'brand-identity-generation';
      
      // Generate image using current reference image
      // Use Google Imagen 4 for fast, high-quality single image generation
      const response = await generateImage({
        prompt,
        projectId,
        sceneIndex: 0,
        seedImage: project!.currentReferenceImageUrl,
        referenceImageUrls: [project!.currentReferenceImageUrl!],
      }, {
        model: 'google/imagen-4'
      });
      
      if (!response.success || !response.predictionId) {
        throw new Error(response.error || 'Failed to start image generation');
      }
      
      // Poll for completion
      const status = await pollImageStatus(response.predictionId);
      
      if (!status.success || !status.image) {
        throw new Error(status.error || 'Image generation failed');
      }
      
      // Add the generated image to the asset's reference images
      if (onAddRecoloredImage && selectedCar) {
        const generatedColor = parsed.usesColor && project?.selectedColor 
          ? project.selectedColor 
          : '#FFFFFF';
        onAddRecoloredImage(selectedCar.id, status.image.url, generatedColor);
      }
      
      // Clear the input
      setNaturalLanguageRequest('');
      
      console.log('[AssetViewer] Image generated successfully:', status.image.url);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setGenerationError(errorMessage);
      console.error('[AssetViewer] Generation failed:', errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleColorSelect = async (color: string) => {
    if (!currentImage || !selectedCar) return;

    setSelectedColor(color);
    // Store selected color in project state
    storeSelectedColor(color);
    
    setIsRecoloring(true);
    setRecolorError(null);

    try {
      // Ensure we have a publicly accessible URL for the AI model
      let imageUrl = currentImage.url;

      // Check if we have an s3Key in the image data (for custom assets)
      if ((currentImage as any).s3Key) {
        // Use the s3Key to construct the S3 URL
        const bucket = process.env.NEXT_PUBLIC_AWS_S3_BUCKET || 'ai-video-pipeline-outputs';
        const region = process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1';
        imageUrl = `https://${bucket}.s3.${region}.amazonaws.com/${(currentImage as any).s3Key}`;
        console.log('Using S3 URL for recoloring:', imageUrl);
      } else if (imageUrl.includes('/api/serve-image?path=')) {
        // For serve-image URLs (local files), we need to upload to S3 first
        console.log('Local serve-image URL detected, attempting to upload to S3 for recoloring:', imageUrl);

        try {
          // Extract the actual file path from serve-image URLs
          const urlParams = new URLSearchParams(imageUrl.split('?')[1]);
          const filePath = urlParams.get('path') || imageUrl;

          const uploadResponse = await fetch('/api/upload-image-s3', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imagePath: filePath,
              projectId: 'brand-identity-recolor-upload',
            }),
          });

          const uploadData = await uploadResponse.json();
          if (uploadData.success && uploadData.data?.s3Url) {
            imageUrl = uploadData.data.s3Url;
            console.log('Successfully uploaded image to S3 for recoloring:', imageUrl);
          } else {
            throw new Error('Failed to upload image to S3');
          }
        } catch (uploadError) {
          console.error('Failed to upload image to S3:', uploadError);
          // Continue with the original URL - FLUX-dev might be able to handle it
        }
      } else {
        // For external URLs (like Unsplash), use them directly - FLUX-dev can handle them
        console.log('Using external URL directly for recoloring:', imageUrl);
      }

      // Call the recolor API
      const response = await fetch('/api/recolor-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageUrl: imageUrl,
          colorHex: color,
          projectId: 'brand-identity-recolor', // Use a fixed project ID for now
          sceneIndex: 0,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to recolor image');
      }

      // Create a custom asset with the recolored image
      if (onAddRecoloredImage && selectedCar) {
        onAddRecoloredImage(selectedCar.id, data.image.url, color);
      }

      console.log('Recolored image generated and added to custom assets');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setRecolorError(errorMessage);
      console.error('Recoloring failed:', errorMessage);
    } finally {
      setIsRecoloring(false);
    }
  };

  const handleGenerateAngles = async (selectedAngles: AngleType[]) => {
    if (!currentImage || !selectedCar) return;

    setIsGeneratingAngles(true);
    setAngleGenerationError(null);
    setAngleGenerationProgress(null);

    try {
      // Validate context
      const assetDescription = 'displayName' in selectedCar 
        ? selectedCar.displayName 
        : selectedCar.name;
      
      console.log('[AssetViewer] Starting angle generation');
      console.log('[AssetViewer] Asset:', assetDescription);
      console.log('[AssetViewer] Reference image:', currentImage.url);
      console.log('[AssetViewer] Selected angles:', selectedAngles);

      // Generate angles using the service
      const results = await generateAssetAngles({
        assetDescription,
        referenceImageUrl: currentImage.url,
        selectedAngles,
        projectId: project?.id || 'brand-identity-angles',
        color: selectedColor || undefined,
        onProgress: (current, total, angle) => {
          console.log(`[AssetViewer] Progress: ${current}/${total} - ${angle}`);
          setAngleGenerationProgress({ current, total, angle });
        },
      });

      console.log(`[AssetViewer] Generated ${results.length} angles`);

      // Add all generated images to the asset's reference images
      if (onAddRecoloredImage && selectedCar) {
        console.log(`[AssetViewer] Adding ${results.length} generated images to asset ${selectedCar.id}`);
        results.forEach((result, index) => {
          console.log(`[AssetViewer] Adding image ${index + 1}: ${result.url.substring(0, 50)}...`);
          onAddRecoloredImage(
            selectedCar.id,
            result.url,
            selectedColor || '#FFFFFF'
          );
        });
        console.log('[AssetViewer] All images added to custom assets');
      } else {
        console.warn('[AssetViewer] Cannot add images - missing callback or selected car');
      }

      // Close modal and reset state
      setIsAngleModalOpen(false);
      setAngleGenerationProgress(null);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setAngleGenerationError(errorMessage);
      console.error('[AssetViewer] Angle generation failed:', errorMessage);
    } finally {
      setIsGeneratingAngles(false);
    }
  };


  if (!selectedCar) {
    return (
      <div className="h-full flex items-center justify-center bg-white/5 border border-white/20 rounded-3xl backdrop-blur-sm">
        <div className="text-center text-white/40">
          <div className="text-lg mb-2">No car selected</div>
          <div className="text-sm">Choose a vehicle from the left panel</div>
        </div>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-white/5 border border-white/20 rounded-3xl backdrop-blur-sm">
        <div className="text-center text-white/40">
          <div className="text-lg mb-2">No reference images</div>
          <div className="text-sm">This vehicle has no reference images available</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white/5 border border-white/20 rounded-3xl backdrop-blur-sm overflow-hidden">
      {/* Main Image Display */}
      <div className="relative flex items-center justify-center p-4 sm:p-6 flex-1 min-h-[300px] max-h-[50vh] lg:max-h-none">
        {/* Navigation Arrows */}
        {images.length > 1 && (
          <>
            <button
              onClick={handlePreviousImage}
              className="absolute left-2 sm:left-4 z-10 p-2 sm:p-3 bg-black/50 hover:bg-black/70 text-white rounded-full transition-all backdrop-blur-sm"
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
            <button
              onClick={handleNextImage}
              className="absolute right-2 sm:right-4 z-10 p-2 sm:p-3 bg-black/50 hover:bg-black/70 text-white rounded-full transition-all backdrop-blur-sm"
            >
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </>
        )}

        {/* Main Image */}
        <div className="relative w-full h-full max-w-full max-h-full">
          {currentImage && (
            <img
              src={currentImage.url}
              alt={currentImage.alt}
              className="w-full h-full max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            />
          )}
        </div>

        {/* Image Counter */}
        {images.length > 0 && (
          <div className="absolute bottom-2 sm:bottom-4 left-1/2 transform -translate-x-1/2 bg-black/50 text-white px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm backdrop-blur-sm">
            {currentImageIndex + 1} / {images.length}
          </div>
        )}
      </div>

      {/* Thumbnail Strip */}
      {(images.length > 1 || (selectedCar && onUploadImages)) && (
        <div className="p-3 sm:p-4 border-t border-white/10 flex-shrink-0">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
            {/* Upload button - always available when a car is selected */}
            {selectedCar && onUploadImages && (
              <button
                onClick={onUploadImages}
                disabled={isUploading}
                className="flex-shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-lg border-2 border-dashed border-white/40 hover:border-white/60 transition-all flex items-center justify-center bg-white/5 hover:bg-white/10 disabled:opacity-50"
                title="Upload images"
              >
                {isUploading ? (
                  <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 text-white/60 animate-spin" />
                ) : (
                  <Upload className="w-5 h-5 sm:w-6 sm:h-6 text-white/60" />
                )}
              </button>
            )}

            {images.map((image, index) => (
              <div key={image.id} className="relative flex-shrink-0 group">
                <button
                  onClick={() => handleThumbnailClick(index)}
                  className={`w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden border-2 transition-all ${
                    index === currentImageIndex
                      ? 'border-white shadow-lg'
                      : 'border-white/20 hover:border-white/40'
                  }`}
                >
                  <img
                    src={image.url}
                    alt={image.alt}
                    className="w-full h-full object-cover"
                  />
                </button>

                {/* Remove button for custom assets */}
                {selectedCar && 'adjustments' in selectedCar && onRemoveImage && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveImage(selectedCar.id, image.id);
                    }}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg border-2 border-white/20 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    title="Remove image"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Adjustments Input */}
      <div className="p-4 sm:p-6 border-t border-white/10 flex-shrink-0 overflow-y-auto max-h-[40vh]">
        {/* Natural Language Generation Input */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-3">
          <input
            type="text"
            placeholder="E.g., 'create a front angle view in this color'"
            value={naturalLanguageRequest}
            onChange={(e) => setNaturalLanguageRequest(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && naturalLanguageRequest.trim() && !isGenerating) {
                handleNaturalLanguageRequest();
              }
            }}
            disabled={isGenerating}
            className="flex-1 px-3 sm:px-4 py-2 sm:py-3 bg-white/5 border border-white/20 rounded-xl text-sm sm:text-base text-white placeholder-white/40 focus:outline-none focus:border-white/40 transition-all disabled:opacity-50"
          />
          <button
            onClick={handleNaturalLanguageRequest}
            disabled={!naturalLanguageRequest.trim() || isGenerating}
            className="px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-purple-500/20 to-blue-500/20 hover:from-purple-500/30 hover:to-blue-500/30 disabled:bg-white/5 disabled:opacity-50 border border-purple-400/30 disabled:border-white/10 rounded-xl text-white text-sm sm:text-base transition-all flex items-center justify-center gap-2 whitespace-nowrap"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>{isGenerating ? 'Generating...' : 'Generate'}</span>
          </button>
        </div>
        
        {/* Generation Error Message */}
        {generationError && (
          <div className="mb-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {generationError}
          </div>
        )}
        
        {/* Divider */}
        <div className="relative mb-3">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10"></div>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-black px-2 text-white/40">or</span>
          </div>
        </div>
        
        {/* Adjustments Input */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-3">
          <input
            type="text"
            placeholder="Would you like any adjustments?"
            value={adjustmentText}
            onChange={(e) => setAdjustmentText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && adjustmentText.trim()) {
                handleAdjustmentSubmit();
              }
            }}
            className="flex-1 px-3 sm:px-4 py-2 sm:py-3 bg-white/5 border border-white/20 rounded-xl text-sm sm:text-base text-white placeholder-white/40 focus:outline-none focus:border-white/40 transition-all"
          />
          <button
            onClick={handleAdjustmentSubmit}
            disabled={!adjustmentText.trim()}
            className="px-4 sm:px-6 py-2 sm:py-3 bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:opacity-50 border border-white/20 disabled:border-white/10 rounded-xl text-white text-sm sm:text-base transition-all flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Send className="w-4 h-4" />
            <span>Request</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={() => setIsColorPickerOpen(true)}
            disabled={isRecoloring}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:opacity-50 border border-white/20 disabled:border-white/10 rounded-xl text-white text-sm transition-all"
          >
            <Palette className="w-4 h-4" />
            <span className="hidden sm:inline">Change Color</span>
            <span className="sm:hidden">Color</span>
            {isRecoloring && (
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            )}
          </button>

          <button
            onClick={() => setIsAngleModalOpen(true)}
            disabled={isGeneratingAngles}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:opacity-50 border border-white/20 disabled:border-white/10 rounded-xl text-white text-sm transition-all"
          >
            <Camera className="w-4 h-4" />
            <span className="hidden sm:inline">Generate Turnaround</span>
            <span className="sm:hidden">Turnaround</span>
            {isGeneratingAngles && (
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            )}
          </button>
          
          {/* Selected Color Display */}
          {selectedColor && (
            <div className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white/10 border border-white/20 rounded-xl">
              <div 
                className="w-4 h-4 sm:w-5 sm:h-5 rounded-full border border-white/30 shadow-sm flex-shrink-0"
                style={{ backgroundColor: selectedColor }}
                title={selectedColor}
              />
              <span className="text-white/80 text-xs sm:text-sm font-mono">{selectedColor.toUpperCase()}</span>
            </div>
          )}
        </div>

        {/* Progress Indicator for Angle Generation */}
        {isGeneratingAngles && angleGenerationProgress && (
          <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-blue-400 text-sm font-medium">
                Generating angle {angleGenerationProgress.current} of {angleGenerationProgress.total}
              </span>
              <span className="text-blue-400/60 text-xs">
                {angleGenerationProgress.angle}
              </span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-blue-500 to-purple-500 h-full transition-all duration-300"
                style={{ width: `${(angleGenerationProgress.current / angleGenerationProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Angle Generation Error Message */}
        {angleGenerationError && (
          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {angleGenerationError}
          </div>
        )}

        {/* Error Message */}
        {recolorError && (
          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {recolorError}
          </div>
        )}

        <div className="text-xs text-white/40 mt-2 hidden sm:block">
          Use arrow keys to navigate images
        </div>
      </div>

      {/* Color Picker Modal */}
      <ColorPicker
        isOpen={isColorPickerOpen}
        onClose={() => setIsColorPickerOpen(false)}
        onColorSelect={handleColorSelect}
        presetColors={(selectedCar as CarVariant)?.availableColors}
        selectedColor={selectedColor || undefined}
      />

      {/* Angle Selection Modal */}
      <AngleSelectionModal
        isOpen={isAngleModalOpen}
        onClose={() => setIsAngleModalOpen(false)}
        onGenerate={handleGenerateAngles}
        currentImageUrl={currentImage?.url}
        isGenerating={isGeneratingAngles}
      />

    </div>
  );
}
