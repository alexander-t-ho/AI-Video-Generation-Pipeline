import { useState } from 'react';
import { usePolling } from './usePolling';
import type { ImageGenerationParams, GenerationState } from '../types';

export function useImageGeneration(): GenerationState & {
  generateImage: (params: ImageGenerationParams) => Promise<void>;
  setGeneratedImage: (image: string | null) => void;
  setError: (error: string | null) => void;
  clearState: () => void;
} {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { startPolling, stopPolling } = usePolling();

  const generateImage = async ({
    prompt,
    projectId,
    sceneIndex = 0,
    referenceImageUrls,
    model
  }: ImageGenerationParams) => {
    // Prevent multiple simultaneous generations
    if (isGenerating) {
      console.log('[useImageGeneration] Generation already in progress, skipping');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      console.log('[useImageGeneration] Starting generation with params:', {
        prompt: prompt.substring(0, 100) + '...',
        projectId,
        sceneIndex,
        referenceImageUrls: referenceImageUrls?.length || 0,
        model
      });

      const requestBody: any = {
        prompt,
        projectId,
        sceneIndex,
        ...(referenceImageUrls && referenceImageUrls.length > 0 && {
          referenceImageUrls
        })
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      // Add model override if specified
      if (model) {
        headers['X-Model-T2I'] = model;
      }

      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API returned ${response.status}: ${errorText || response.statusText}`);
      }

      const data = await response.json();
      if (!data.success || !data.predictionId) {
        throw new Error(data.error || 'Failed to start image generation');
      }

      console.log('[useImageGeneration] Generation started, prediction ID:', data.predictionId);

      // Start polling for completion
      await startPolling({
        predictionId: data.predictionId,
        projectId,
        sceneIndex,
        onSuccess: (imageUrl: string) => {
          console.log('[useImageGeneration] Generation completed successfully');
          setGeneratedImage(imageUrl);
          setIsGenerating(false);
        },
        onError: (errorMessage: string) => {
          console.error('[useImageGeneration] Generation failed:', errorMessage);
          setError(`Failed to generate image: ${errorMessage}`);
          setIsGenerating(false);
        },
        onStatus: (status: string) => {
          console.log('[useImageGeneration] Generation status:', status);
        }
      });
    } catch (error) {
      console.error('[useImageGeneration] Generation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(`Failed to generate image: ${errorMessage}`);
      setIsGenerating(false);
    }
  };

  const clearState = () => {
    setGeneratedImage(null);
    setError(null);
    stopPolling();
  };

  return {
    isGenerating,
    generatedImage,
    error,
    generateImage,
    setGeneratedImage,
    setError,
    clearState
  };
}
