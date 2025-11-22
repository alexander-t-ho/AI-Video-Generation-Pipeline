'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useProjectStore } from '@/lib/state/project-store';
import { updateProject } from '@/lib/api-client';

const AUTOSAVE_DELAY = 3000; // 3 seconds of inactivity before saving

/**
 * Hook to automatically save project metadata to backend when it changes
 * Debounced to avoid excessive API calls
 */
export function useAutoSaveProject() {
  const project = useProjectStore((state) => state.project);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>('');
  const isSavingRef = useRef(false);

  const saveProject = useCallback(async () => {
    if (!project || isSavingRef.current) return;

    const projectData = JSON.stringify({
      name: project.name,
      characterDescription: project.characterDescription,
      status: project.status,
      finalVideoUrl: project.finalVideoUrl,
      finalVideoS3Key: project.finalVideoS3Key,
    });

    // Only save if something changed
    if (projectData === lastSavedRef.current) return;

    try {
      isSavingRef.current = true;
      await updateProject(project.id, {
        name: project.name,
        characterDescription: project.characterDescription,
        status: project.status,
        finalVideoUrl: project.finalVideoUrl,
        finalVideoS3Key: project.finalVideoS3Key,
      });
      lastSavedRef.current = projectData;
    } catch (error) {
      console.error('[AutoSave] Failed to save project:', error);
      // Don't throw - let the app continue even if auto-save fails
    } finally {
      isSavingRef.current = false;
    }
  }, [project]);

  useEffect(() => {
    if (!project?.id) return;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout for debounced save
    timeoutRef.current = setTimeout(saveProject, AUTOSAVE_DELAY);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [project, saveProject]);

  return {
    saveNow: saveProject,
  };
}
