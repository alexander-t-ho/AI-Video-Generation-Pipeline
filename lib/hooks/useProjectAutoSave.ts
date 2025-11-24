'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useProjectStore } from '@/lib/state/project-store';
import { saveFullProject, saveProject } from '@/lib/api-client';

const AUTO_SAVE_DELAY = 1500; // 1.5 seconds of inactivity before saving

/**
 * Hook to automatically save full project state to Railway database
 * Monitors all project state changes and saves to backend
 */
export function useProjectAutoSave() {
  const project = useProjectStore((state) => state.project);
  const scenes = useProjectStore((state) => state.scenes);
  const timelineClips = useProjectStore((state) => state.timelineClips);
  const textOverlays = useProjectStore((state) => state.textOverlays);
  const isProjectSavedToBackend = useProjectStore((state) => state.isProjectSavedToBackend);
  const setIsProjectSavedToBackend = useProjectStore((state) => state.setIsProjectSavedToBackend);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>('');
  const isSavingRef = useRef(false);

  const saveFullProjectState = useCallback(async () => {
    // Don't auto-save if project doesn't exist
    if (!project || isSavingRef.current) return;

    // Create project snapshot for comparison
    const projectSnapshot = JSON.stringify({
      id: project.id,
      name: project.name,
      prompt: project.prompt,
      targetDuration: project.targetDuration,
      status: project.status,
      characterDescription: project.characterDescription,
      finalVideoUrl: project.finalVideoUrl,
      finalVideoS3Key: project.finalVideoS3Key,
      storyboard: project.storyboard,
      scenes: scenes,
      timelineClips: timelineClips,
      textOverlays: textOverlays,
      uploadedImages: project.uploadedImages,
    });

    // Only save if something changed
    if (projectSnapshot === lastSavedRef.current) return;

    try {
      isSavingRef.current = true;

      let projectId = project.id;

      // If project doesn't exist in backend, create it first
      if (!isProjectSavedToBackend || !projectId) {
        console.log('[AutoSave] Creating project in Railway database...');
        const backendProject = await saveProject(
          project.name || 'Untitled Project',
          project.prompt || '',
          project.targetDuration || 15,
          project.characterDescription
        );
        projectId = backendProject.id;
        
        // Update local project state with backend ID (use setTimeout to avoid render-time updates)
        setTimeout(() => {
          const { updateProject } = useProjectStore.getState();
          updateProject({ id: projectId });
          setIsProjectSavedToBackend(true);
        }, 0);
        console.log('[AutoSave] Project created with ID:', projectId);
      }

      // Prepare full project data for saving
      // Map scenes (SceneWithState[]) to Scene[] format for the save endpoint
      // Extract only Scene properties, excluding SceneWithState-specific properties
      // Map SceneWithState status to database enum format
      const mapStatusToDbEnum = (status: string): string => {
        const statusMap: Record<string, string> = {
          'pending': 'PENDING',
          'generating_image': 'GENERATING_IMAGE',
          'image_ready': 'IMAGE_READY',
          'generating_video': 'GENERATING_VIDEO',
          'video_ready': 'VIDEO_READY',
          'completed': 'COMPLETED',
        };
        return statusMap[status] || 'PENDING';
      };

      const storyboard = (scenes || []).map((scene) => ({
        id: scene.id,
        order: scene.order,
        description: scene.description || '',
        suggestedDuration: scene.suggestedDuration,
        imagePrompt: scene.imagePrompt || '',
        videoPrompt: scene.videoPrompt || scene.imagePrompt || '',
        negativePrompt: scene.negativePrompt,
        customDuration: scene.customDuration,
        customImageInput: scene.customImageInput,
        useSeedFrame: scene.useSeedFrame,
        modelParameters: scene.modelParameters,
        referenceImageId: scene.referenceImageId,
        backgroundImageId: scene.backgroundImageId,
        compositeImageId: scene.compositeImageId,
        referenceImageUrls: scene.referenceImageUrls || null,
        // Map status to database enum format
        status: mapStatusToDbEnum(scene.status),
        // Include duplicate info if it exists (for database)
        ...((scene as any).isDuplicate !== undefined && { isDuplicate: (scene as any).isDuplicate }),
        ...((scene as any).parentSceneId && { parentSceneId: (scene as any).parentSceneId }),
      }));

      const projectData = {
        name: project.name,
        prompt: project.prompt,
        targetDuration: project.targetDuration,
        status: project.status,
        characterDescription: project.characterDescription,
        finalVideoUrl: project.finalVideoUrl,
        finalVideoS3Key: project.finalVideoS3Key,
        storyboard: storyboard,
        timelineClips: timelineClips || [],
        textOverlays: textOverlays || [],
        uploadedImages: (project.uploadedImages || []).map((img: any) => ({
          url: img.url || img.localPath || '',
          s3Key: img.s3Key || null,
          originalName: img.originalName || 'image',
          mimeType: img.mimeType || 'image/png',
          size: typeof img.size === 'number' && !isNaN(img.size) ? img.size : 0,
        })).filter((img: any) => img.url && img.url.trim().length > 0),
      };

      // Save full project to Railway database
      await saveFullProject(projectId, projectData);
      lastSavedRef.current = projectSnapshot;
      console.log('[AutoSave] Full project saved to Railway database');
    } catch (error) {
      console.error('[AutoSave] Failed to save project to Railway:', error);
      // Don't throw - let the user continue working even if save fails
    } finally {
      isSavingRef.current = false;
    }
  }, [
    project,
    scenes,
    timelineClips,
    textOverlays,
    isProjectSavedToBackend,
    setIsProjectSavedToBackend,
  ]);

  // Set up auto-save on any state changes
  useEffect(() => {
    // Don't set up auto-save if project doesn't exist
    if (!project) return;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout for debounced save
    timeoutRef.current = setTimeout(saveFullProjectState, AUTO_SAVE_DELAY);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [
    project,
    scenes,
    timelineClips,
    textOverlays,
    saveFullProjectState,
  ]);

  // Save on unmount (user leaving workspace)
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      // Final save when component unmounts
      if (project?.id) {
        saveFullProjectState();
      }
    };
  }, [project?.id, saveFullProjectState]);

  return {
    saveNow: saveFullProjectState,
  };
}
