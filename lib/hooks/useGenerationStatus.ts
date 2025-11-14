/**
 * Custom hook for managing real-time generation status updates
 * Connects agent chat to generation status and syncs state across panels
 */

import { useEffect, useRef } from 'react';
import { useProjectStore } from '@/lib/state/project-store';
import { getProjectStatus } from '@/lib/api-client';

interface UseGenerationStatusOptions {
  projectId: string | null;
  enabled?: boolean;
  interval?: number;
  onStatusUpdate?: (status: any) => void;
}

/**
 * Hook for polling project status and updating UI in real-time
 */
export function useGenerationStatus(options: UseGenerationStatusOptions) {
  const { projectId, enabled = true, interval = 5000, onStatusUpdate } = options;
  const { project, addChatMessage, setSceneStatus, setFinalVideo } = useProjectStore();
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const lastStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !projectId || !project) {
      return;
    }

    const pollStatus = async () => {
      try {
        const status = await getProjectStatus(projectId);

        // Check if status changed
        const statusKey = JSON.stringify(status);
        if (statusKey === lastStatusRef.current) {
          return; // No change, skip update
        }
        lastStatusRef.current = statusKey;

        // Call callback if provided
        if (onStatusUpdate) {
          onStatusUpdate(status);
        }

        // Update chat messages based on status
        if (status.currentScene !== undefined) {
          const sceneIndex = status.currentScene;
          const sceneStatus = status.scenes?.[sceneIndex]?.status;

          if (sceneStatus) {
            // Update scene status in store
            setSceneStatus(sceneIndex, sceneStatus);

            // Add chat message for status changes
            const statusMessages: Record<string, string> = {
              generating_image: `Generating image for Scene ${sceneIndex + 1}/5...`,
              image_ready: `✓ Image generated for Scene ${sceneIndex + 1}`,
              generating_video: `Generating video for Scene ${sceneIndex + 1}/5...`,
              video_ready: `✓ Video generated for Scene ${sceneIndex + 1}`,
              completed: `✓ Scene ${sceneIndex + 1} completed`,
            };

            if (statusMessages[sceneStatus]) {
              addChatMessage({
                role: 'agent',
                content: statusMessages[sceneStatus],
                type: 'status',
              });
            }
          }
        }

        // Update final video if available
        if (status.finalVideoUrl && project.status !== 'completed') {
          setFinalVideo(status.finalVideoUrl, status.finalVideoS3Key);
          addChatMessage({
            role: 'agent',
            content: '✓ Final video complete. Ready for download.',
            type: 'status',
          });
        }
      } catch (error) {
        console.error('Error polling project status:', error);
        // Don't show error to user on every poll failure
      }
    };

    // Initial poll
    pollStatus();

    // Set up polling interval
    pollingRef.current = setInterval(pollStatus, interval);

    // Cleanup
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [projectId, enabled, interval, project, addChatMessage, setSceneStatus, setFinalVideo, onStatusUpdate]);

  return {
    isPolling: enabled && projectId !== null,
  };
}

/**
 * Hook for syncing state across all three panels
 */
export function usePanelSync() {
  const { project, scenes, viewMode, currentSceneIndex } = useProjectStore();

  // This hook can be extended to handle cross-panel state synchronization
  // For now, it's a placeholder for future enhancements

  useEffect(() => {
    // Sync media drawer when scenes change
    // This ensures media drawer shows latest generated assets
    if (scenes.length > 0) {
      // Media drawer will automatically update via Zustand store
      // No additional sync needed here
    }
  }, [scenes]);

  return {
    project,
    scenes,
    viewMode,
    currentSceneIndex,
  };
}

