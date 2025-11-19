import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

/**
 * GET /api/project/[projectId]/status
 * 
 * Returns the current status of a project.
 * 
 * Note: This is a minimal implementation. In production, project state
 * should be stored in a database. For now, this returns basic status
 * based on what's available in the file system.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params;

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    // Check if project directory exists
    const projectDir = path.join('/tmp', 'projects', projectId);
    
    try {
      await fs.access(projectDir);
    } catch {
      // Project directory doesn't exist yet
      return NextResponse.json({
        currentScene: 0,
        scenes: Array(5).fill(null).map((_, i) => ({
          status: 'pending' as const,
        })),
        finalVideoUrl: null,
        finalVideoS3Key: null,
      });
    }

    // Check for final video
    const finalVideoPath = path.join(projectDir, 'final', 'video.mp4');
    let finalVideoUrl: string | null = null;
    let finalVideoS3Key: string | null = null;

    try {
      await fs.access(finalVideoPath);
      // If final video exists, construct URL (this would be S3 URL in production)
      finalVideoUrl = `/api/project/${projectId}/final/video.mp4`;
    } catch {
      // Final video doesn't exist yet
    }

    // Check scene status by looking for generated files
    const scenes: { status: 'pending' | 'image_ready' | 'video_ready' }[] = [];
    for (let i = 0; i < 5; i++) {
      const sceneDir = path.join(projectDir, 'scenes', `scene-${i}`);
      let status: 'pending' | 'image_ready' | 'video_ready' = 'pending';

      try {
        await fs.access(sceneDir);
        // Check for video file
        const videoPath = path.join(sceneDir, 'video.mp4');
        try {
          await fs.access(videoPath);
          status = 'video_ready';
        } catch {
          // Check for images
          const imagesDir = path.join(sceneDir, 'images');
          try {
            const files = await fs.readdir(imagesDir);
            if (files.length > 0) {
              status = 'image_ready';
            }
          } catch {
            // No images yet
          }
        }
      } catch {
        // Scene directory doesn't exist
        status = 'pending';
      }

      scenes.push({ status });
    }

    // Determine current scene (first scene that's not video_ready)
    const currentScene = scenes.findIndex(
      (scene) => scene.status !== 'video_ready'
    );
    const currentSceneIndex = currentScene === -1 ? 4 : currentScene;

    return NextResponse.json({
      currentScene: currentSceneIndex,
      scenes,
      finalVideoUrl,
      finalVideoS3Key,
    });
  } catch (error: any) {
    console.error('[Project Status API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get project status' },
      { status: 500 }
    );
  }
}

