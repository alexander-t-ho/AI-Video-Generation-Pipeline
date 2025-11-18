'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Send, Palette, Upload, X, Loader2 } from 'lucide-react';
import { CarVariant, CustomAsset, CarReferenceImage } from './types';
import ColorPicker from './ColorPicker';

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
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isRecoloring, setIsRecoloring] = useState(false);
  const [recolorError, setRecolorError] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  const images = selectedCar?.referenceImages || [];
  const currentImage = images[currentImageIndex];

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

  const handleColorSelect = async (color: string) => {
    if (!currentImage || !selectedCar) return;

    setSelectedColor(color);
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
    <div className="h-full grid grid-rows-[1fr_auto_auto] bg-white/5 border border-white/20 rounded-3xl backdrop-blur-sm overflow-hidden">
      {/* Main Image Display */}
      <div className="relative flex items-center justify-center p-6 min-h-0">
        {/* Navigation Arrows */}
        {images.length > 1 && (
          <>
            <button
              onClick={handlePreviousImage}
              className="absolute left-4 z-10 p-3 bg-black/50 hover:bg-black/70 text-white rounded-full transition-all backdrop-blur-sm"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={handleNextImage}
              className="absolute right-4 z-10 p-3 bg-black/50 hover:bg-black/70 text-white rounded-full transition-all backdrop-blur-sm"
            >
              <ChevronRight className="w-6 h-6" />
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
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm backdrop-blur-sm">
            {currentImageIndex + 1} / {images.length}
          </div>
        )}
      </div>

      {/* Thumbnail Strip */}
      {(images.length > 1 || (selectedCar && onUploadImages)) && (
        <div className="p-4 border-t border-white/10 min-h-0">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {/* Upload button - always available when a car is selected */}
            {selectedCar && onUploadImages && (
              <button
                onClick={onUploadImages}
                disabled={isUploading}
                className="flex-shrink-0 w-16 h-16 rounded-lg border-2 border-dashed border-white/40 hover:border-white/60 transition-all flex items-center justify-center bg-white/5 hover:bg-white/10 disabled:opacity-50"
                title="Upload images"
              >
                {isUploading ? (
                  <Loader2 className="w-6 h-6 text-white/60 animate-spin" />
                ) : (
                  <Upload className="w-6 h-6 text-white/60" />
                )}
              </button>
            )}

            {images.map((image, index) => (
              <div key={image.id} className="relative flex-shrink-0 group">
                <button
                  onClick={() => handleThumbnailClick(index)}
                  className={`w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
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
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove image"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Adjustments Input */}
      <div className="p-6 border-t border-white/10 min-h-0">
        <div className="flex gap-3 mb-3">
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
            className="flex-1 px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-white/40 transition-all"
          />
          <button
            onClick={handleAdjustmentSubmit}
            disabled={!adjustmentText.trim()}
            className="px-6 py-3 bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:opacity-50 border border-white/20 disabled:border-white/10 rounded-xl text-white transition-all flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Request</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsColorPickerOpen(true)}
            disabled={isRecoloring}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:opacity-50 border border-white/20 disabled:border-white/10 rounded-xl text-white transition-all"
          >
            <Palette className="w-4 h-4" />
            <span>Change Color</span>
            {isRecoloring && (
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            )}
          </button>
          
          {/* Selected Color Display */}
          {selectedColor && (
            <div className="flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/20 rounded-xl">
              <div 
                className="w-5 h-5 rounded-full border border-white/30 shadow-sm"
                style={{ backgroundColor: selectedColor }}
                title={selectedColor}
              />
              <span className="text-white/80 text-sm font-mono">{selectedColor.toUpperCase()}</span>
            </div>
          )}
        </div>

        {/* Error Message */}
        {recolorError && (
          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {recolorError}
          </div>
        )}

        <div className="text-xs text-white/40 mt-2">
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

    </div>
  );
}
