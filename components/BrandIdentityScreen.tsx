'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { CarVariant, CustomAsset, CarReferenceImage } from './brand-identity/types';
import { mockCarDatabase } from './brand-identity/mockData';
import CarSelector, { SuggestedCarInfo } from './brand-identity/CarSelector';
import AssetViewer from './brand-identity/AssetViewer';
import { useProjectStore } from '@/lib/state/project-store';

export default function BrandIdentityScreen() {
  const [selectedCar, setSelectedCar] = useState<CarVariant | CustomAsset | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [customAssets, setCustomAssets] = useState<CustomAsset[]>(mockCarDatabase.customAssets);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Extract suggested car info from URL params
  const suggestedCar: SuggestedCarInfo | undefined = useMemo(() => {
    const carBrand = searchParams.get('carBrand');
    const carModel = searchParams.get('carModel');
    const carYear = searchParams.get('carYear');
    const carConfidence = searchParams.get('carConfidence') as SuggestedCarInfo['confidence'];

    if (!carConfidence || carConfidence === 'none') {
      return undefined;
    }

    return {
      brand: carBrand || undefined,
      model: carModel || undefined,
      year: carYear ? parseInt(carYear, 10) : undefined,
      confidence: carConfidence,
    };
  }, [searchParams]);

  // Auto-select the best matching car based on AI suggestion
  useEffect(() => {
    if (mockCarDatabase.variants.length === 0) return;
    if (selectedCar) return; // Don't override if already selected

    let carToSelect: CarVariant | null = null;

    // If we have a suggestion, find the best match
    if (suggestedCar && suggestedCar.confidence !== 'none') {
      const suggestedBrand = suggestedCar.brand?.toLowerCase() || '';
      const suggestedModel = suggestedCar.model?.toLowerCase() || '';

      // Find exact match first
      let bestMatch = mockCarDatabase.variants.find(car => {
        const brandMatch = suggestedBrand && car.brand.toLowerCase() === suggestedBrand;
        const modelMatch = suggestedModel && car.model.toLowerCase() === suggestedModel;
        return brandMatch && modelMatch;
      });

      // If no exact match, try brand only
      if (!bestMatch && suggestedBrand) {
        bestMatch = mockCarDatabase.variants.find(car =>
          car.brand.toLowerCase() === suggestedBrand
        );
      }

      if (bestMatch) {
        carToSelect = bestMatch;
      }
    }

    // Default to first car if no match found
    if (!carToSelect) {
      carToSelect = mockCarDatabase.variants[0];
    }

    // Set the selected car and auto-select all its assets
    setSelectedCar(carToSelect);
    const allAssetIds = new Set(carToSelect.referenceImages.map(img => img.id));
    setSelectedAssetIds(allAssetIds);
  }, [suggestedCar]); // Run when suggestedCar changes

  // Load uploaded images as custom assets
  useEffect(() => {
    const project = useProjectStore.getState().project;
    if (project?.uploadedImages && project.uploadedImages.length > 0) {
      const uploadedCustomAssets: CustomAsset[] = project.uploadedImages.map(uploadedImage => {
        // Use the most processed version (last one) or original if no processed versions
        const processedVersion = uploadedImage.processedVersions?.[uploadedImage.processedVersions.length - 1];
        const imageUrl = processedVersion?.url || uploadedImage.url;
        const filename = processedVersion?.s3Key?.split('/').pop() || uploadedImage.originalName;

        return {
          id: `uploaded-${uploadedImage.id}`,
          name: uploadedImage.originalName.replace(/\.[^/.]+$/, ''), // Remove extension
          createdAt: uploadedImage.createdAt,
          baseCarId: 'uploaded', // Special ID for uploaded images
          s3Key: processedVersion?.s3Key || uploadedImage.s3Key || '',
          referenceImages: [{
            id: `uploaded-${uploadedImage.id}-ref`,
            url: imageUrl,
            type: 'custom' as const,
            filename: filename,
            alt: `Uploaded asset: ${uploadedImage.originalName}`,
          }],
          adjustments: processedVersion ?
            ['Background removed', 'Edges cleaned'] :
            ['Original uploaded image'],
        };
      });

      // Add uploaded assets to custom assets
      setCustomAssets(prev => [...prev, ...uploadedCustomAssets]);

      // Auto-select the first uploaded asset if no car is selected
      if (!selectedCar && uploadedCustomAssets.length > 0) {
        setSelectedCar(uploadedCustomAssets[0]);
      }
    }
  }, []); // Run once on mount

  const handleCarSelect = (car: CarVariant | CustomAsset) => {
    setSelectedCar(car);

    // Auto-select all assets when a car is selected
    const allAssetIds = new Set(car.referenceImages.map(img => img.id));
    setSelectedAssetIds(allAssetIds);

    // Extract and store asset description in project state
    const { setAssetDescription } = useProjectStore.getState();
    const description = 'brand' in car
      ? car.displayName  // CarVariant
      : car.name;         // CustomAsset
    setAssetDescription(description);
  };

  const handleAssetToggle = (assetId: string) => {
    setSelectedAssetIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(assetId)) {
        newSet.delete(assetId);
      } else {
        newSet.add(assetId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (!selectedCar) return;
    const allAssetIds = new Set(selectedCar.referenceImages.map(img => img.id));
    setSelectedAssetIds(allAssetIds);
  };

  const handleDeselectAll = () => {
    setSelectedAssetIds(new Set());
  };

  const handleContinue = () => {
    // Go directly to the main workspace
    router.push('/workspace');
  };

  const handleAddRecoloredImage = (baseCarId: string, imageUrl: string, colorHex: string) => {
    console.log('[BrandIdentityScreen] handleAddRecoloredImage called:', { baseCarId, imageUrl: imageUrl.substring(0, 50) + '...', colorHex });
    
    // Check if we're recoloring a custom asset (existing custom asset selected)
    const existingCustomAsset = customAssets.find(asset => asset.id === baseCarId);

    if (existingCustomAsset) {
      console.log('[BrandIdentityScreen] Adding image to existing custom asset:', existingCustomAsset.name);
      // Add recolored image to existing custom asset
      const newImage = {
        id: `recolored-${Date.now()}`,
        url: imageUrl,
        type: 'custom' as const,
        filename: `recolored-${colorHex.replace('#', '')}.jpg`,
        alt: `${existingCustomAsset.name} recolored to ${colorHex}`,
      };
      
      setCustomAssets(prev => prev.map(asset =>
        asset.id === baseCarId
          ? {
              ...asset,
              referenceImages: [...asset.referenceImages, newImage],
              adjustments: [...asset.adjustments, `Recolored to ${colorHex}`],
            }
          : asset
      ));
      
      // CRITICAL: Update selectedCar to reflect the new image
      if (selectedCar?.id === baseCarId) {
        setSelectedCar(prev => prev ? {
          ...prev,
          referenceImages: [...prev.referenceImages, newImage],
          adjustments: 'adjustments' in prev ? [...prev.adjustments, `Recolored to ${colorHex}`] : [],
        } as CustomAsset : null);
      }
      
      console.log('[BrandIdentityScreen] Image added to existing custom asset and selectedCar updated');
      return;
    }

    console.log('[BrandIdentityScreen] Creating new custom asset from base car:', baseCarId);
    // Otherwise, create a new custom asset based on a standard car variant
    const baseCar = mockCarDatabase.variants.find(car => car.id === baseCarId);
    if (!baseCar) {
      console.error('[BrandIdentityScreen] Base car not found:', baseCarId);
      return;
    }

    const newCustomAsset: CustomAsset = {
      id: `custom-${Date.now()}`,
      name: `${baseCar.displayName} (${colorHex})`,
      createdAt: new Date().toISOString(),
      baseCarId,
      s3Key: `brand/${baseCar.brand.toLowerCase()}/${baseCar.model.toLowerCase()}/custom/${Date.now()}-${colorHex.replace('#', '')}/`,
      referenceImages: [{
        id: `recolored-${Date.now()}`,
        url: imageUrl,
        type: 'custom',
        filename: `recolored-${colorHex.replace('#', '')}.jpg`,
        alt: `${baseCar.displayName} recolored to ${colorHex}`,
      }],
      adjustments: [`Recolored to ${colorHex}`],
    };

    setCustomAssets(prev => [...prev, newCustomAsset]);

    // Auto-select the new custom asset
    setSelectedCar(newCustomAsset);
    console.log('[BrandIdentityScreen] Created new custom asset and selected it:', newCustomAsset.name);
  };

  const handleAddCustomAsset = (baseCarId: string, name: string) => {
    const baseCar = mockCarDatabase.variants.find(car => car.id === baseCarId);
    if (!baseCar) return;

    const newCustomAsset: CustomAsset = {
      id: `custom-${Date.now()}`,
      name,
      createdAt: new Date().toISOString(),
      baseCarId,
      s3Key: `brand/${baseCar.brand.toLowerCase()}/${baseCar.model.toLowerCase()}/custom/${Date.now()}/`,
      referenceImages: baseCar.referenceImages.map(img => ({
        ...img,
        id: `${img.id}-custom-${Date.now()}`,
        type: 'custom' as const,
      })),
      adjustments: [`Custom asset based on ${baseCar.displayName}`],
    };

    setCustomAssets(prev => [...prev, newCustomAsset]);

    // Auto-select the new custom asset
    setSelectedCar(newCustomAsset);
  };

  const handleUploadImages = async (files: FileList) => {
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('projectId', 'brand-identity-upload');

      // Add all files to form data
      for (let i = 0; i < files.length; i++) {
        formData.append('images', files[i]);
      }

      // Upload images using the existing API
      const response = await fetch('/api/upload-images', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload images');
      }

      // Process uploaded images
      const uploadedImages = data.images || [];
      const processedImageUrls = uploadedImages.flatMap((img: any) =>
        (img.processedVersions || []).map((processed: any, index: number) => {
          // Convert local paths to serve-image API URLs
          let imageUrl = processed.url;
          if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
            // Local path - convert to serve-image API URL
            imageUrl = `/api/serve-image?path=${encodeURIComponent(imageUrl)}`;
          }

          return {
            id: `${img.id}-processed-${index}`,
            url: imageUrl,
            s3Key: processed.s3Key,
            type: 'custom' as const,
            filename: processed.s3Key?.split('/').pop() || `processed-${index}.png`,
            alt: `Uploaded image ${index + 1}`,
          };
        })
      );

      // Check if we have a custom asset selected
      if (selectedCar && 'adjustments' in selectedCar) {
        // Add images to existing custom asset
        setCustomAssets(prev => prev.map(asset =>
          asset.id === selectedCar.id
            ? {
                ...asset,
                referenceImages: [...asset.referenceImages, ...processedImageUrls],
                adjustments: [...asset.adjustments, 'Added uploaded images'],
              }
            : asset
        ));
      } else {
        // Create a new custom asset
        const baseName = selectedCar ?
          ('name' in selectedCar ? selectedCar.name : selectedCar.displayName) || 'Unknown'
          : 'Uploaded';
        const newCustomAsset: CustomAsset = {
          id: `uploaded-${Date.now()}`,
          name: `${baseName} - Custom Upload`,
          createdAt: new Date().toISOString(),
          baseCarId: selectedCar?.id || 'uploaded',
          s3Key: `brand/custom/${Date.now()}/`,
          referenceImages: processedImageUrls,
          adjustments: ['Uploaded custom images'],
        };

        setCustomAssets(prev => [...prev, newCustomAsset]);
        setSelectedCar(newCustomAsset);
      }

    } catch (error) {
      console.error('Failed to upload images:', error);
      // TODO: Show error message to user
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveImage = (assetId: string, imageId: string) => {
    setCustomAssets(prev => prev.map(asset => {
      if (asset.id === assetId) {
        const updatedImages = asset.referenceImages.filter(img => img.id !== imageId);
        return {
          ...asset,
          referenceImages: updatedImages,
        };
      }
      return asset;
    }));

    // Update selectedCar if it's the asset being modified
    if (selectedCar && selectedCar.id === assetId) {
      setSelectedCar(prev => {
        if (!prev) return null;
        return {
          ...prev,
          referenceImages: prev.referenceImages.filter(img => img.id !== imageId),
        } as CustomAsset;
      });
    }
  };

  const handleRemoveCustomAsset = (assetId: string) => {
    setCustomAssets(prev => prev.filter(asset => asset.id !== assetId));

    // If the currently selected asset is being removed, select another asset
    if (selectedCar && selectedCar.id === assetId) {
      // Try to select the first custom asset, or the first standard asset
      const remainingCustomAssets = customAssets.filter(asset => asset.id !== assetId);
      if (remainingCustomAssets.length > 0) {
        setSelectedCar(remainingCustomAssets[0]);
      } else if (mockCarDatabase.variants.length > 0) {
        setSelectedCar(mockCarDatabase.variants[0]);
      } else {
        setSelectedCar(null);
      }
    }
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      handleUploadImages(files);
    }
    // Reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="min-h-screen flex flex-col cinematic-gradient relative overflow-y-auto overflow-x-hidden">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Top Left Logo */}
      <div className="fixed top-6 left-6 z-40">
        <h1 className="text-2xl font-light text-white tracking-tighter select-none whitespace-nowrap leading-none">
          Scene3
        </h1>
      </div>

      {/* Back and Continue Buttons - Bottom Right */}
      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3">
        <button
          onClick={() => router.push('/your-story')}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white/80 rounded-lg hover:bg-white/20 border border-white/20 backdrop-blur-sm transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <button
          onClick={handleContinue}
          className="px-6 py-2 bg-white/10 text-white/80 rounded-lg hover:bg-white/20 border border-white/20 backdrop-blur-sm transition-all"
        >
          Continue
        </button>
      </div>

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 mt-20 mb-6">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <h2 className="text-3xl sm:text-4xl font-light text-white/90 tracking-tight mb-2">
            Brand Identity
          </h2>
          <p className="text-sm sm:text-base text-white/60">
            Select and customize your vehicle's reference assets
          </p>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8 min-h-[calc(100vh-300px)] max-h-[calc(100vh-200px)]">
          {/* Left Column - Car Selection */}
          <div className="lg:col-span-1 h-[400px] lg:h-auto overflow-auto">
            <CarSelector
              cars={mockCarDatabase.variants}
              customAssets={customAssets}
              selectedCar={selectedCar}
              searchQuery={searchQuery}
              suggestedCar={suggestedCar}
              onSearchChange={setSearchQuery}
              onCarSelect={handleCarSelect}
              onAddCustomAsset={handleAddCustomAsset}
              onRemoveCustomAsset={handleRemoveCustomAsset}
            />
          </div>

          {/* Right Column - Asset Viewer */}
          <div className="lg:col-span-2 min-h-[500px] lg:h-auto">
            <AssetViewer
              selectedCar={selectedCar}
              onAddRecoloredImage={handleAddRecoloredImage}
              onAddCustomAsset={handleAddCustomAsset}
              onUploadImages={triggerFileUpload}
              onRemoveImage={handleRemoveImage}
              isUploading={isUploading}
              selectedAssetIds={selectedAssetIds}
              onAssetToggle={handleAssetToggle}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
