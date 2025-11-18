import { useState } from 'react';
import type { ProcessingState } from '../types';

interface UploadResult {
  success: boolean;
  images?: Array<{
    id?: string;
    url: string;
    localPath?: string;
    processedVersions?: Array<{ url: string }>;
  }>;
  error?: string;
}

interface ProcessingResult {
  success: boolean;
  processedImages?: Array<{
    id?: string;
    url: string;
    localPath?: string;
  }>;
  upscaledImages?: Array<{
    id?: string;
    url: string;
    localPath?: string;
  }>;
  frames?: Array<{
    url: string;
    localPath: string;
    index: number;
  }>;
  error?: string;
}

export function useImageProcessing() {
  const [uploadState, setUploadState] = useState<ProcessingState>({ isProcessing: false, error: null });
  const [backgroundRemovalState, setBackgroundRemovalState] = useState<ProcessingState>({ isProcessing: false, error: null });
  const [upscaleState, setUpscaleState] = useState<ProcessingState>({ isProcessing: false, error: null });
  const [splitState, setSplitState] = useState<ProcessingState>({ isProcessing: false, error: null });

  const uploadImages = async (
    files: FileList | File[],
    projectId: string
  ): Promise<UploadResult> => {
    if (!files.length || !projectId) {
      return { success: false, error: 'No files or project ID provided' };
    }

    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      return { success: false, error: 'No image files found' };
    }

    setUploadState({ isProcessing: true, error: null });

    try {
      const formData = new FormData();
      imageFiles.forEach(file => formData.append('images', file));
      formData.append('projectId', projectId);

      const response = await fetch('/api/upload-images', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!data.success || !data.images || data.images.length === 0) {
        throw new Error(data.error || 'Failed to upload images');
      }

      // Process uploaded image URLs
      const uploadedUrls = data.images.map((img: any) => {
        let imageUrl: string;
        if (img.processedVersions && img.processedVersions.length > 0) {
          // Use the last processed version (most refined)
          imageUrl = img.processedVersions[img.processedVersions.length - 1].url;
        } else {
          imageUrl = img.url;
        }

        // Convert local file paths to serve-image API URLs
        if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
          return imageUrl;
        }

        // Local paths need to be served through the API
        return `/api/serve-image?path=${encodeURIComponent(imageUrl)}`;
      });

      const result = {
        success: true,
        images: data.images.map((img: any, index: number) => ({
          ...img,
          url: uploadedUrls[index]
        }))
      };

      console.log('[useImageProcessing] Uploaded images:', uploadedUrls);
      setUploadState({ isProcessing: false, error: null });
      return result;
    } catch (error) {
      console.error('[useImageProcessing] Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setUploadState({ isProcessing: false, error: errorMessage });
      return { success: false, error: `Failed to upload images: ${errorMessage}` };
    }
  };

  const removeBackground = async (
    imageUrls: string[],
    projectId: string
  ): Promise<ProcessingResult> => {
    if (!imageUrls.length || !projectId) {
      return { success: false, error: 'No image URLs or project ID provided' };
    }

    setBackgroundRemovalState({ isProcessing: true, error: null });

    try {
      const response = await fetch('/api/remove-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrls, projectId })
      });

      const data = await response.json();
      if (!data.success || !data.processedImages) {
        throw new Error(data.error || 'Failed to remove background');
      }

      setBackgroundRemovalState({ isProcessing: false, error: null });
      return { success: true, processedImages: data.processedImages };
    } catch (error) {
      console.error('[useImageProcessing] Background removal error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setBackgroundRemovalState({ isProcessing: false, error: errorMessage });
      return { success: false, error: `Failed to remove background: ${errorMessage}` };
    }
  };

  const upscaleImage = async (
    imageUrls: string[],
    projectId: string
  ): Promise<ProcessingResult> => {
    if (!imageUrls.length || !projectId) {
      return { success: false, error: 'No image URLs or project ID provided' };
    }

    setUpscaleState({ isProcessing: true, error: null });

    try {
      const response = await fetch('/api/upscale-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrls, projectId })
      });

      const data = await response.json();
      if (!data.success || !data.upscaledImages) {
        throw new Error(data.error || 'Failed to upscale image');
      }

      setUpscaleState({ isProcessing: false, error: null });
      return { success: true, upscaledImages: data.upscaledImages };
    } catch (error) {
      console.error('[useImageProcessing] Upscale error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setUpscaleState({ isProcessing: false, error: errorMessage });
      return { success: false, error: `Failed to upscale image: ${errorMessage}` };
    }
  };

  const splitImageGrid = async (
    imageUrl: string,
    frameCount: number,
    projectId: string
  ): Promise<ProcessingResult> => {
    if (!imageUrl || !frameCount || !projectId) {
      return { success: false, error: 'Missing required parameters' };
    }

    setSplitState({ isProcessing: true, error: null });

    try {
      console.log('[useImageProcessing] Splitting image grid:', { imageUrl: imageUrl.substring(0, 100) + '...', frameCount });

      const response = await fetch('/api/split-image-grid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl,
          frameCount,
          projectId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to split image grid');
      }

      const data = await response.json();
      console.log('[useImageProcessing] Split successful, processed', data.frames?.length || 0, 'frames');

      setSplitState({ isProcessing: false, error: null });
      return { success: true, frames: data.frames };
    } catch (error) {
      console.error('[useImageProcessing] Split error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setSplitState({ isProcessing: false, error: errorMessage });
      return { success: false, error: `Failed to split image grid: ${errorMessage}` };
    }
  };

  const clearErrors = () => {
    setUploadState(prev => ({ ...prev, error: null }));
    setBackgroundRemovalState(prev => ({ ...prev, error: null }));
    setUpscaleState(prev => ({ ...prev, error: null }));
    setSplitState(prev => ({ ...prev, error: null }));
  };

  return {
    // States
    uploadState,
    backgroundRemovalState,
    upscaleState,
    splitState,

    // Methods
    uploadImages,
    removeBackground,
    upscaleImage,
    splitImageGrid,
    clearErrors
  };
}
