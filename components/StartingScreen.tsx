'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import CombinedInput from './CombinedInput';
import { StartingScreenProps } from '@/lib/types/components';
import { useProjectStore } from '@/lib/state/project-store';
import { createProject, uploadImages } from '@/lib/api-client';

export default function StartingScreen({
  onCreateProject,
  isLoading: externalLoading,
}: StartingScreenProps) {
  const [targetDuration, setTargetDuration] = useState<number>(15);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const router = useRouter();
  const { createProject: createProjectInStore, addChatMessage } = useProjectStore();

  const handleSubmit = async (message: string, images?: File[]) => {
    if (!message.trim()) return;

    setError(null);
    setIsLoading(true);

    try {
      // Extract duration from message if specified
      const durationMatch = message.match(/\b(15s|30s|60s|15|30|60)\b/i);
      if (durationMatch) {
        const duration = parseInt(durationMatch[1].replace('s', ''));
        if ([15, 30, 60].includes(duration)) {
          setTargetDuration(duration);
        }
      }

      // Create project in store (this already adds the user message)
      createProjectInStore(message, targetDuration);
      const projectId = useProjectStore.getState().project?.id;

      // Upload images if provided and get URLs for storyboard generation
      let referenceImageUrls: string[] = [];
      if (images && images.length > 0 && projectId) {
        try {
          addChatMessage({
            role: 'agent',
            content: `Uploading ${images.length} image(s)...`,
            type: 'status',
          });
          const uploadResult = await uploadImages(images, projectId);
          referenceImageUrls = uploadResult.urls || [];
          addChatMessage({
            role: 'agent',
            content: `✓ ${uploadResult.urls.length} image(s) uploaded successfully`,
            type: 'status',
          });
        } catch (err) {
          console.error('Failed to upload images:', err);
          addChatMessage({
            role: 'agent',
            content: 'Warning: Image upload failed. Continuing without reference images.',
            type: 'error',
          });
          // Continue with storyboard generation even if image upload fails
        }
      }

      // Add agent message
      addChatMessage({
        role: 'agent',
        content: 'Generating storyboard...',
        type: 'status',
      });

      // Generate storyboard with reference images
      const result = await createProject(message, targetDuration, referenceImageUrls);

      if (!result.storyboard.success || !result.storyboard.scenes) {
        throw new Error(result.storyboard.error || 'Failed to generate storyboard');
      }

      // Update store with storyboard
      useProjectStore.getState().setStoryboard(result.storyboard.scenes);

      // Add success message
      addChatMessage({
        role: 'agent',
        content: `✓ Storyboard generated with ${result.storyboard.scenes.length} scenes`,
        type: 'status',
      });

      // Call external onCreateProject if provided
      if (onCreateProject) {
        await onCreateProject(message, images, targetDuration);
      }

      // Navigate to workspace
      const finalProjectId = useProjectStore.getState().project?.id || projectId;
      if (finalProjectId) {
        router.push(`/workspace?projectId=${finalProjectId}`);
      } else {
        router.push('/workspace');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      
      addChatMessage({
        role: 'agent',
        content: `Error: ${errorMessage}`,
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loading = isLoading || externalLoading;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-4xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            AI Video Generation Pipeline
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Transform your ideas into professional video advertisements
          </p>
        </div>

        {/* Main Input Area */}
        <div className="space-y-6">
          {/* Combined Input */}
          <CombinedInput
            onSubmit={handleSubmit}
            placeholder="Describe your video idea... (e.g., 'Luxury watch ad with golden hour lighting')"
            disabled={loading}
            autoFocus={true}
            maxFiles={5}
            maxSizeMB={10}
            preserveValueOnSubmit={loading} // Keep text visible during loading
          />

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg animate-shake">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Loading Indicator */}
          {loading && (
            <div className="flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400">
              <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              <span>Generating storyboard...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

