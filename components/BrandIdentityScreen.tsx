'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Rocket } from 'lucide-react';
import { CarVariant, CustomAsset, CarReferenceImage, CarDatabase } from './brand-identity/types';
import { mockCarDatabase } from './brand-identity/mockData';
import CarSelector, { SuggestedCarInfo } from './brand-identity/CarSelector';
import AssetViewer from './brand-identity/AssetViewer';
import { useProjectStore } from '@/lib/state/project-store';
import { fetchCarDatabase } from '@/lib/services/car-service';

export default function BrandIdentityScreen() {
  const [selectedCar, setSelectedCar] = useState<CarVariant | CustomAsset | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [customAssets, setCustomAssets] = useState<CustomAsset[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [carDatabase, setCarDatabase] = useState<CarDatabase | null>(null);
  const [isLoadingCars, setIsLoadingCars] = useState(true);
  const [isWaitingForProject, setIsWaitingForProject] = useState(false);
  const [selectedAssetHistory, setSelectedAssetHistory] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Track the most recent custom asset created in the current user session
  // to allow batch operations to add to the same asset instead of creating multiple
  const latestRecolorTarget = useRef<{ baseId: string, customId: string, color: string } | null>(null);

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
    const variants = carDatabase?.variants || [];
    if (variants.length === 0 || isLoadingCars) return;
    if (selectedCar) return; // Don't override if already selected

    let carToSelect: CarVariant | null = null;

    // If we have a suggestion, find the best match
    if (suggestedCar && suggestedCar.confidence !== 'none') {
      const suggestedBrand = suggestedCar.brand?.toLowerCase() || '';
      const suggestedModel = suggestedCar.model?.toLowerCase() || '';

      // Find exact match first
      let bestMatch = variants.find(car => {
        const brandMatch = suggestedBrand && car.brand.toLowerCase() === suggestedBrand;
        const modelMatch = suggestedModel && car.model.toLowerCase() === suggestedModel;
        return brandMatch && modelMatch;
      });

      // If no exact match, try brand only
      if (!bestMatch && suggestedBrand) {
        bestMatch = variants.find(car =>
          car.brand.toLowerCase() === suggestedBrand
        );
      }

      if (bestMatch) {
        carToSelect = bestMatch;
      }
    }

    // Default to first car if no match found
    if (!carToSelect) {
      carToSelect = variants[0];
    }

    // Set the selected car and auto-select all its assets
    setSelectedCar(carToSelect);
    const allAssetIds = new Set(carToSelect.referenceImages.map(img => img.id));
    setSelectedAssetIds(allAssetIds);
  }, [suggestedCar]); // Run when suggestedCar changes

  // Load car database from S3
  useEffect(() => {
    const loadCarDatabase = async () => {
      try {
        setIsLoadingCars(true);
        const database = await fetchCarDatabase();
        setCarDatabase(database);
        setCustomAssets(database.customAssets);
      } catch (error) {
        console.error('Failed to load car database:', error);
        // Fallback to mock data
        setCarDatabase(mockCarDatabase);
        setCustomAssets(mockCarDatabase.customAssets);
      } finally {
        setIsLoadingCars(false);
      }
    };

    loadCarDatabase();
  }, []);

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

  // Add keyboard event listener for Enter key
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && selectedAssetIds.size > 0 && !isWaitingForProject) {
        handleContinue();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedAssetIds.size, isWaitingForProject]);

  const handleCarSelect = (car: CarVariant | CustomAsset) => {
    setSelectedCar(car);
    
    // Check if this is a CustomAsset being selected for the first time
    const isCustomAsset = 'baseCarId' in car;
    const isFirstTimeSelection = !selectedAssetHistory.has(car.id);
    
    if (isCustomAsset && isFirstTimeSelection && carDatabase) {
      // Find the base asset
      const baseAsset = carDatabase.variants.find(v => v.id === car.baseCarId);
      
      if (baseAsset && baseAsset.id === selectedCar?.id) {
        // Base asset is currently selected, inherit its selections
        const baseSelectedImages = baseAsset.referenceImages.filter(img => 
          selectedAssetIds.has(img.id)
        );
        
        // Match by type to find corresponding images in custom asset
        const matchingCustomAssetIds = new Set<string>();
        baseSelectedImages.forEach(baseImg => {
          const matchingCustomImg = car.referenceImages.find(customImg => 
            customImg.type === baseImg.type
          );
          if (matchingCustomImg) {
            matchingCustomAssetIds.add(matchingCustomImg.id);
          }
        });
        
        // If we found matches, use them; otherwise select all
        if (matchingCustomAssetIds.size > 0) {
          setSelectedAssetIds(matchingCustomAssetIds);
        } else {
          // No matching types found, select all as fallback
          const allAssetIds = new Set(car.referenceImages.map(img => img.id));
          setSelectedAssetIds(allAssetIds);
        }
      } else {
        // Base asset not currently selected, select all as before
        const allAssetIds = new Set(car.referenceImages.map(img => img.id));
        setSelectedAssetIds(allAssetIds);
      }
      
      // Mark this custom asset as having been selected
      setSelectedAssetHistory(prev => new Set(prev).add(car.id));
    } else {
      // Default behavior: auto-select all assets
      const allAssetIds = new Set(car.referenceImages.map(img => img.id));
      setSelectedAssetIds(allAssetIds);
      
      // Track selection for regular assets too
      setSelectedAssetHistory(prev => new Set(prev).add(car.id));
    }

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
    // Build list of selected images to save
    const selectedImages = selectedCar && selectedAssetIds.size > 0
      ? selectedCar.referenceImages
          .filter(img => selectedAssetIds.has(img.id))
          .map(img => ({
            id: img.id,
            url: img.url,
            localPath: img.url, // Use URL as path for S3 images
            originalName: img.filename || ('brand' in selectedCar ? `${selectedCar.brand}-${selectedCar.model}` : selectedCar.name),
            size: 0,
            mimeType: 'image/png',
            createdAt: new Date().toISOString(),
          }))
      : [];

    // Helper to save assets and navigate (only call after project exists)
    const saveAssetsAndNavigate = () => {
      if (selectedImages.length > 0) {
        const { setUploadedImages } = useProjectStore.getState();
        setUploadedImages(selectedImages);
        console.log('[BrandIdentity] Saved', selectedImages.length, 'selected images to project store');
      }
      router.push('/workspace');
    };

    // Check if project has storyboard before navigating
    const { project } = useProjectStore.getState();
    if (project?.storyboard && project.storyboard.length > 0) {
      // Go to workspace - storyboard is ready
      saveAssetsAndNavigate();
    } else {
      // Storyboard not ready yet (still generating) - show loading
      console.log('[BrandIdentity] Storyboard not ready yet, waiting...');
      setIsWaitingForProject(true);
      // Poll for storyboard to be ready
      const checkProject = setInterval(() => {
        const { project: currentProject } = useProjectStore.getState();
        if (currentProject?.storyboard && currentProject.storyboard.length > 0) {
          clearInterval(checkProject);
          setIsWaitingForProject(false);
          saveAssetsAndNavigate();
        }
      }, 500);
      // Timeout after 5 minutes - just log, no popup
      setTimeout(() => {
        clearInterval(checkProject);
        setIsWaitingForProject(false);
        console.log('[BrandIdentity] Still waiting for storyboard after 5 minutes');
      }, 300000);
    }
  };

  const handleAutoGenerate = async () => {
    // Build list of selected images to save
    const selectedImages = selectedCar && selectedAssetIds.size > 0
      ? selectedCar.referenceImages
          .filter(img => selectedAssetIds.has(img.id))
          .map(img => ({
            id: img.id,
            url: img.url,
            localPath: img.url, // Use URL as path for S3 images
            originalName: img.filename || ('brand' in selectedCar ? `${selectedCar.brand}-${selectedCar.model}` : selectedCar.name),
            size: 0,
            mimeType: 'image/png',
            createdAt: new Date().toISOString(),
          }))
      : [];

    // Save assets to project store
    if (selectedImages.length > 0) {
      const { setUploadedImages } = useProjectStore.getState();
      setUploadedImages(selectedImages);
      console.log('[BrandIdentity] Saved', selectedImages.length, 'selected images for auto-generation');
    }

    // Navigate to workspace immediately - don't wait for storyboard
    // The workspace will show loading indicators while generation happens
    console.log('[BrandIdentity] Navigating to workspace for auto-generation');
    router.push('/workspace?autoGenerate=true');
  };

  const handleAddRecoloredImages = (baseCarId: string, images: Array<{ url: string, colorHex: string }>) => {
    if (images.length === 0) return;
    
    const colorHex = images[0].colorHex; // Assume all images in batch have same color
    console.log(`[BrandIdentityScreen] Adding ${images.length} recolored images to base car ${baseCarId}`);

    setCustomAssets(prevAssets => {
      const existingCustomAsset = prevAssets.find(asset => asset.id === baseCarId);
      
      // If recoloring within a custom asset, replace the selected images
      if (existingCustomAsset) {
        console.log('[BrandIdentityScreen] Replacing images in existing custom asset:', existingCustomAsset.name);
        
        // Get the IDs of images that were selected for recoloring
        const recoloredImageIds = Array.from(selectedAssetIds);
        
        // Create new images from recolored results
        const newImages = images.map(img => ({
          id: `recolored-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          url: img.url,
          type: 'custom' as const,
          filename: `recolored-${img.colorHex.replace('#', '')}-${Math.random().toString(36).substr(2, 5)}.jpg`,
          alt: `${existingCustomAsset.name} recolored to ${img.colorHex}`,
        }));
        
        // Replace old images with new ones
        const updatedImages = existingCustomAsset.referenceImages.filter(
          img => !recoloredImageIds.includes(img.id)
        ).concat(newImages);
        
        return prevAssets.map(asset =>
          asset.id === baseCarId
            ? {
                ...asset,
                referenceImages: updatedImages,
                adjustments: [...asset.adjustments, `Recolored to ${colorHex}`],
              }
            : asset
        );
      }
      
      // If recoloring a standard asset, create a new custom asset
      const actualBaseCarId = baseCarId;
      console.log('[BrandIdentityScreen] Creating new custom asset for recolored images');
      const baseCar = carDatabase?.variants.find(car => car.id === actualBaseCarId);
      
      if (!baseCar) {
        console.error('[BrandIdentityScreen] Base car not found:', actualBaseCarId);
        return prevAssets;
      }

      const newCustomId = `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const newImages = images.map(img => ({
        id: `recolored-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        url: img.url,
        type: 'custom' as const,
        filename: `recolored-${img.colorHex.replace('#', '')}-${Math.random().toString(36).substr(2, 5)}.jpg`,
        alt: `${baseCar.displayName} recolored to ${img.colorHex}`,
      }));

      const newCustomAsset: CustomAsset = {
        id: newCustomId,
        name: `${baseCar.displayName} (${colorHex})`,
        createdAt: new Date().toISOString(),
        baseCarId: actualBaseCarId,
        s3Key: `brand/${baseCar.brand.toLowerCase()}/${baseCar.model.toLowerCase()}/custom/${Date.now()}-${colorHex.replace('#', '')}/`,
        referenceImages: newImages,
        adjustments: [`Recolored to ${colorHex}`],
      };
      
      return [...prevAssets, newCustomAsset];
    });

    // Handle selection after recoloring
    setTimeout(() => {
       setCustomAssets(currentAssets => {
          const existingCustomAsset = currentAssets.find(a => a.id === baseCarId);
          
          if (existingCustomAsset) {
            // If we updated an existing custom asset, keep it selected
            setSelectedCar(existingCustomAsset);
          } else {
            // If we created a new custom asset, select the most recent one
            const targetAsset = currentAssets
               .filter(a => a.baseCarId === baseCarId && a.name.includes(colorHex))
               .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
            
            if (targetAsset) {
               setSelectedCar(targetAsset);
            }
          }
          return currentAssets;
       });
    }, 50);
  };

  const handleAddRecoloredImage = (baseCarId: string, imageUrl: string, colorHex: string) => {
    handleAddRecoloredImages(baseCarId, [{ url: imageUrl, colorHex }]);
  };

  const handleAddCustomAsset = (baseCarId: string, name: string) => {
    const baseCar = carDatabase?.variants.find(car => car.id === baseCarId);
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
      } else if (carDatabase?.variants && carDatabase.variants.length > 0) {
        setSelectedCar(carDatabase.variants[0]);
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
          Scen3
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

        {/* Auto-Generate Button */}
        <button
          onClick={handleAutoGenerate}
          disabled={isWaitingForProject || selectedAssetIds.size === 0}
          className={`p-3 rounded-lg border backdrop-blur-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed group relative ${
            selectedAssetIds.size > 0 && !isWaitingForProject
              ? 'bg-gradient-to-r from-purple-500 to-pink-500 border-transparent hover:from-purple-600 hover:to-pink-600'
              : 'bg-white/10 text-white/80 border-white/20 hover:bg-white/20'
          }`}
          title="Auto-generate entire video"
        >
          <Rocket className={`w-5 h-5 ${selectedAssetIds.size > 0 && !isWaitingForProject ? 'text-white' : 'text-white/60'}`} />
          <span className="absolute bottom-full right-0 mb-2 px-3 py-1.5 bg-black/90 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            Auto-generate entire video
          </span>
        </button>

        <button
          onClick={handleContinue}
          disabled={isWaitingForProject || selectedAssetIds.size === 0}
          className={`px-6 py-2 rounded-lg border backdrop-blur-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
            selectedAssetIds.size > 0 && !isWaitingForProject
              ? 'bg-white text-black border-white hover:bg-white/90'
              : 'bg-white/10 text-white/80 border-white/20 hover:bg-white/20'
          }`}
        >
          {isWaitingForProject ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Preparing...</span>
            </>
          ) : (
            'Continue'
          )}
        </button>
      </div>

      <div className="relative z-10 w-full max-w-[1600px] mx-auto px-4 sm:px-6 mt-20 mb-6">
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
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-8 h-[calc(100vh-160px)] min-h-[500px]">
          {/* Left Column - Car Selection */}
          <div className="lg:col-span-1 h-full overflow-hidden">
            <CarSelector
              cars={carDatabase?.variants || []}
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
          <div className="lg:col-span-3 h-full min-h-0">
            <AssetViewer
              selectedCar={selectedCar}
              onAddRecoloredImage={handleAddRecoloredImage}
              onAddRecoloredImages={handleAddRecoloredImages}
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
