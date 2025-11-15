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
  const { projectId, enabled = true, onStatusUpdate } = options;
  const interval = 5000; // Fixed interval to avoid dependency issues
  const { project, addChatMessage, setSceneStatus, setFinalVideo } = useProjectStore();
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const lastStatusRef = useRef<string | null>(null);
  const shouldStopRef = useRef<boolean>(false);
  const isPollingActiveRef = useRef<boolean>(false);
  const isInitialPollingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!enabled || !projectId || !project) {
      // Stop polling when disabled (Phase 10.1.1)
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      shouldStopRef.current = true;
      isPollingActiveRef.current = false;
      isInitialPollingRef.current = false;
      return;
    }

    // Prevent multiple polling instances (check both interval and initial poll)
    if (pollingRef.current || isInitialPollingRef.current) {
      return;
    }

    // Reset stop flag and mark as polling
    shouldStopRef.current = false;
    isPollingActiveRef.current = true;
    isInitialPollingRef.current = true;

    const pollStatus = async () => {
      // Check if we should stop before making the request
      if (shouldStopRef.current || !isPollingActiveRef.current) {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        return;
      }

      try {
        const status = await getProjectStatus(projectId);

        // Check if status changed
        const statusKey = JSON.stringify(status);
        if (statusKey === lastStatusRef.current) {
          return; // No change, skip update (Phase 10.1.1 - reduce unnecessary updates)
        }
        lastStatusRef.current = statusKey;
        
        // Stop polling if project is completed (Phase 10.1.1)
        if (status.status === 'completed' || project.status === 'completed') {
          shouldStopRef.current = true;
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          return;
        }

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
        if (status.finalVideoUrl && status.status !== 'completed') {
          setFinalVideo(status.finalVideoUrl, status.finalVideoS3Key);
          addChatMessage({
            role: 'agent',
            content: '✓ Final video complete. Ready for download.',
            type: 'status',
          });
        }
      } catch (error: any) {
        // Stop polling on 404 (project not found) - endpoint doesn't exist or project not found
        const is404 = error?.statusCode === 404 || 
                     error?.status === 404 ||
                     error?.message?.includes('404') || 
                     error?.message?.includes('not found');
        
        if (is404) {
          console.warn('Project status endpoint not found (404). Stopping polling.');
          shouldStopRef.current = true;
          isPollingActiveRef.current = false;
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          return;
        }
        
        console.error('Error polling project status:', error);
        // Don't show error to user on every poll failure
      }
    };

    // Initial poll - stop immediately on 404
    pollStatus().then(() => {
      // Only set up interval if we didn't stop polling
      if (!shouldStopRef.current && isPollingActiveRef.current && !pollingRef.current) {
        pollingRef.current = setInterval(pollStatus, interval);
      }
      isInitialPollingRef.current = false; // Mark initial poll as complete
    }).catch(() => {
      // If initial poll fails, don't set up interval
      shouldStopRef.current = true;
      isPollingActiveRef.current = false;
      isInitialPollingRef.current = false; // Mark initial poll as complete
    });

    // Cleanup
    return () => {
      isPollingActiveRef.current = false;
      isInitialPollingRef.current = false;
      shouldStopRef.current = true;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [projectId, enabled, project, addChatMessage, setSceneStatus, setFinalVideo, onStatusUpdate]);

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

