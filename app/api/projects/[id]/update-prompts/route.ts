import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getSession, checkProjectAccess } from '@/lib/auth/auth-utils';
import { updateScenePrompts } from '@/lib/ai/prompt-updater';

/**
 * POST /api/projects/[id]/update-prompts
 * 
 * Updates all scene prompts for a project with asset information.
 * Uses hybrid approach: simple injection for generic prompts,
 * AI rewrite for prompts with conflicts.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  
  try {
    // Authenticate user
    const session = await getSession();
    const { id: projectId } = await params;

    if (!session?.user?.id) {
      console.error('[UpdatePrompts] Unauthorized: No session');
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check project access
    const hasAccess = await checkProjectAccess(session.user.id, projectId);
    if (!hasAccess) {
      console.error('[UpdatePrompts] Forbidden: No access to project', projectId);
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { assetDescription, brand, model, color } = body;

    if (!assetDescription || typeof assetDescription !== 'string') {
      console.error('[UpdatePrompts] Invalid request: assetDescription required');
      return NextResponse.json(
        { success: false, error: 'assetDescription is required' },
        { status: 400 }
      );
    }

    console.log('[UpdatePrompts] Starting prompt update for project:', projectId);
    console.log('[UpdatePrompts] Asset info:', { assetDescription, brand, model, color });

    // Fetch all scenes for the project
    const scenes = await prisma.scene.findMany({
      where: { projectId },
      orderBy: { sceneNumber: 'asc' },
      select: {
        id: true,
        sceneNumber: true,
        sceneTitle: true,
        imagePrompt: true,
        videoPrompt: true,
      },
    });

    if (scenes.length === 0) {
      console.warn('[UpdatePrompts] No scenes found for project:', projectId);
      return NextResponse.json({
        success: true,
        updatedScenes: [],
        message: 'No scenes to update',
      });
    }

    console.log(`[UpdatePrompts] Found ${scenes.length} scenes to update`);

    // Prepare asset info
    const assetInfo = {
      description: assetDescription,
      brand,
      model,
      color,
    };

    // Update prompts for each scene in parallel
    const updatePromises = scenes.map(async (scene) => {
      console.log(`[UpdatePrompts] Processing scene ${scene.sceneNumber}: "${scene.sceneTitle}"`);
      
      try {
        const result = await updateScenePrompts(
          scene.imagePrompt,
          scene.videoPrompt,
          assetInfo
        );

        console.log(`[UpdatePrompts] Scene ${scene.sceneNumber} updated using ${result.method}`, 
          result.hasConflict ? '(had conflict)' : '');

        // Update scene in database
        const updatedScene = await prisma.scene.update({
          where: { id: scene.id },
          data: {
            imagePrompt: result.imagePrompt,
            videoPrompt: result.videoPrompt,
          },
        });

        return {
          sceneId: scene.id,
          sceneNumber: scene.sceneNumber,
          sceneTitle: scene.sceneTitle,
          imagePrompt: result.imagePrompt,
          videoPrompt: result.videoPrompt,
          method: result.method,
          hasConflict: result.hasConflict,
        };
      } catch (error) {
        console.error(`[UpdatePrompts] Error updating scene ${scene.sceneNumber}:`, error);
        
        // Return original prompts if update fails
        return {
          sceneId: scene.id,
          sceneNumber: scene.sceneNumber,
          sceneTitle: scene.sceneTitle,
          imagePrompt: scene.imagePrompt,
          videoPrompt: scene.videoPrompt,
          method: 'unchanged' as const,
          hasConflict: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    const updatedScenes = await Promise.all(updatePromises);

    // Calculate statistics
    const stats = {
      total: updatedScenes.length,
      simple: updatedScenes.filter(s => s.method === 'simple').length,
      aiRewrite: updatedScenes.filter(s => s.method === 'ai-rewrite').length,
      unchanged: updatedScenes.filter(s => s.method === 'unchanged').length,
      conflicts: updatedScenes.filter(s => s.hasConflict).length,
      errors: updatedScenes.filter(s => 'error' in s).length,
    };

    const duration = Date.now() - startTime;
    console.log(`[UpdatePrompts] Completed in ${duration}ms:`, stats);

    return NextResponse.json({
      success: true,
      updatedScenes,
      stats,
      duration,
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[UpdatePrompts] Error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update prompts',
        duration,
      },
      { status: 500 }
    );
  }
}

