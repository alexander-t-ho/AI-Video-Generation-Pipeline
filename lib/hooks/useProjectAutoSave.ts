'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useProjectStore } from '@/lib/state/project-store';

const AUTO_SAVE_DELAY = 5000; // 5 seconds of inactivity before saving

/**
 * Hook to automatically save project metadata changes to backend
 * Monitors project state and syncs with backend after changes
 */
export function useProjectAutoSave() {
  const project = useProjectStore((state) => state.project);
  const updateProjectMetadata = useProjectStore((state) => state.updateProjectMetadata);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>('');
  const isSavingRef = useRef(false);

  const saveProjectMetadata = useCallback(async () => {
    if (!project || isSavingRef.current) return;

    const projectSnapshot = JSON.stringify({
      name: project.name,
      characterDescription: project.characterDescription,
      status: project.status,
      finalVideoUrl: project.finalVideoUrl,
      finalVideoS3Key: project.finalVideoS3Key,
    });

    // Only save if something changed
    if (projectSnapshot === lastSavedRef.current) return;

    try {
      isSavingRef.current = true;
      await updateProjectMetadata({
        name: project.name,
        characterDescription: project.characterDescription,
        status: project.status as 'storyboard' | 'scene_generation' | 'stitching' | 'completed',
        finalVideoUrl: project.finalVideoUrl,
        finalVideoS3Key: project.finalVideoS3Key,
      });
      lastSavedRef.current = projectSnapshot;
      console.log('[AutoSave] Project metadata saved');
    } catch (error) {
      console.error('[AutoSave] Failed to save project:', error);
      // Don't throw - let the user continue working even if save fails
    } finally {
      isSavingRef.current = false;
    }
  }, [project, updateProjectMetadata]);

  // Set up auto-save on project changes
  useEffect(() => {
    if (!project?.id) return;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout for debounced save
    timeoutRef.current = setTimeout(saveProjectMetadata, AUTO_SAVE_DELAY);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [project, saveProjectMetadata]);

  // Save on unmount (user leaving workspace)
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      // Final save when component unmounts
      if (project?.id) {
        saveProjectMetadata();
      }
    };
  }, []);

  return {
    saveNow: saveProjectMetadata,
  };
}
