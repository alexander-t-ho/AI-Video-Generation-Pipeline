/**
 * Auto-Generation Hook
 *
 * Handles automatic generation of all scenes in parallel:
 * - Generates 1 image per scene
 * - Uses that image + 3 reference photos to generate video
 * - For indoor scenes, uses indoor reference photos
 * - All operations run in parallel and update state as they complete
 */

import { useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useProjectStore } from '@/lib/state/project-store';

interface UseAutoGenerateOptions {
  enabled: boolean;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export function useAutoGenerate({ enabled, onComplete, onError }: UseAutoGenerateOptions) {
  const hasRun = useRef(false);
  const { project } = useProjectStore();

  useEffect(() => {
    console.log('[AutoGenerate] Hook triggered:', { enabled, hasRun: hasRun.current, hasProject: !!project });

    if (!enabled) {
      console.log('[AutoGenerate] Not enabled, skipping');
      return;
    }

    if (hasRun.current) {
      console.log('[AutoGenerate] Already ran, skipping');
      return;
    }

    if (!project) {
      console.log('[AutoGenerate] No project, skipping');
      return;
    }

    const runAutoGeneration = async () => {
      try {
        console.log('[AutoGenerate] Starting automatic generation - waiting for storyboard...');
        hasRun.current = true;

        // Wait for storyboard to be available (it might still be generating)
        const maxWaitTime = 60000; // 60 seconds max wait
        const pollInterval = 1000; // Check every second
        const startTime = Date.now();

        let currentStoryboard = project.storyboard;
        while ((!currentStoryboard || currentStoryboard.length === 0) && (Date.now() - startTime < maxWaitTime)) {
          console.log('[AutoGenerate] Waiting for storyboard to be ready...');
          await new Promise(resolve => setTimeout(resolve, pollInterval));

          // Get latest project state
          const { project: latestProject } = useProjectStore.getState();
          if (latestProject?.storyboard) {
            currentStoryboard = latestProject.storyboard;
          }
        }

        const { storyboard, uploadedImages } = useProjectStore.getState().project || {};
        if (!storyboard || storyboard.length === 0) {
          throw new Error('No storyboard available for auto-generation after waiting');
        }

        console.log(`[AutoGenerate] ✓ Storyboard is ready with ${storyboard.length} scenes`);

        // Get reference images (select up to 3)
        const referenceImages = uploadedImages?.slice(0, 3) || [];
        const referenceImageUrls = referenceImages.map(img => img.url);

        console.log(`[AutoGenerate] Using ${referenceImageUrls.length} reference images:`, referenceImageUrls);
        console.log(`[AutoGenerate] Generating ${storyboard.length} scenes - images and videos will run in parallel`);
        console.log(`[AutoGenerate] Strategy: Start video generation immediately after each image completes`);

        // Generate all scenes in parallel - each scene generates image, then immediately starts video
        const scenePromises = storyboard.map(async (scene, index) => {
          try {
            console.log(`[AutoGenerate] Scene ${index} - Starting pipeline (image → video)`);

            // Determine if this is an indoor scene
            const isIndoorScene = scene.description.toLowerCase().includes('indoor') ||
                                 scene.description.toLowerCase().includes('interior') ||
                                 scene.description.toLowerCase().includes('inside');

            // Filter reference images for indoor scenes if needed
            const sceneReferenceUrls = isIndoorScene
              ? referenceImageUrls.filter(url =>
                  url.toLowerCase().includes('indoor') || url.toLowerCase().includes('interior')
                )
              : referenceImageUrls;

            // Use all references if filtering resulted in 0
            const finalReferenceUrls = sceneReferenceUrls.length > 0 ? sceneReferenceUrls : referenceImageUrls;

            // STEP 1: Generate image
            console.log(`[AutoGenerate] Scene ${index} - Requesting image generation`);
            const imageResponse = await fetch('/api/generate-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: scene.imagePrompt,
                projectId: project.id,
                sceneIndex: index,
                referenceImageUrls: finalReferenceUrls,
                negativePrompt: scene.negativePrompt,
              }),
            });

            if (!imageResponse.ok) {
              const errorData = await imageResponse.json();
              console.error(`[AutoGenerate] Scene ${index} - Image generation failed:`, errorData);
              throw new Error(`Failed to start image generation for scene ${index}: ${errorData.error || 'Unknown error'}`);
            }

            const imageData = await imageResponse.json();
            console.log(`[AutoGenerate] Scene ${index} - Image prediction created:`, imageData.predictionId);

            // STEP 2: Poll for image completion
            const image = await pollImageStatus(imageData.predictionId, project.id, index);
            console.log(`[AutoGenerate] Scene ${index} - Image completed:`, image.url);

            // STEP 2.5: Add image to project state so it appears in UI
            const { addGeneratedImage } = useProjectStore.getState();
            addGeneratedImage(index, image);
            console.log(`[AutoGenerate] Scene ${index} - Image added to state for UI display`);

            // STEP 3: Immediately start video generation (don't wait for other images)
            const imageUrlForVideo = image.url || image.localPath;
            console.log(`[AutoGenerate] Scene ${index} - Requesting video generation`);

            const videoResponse = await fetch('/api/generate-video', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                imageUrl: imageUrlForVideo,
                prompt: scene.videoPrompt || scene.imagePrompt,
                sceneIndex: index,
                projectId: project.id,
                duration: scene.customDuration || scene.suggestedDuration,
                referenceImageUrls: finalReferenceUrls, // Re-enabled: S3 bucket is now publicly accessible
              }),
            });

            if (!videoResponse.ok) {
              const errorData = await videoResponse.json();
              console.error(`[AutoGenerate] Scene ${index} - Video generation failed:`, errorData);
              throw new Error(`Failed to start video generation for scene ${index}: ${errorData.error || 'Unknown error'}`);
            }

            const videoData = await videoResponse.json();
            console.log(`[AutoGenerate] Scene ${index} - Video prediction created:`, videoData.data.predictionId);

            // STEP 4: Poll for video completion
            const video = await pollVideoStatus(videoData.data.predictionId, project.id, index);
            console.log(`[AutoGenerate] Scene ${index} - Video completed: ${video.videoPath}`);

            // STEP 4.5: Add video to project state so it appears in UI
            const { addGeneratedVideo, initializeTimelineClips } = useProjectStore.getState();
            addGeneratedVideo(index, {
              id: uuidv4(),
              url: video.videoPath.startsWith('http://') || video.videoPath.startsWith('https://')
                ? video.videoPath
                : `/api/serve-video?path=${encodeURIComponent(video.videoPath)}`,
              localPath: video.videoPath,
              actualDuration: video.duration,
              timestamp: new Date().toISOString(),
            });
            console.log(`[AutoGenerate] Scene ${index} - Video added to state for UI display`);

            // STEP 4.6: Refresh timeline to include the new video
            try {
              initializeTimelineClips();
              console.log(`[AutoGenerate] Scene ${index} - Timeline refreshed with new video`);
            } catch (timelineError) {
              console.warn(`[AutoGenerate] Scene ${index} - Failed to refresh timeline:`, timelineError);
              // Don't fail the whole generation if timeline refresh fails
            }

            console.log(`[AutoGenerate] Scene ${index} - COMPLETE (image + video)`);
            return { sceneIndex: index, success: true };
          } catch (error) {
            console.error(`[AutoGenerate] Scene ${index} - Failed:`, error);
            return { sceneIndex: index, success: false, error };
          }
        });

        // Wait for all scenes to complete (each scene runs its full pipeline independently)
        const results = await Promise.all(scenePromises);
        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        console.log(`[AutoGenerate] ALL COMPLETE! Success: ${successCount}/${storyboard.length} scenes, Failed: ${failCount}`);
        onComplete?.();
      } catch (error) {
        console.error('[AutoGenerate] Fatal error:', error);
        onError?.(error as Error);
      }
    };

    runAutoGeneration();
  }, [enabled, project, onComplete, onError]);
}

// Helper function to poll image status
async function pollImageStatus(predictionId: string, projectId: string, sceneIndex: number): Promise<any> {
  const maxAttempts = 120; // 10 minutes at 5s intervals
  const interval = 5000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const statusResponse = await fetch(
      `/api/generate-image/${predictionId}?projectId=${projectId}&sceneIndex=${sceneIndex}`
    );
    const statusData = await statusResponse.json();

    if (statusData.status === 'succeeded' && statusData.image) {
      return statusData.image;
    } else if (statusData.status === 'failed' || statusData.status === 'canceled') {
      throw new Error(statusData.error || 'Image generation failed');
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error('Image generation timed out');
}

// Helper function to poll video status
async function pollVideoStatus(predictionId: string, projectId: string, sceneIndex: number): Promise<any> {
  const maxAttempts = 240; // 20 minutes at 5s intervals
  const interval = 5000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const statusResponse = await fetch(
      `/api/generate-video/${predictionId}?projectId=${projectId}&sceneIndex=${sceneIndex}`
    );
    const statusData = await statusResponse.json();

    // Check if succeeded
    if (statusData.success && statusData.data?.status === 'succeeded') {
      return {
        videoPath: statusData.data.video?.localPath || statusData.data.output,
        duration: statusData.data.video?.duration,
      };
    } else if (statusData.data?.status === 'failed' || statusData.data?.status === 'canceled') {
      throw new Error(statusData.error || 'Video generation failed');
    } else if (!statusData.success) {
      throw new Error(statusData.error || 'Video generation failed');
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error('Video generation timed out');
}
