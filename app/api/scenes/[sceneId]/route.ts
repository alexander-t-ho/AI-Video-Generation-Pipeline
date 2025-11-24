import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { getSession } from '@/lib/auth/auth-utils';

/**
 * PATCH /api/scenes/[sceneId]
 * Update scene settings including referenceImageUrls
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  try {
    // Check authentication
    const session = await getSession();
    if (!session?.user?.id) {
      console.error('[Update Scene] Unauthorized - No valid session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sceneId } = await params;
    const updates = await req.json();

    console.log('[Update Scene] Request:', {
      sceneId,
      userId: session.user.id,
      updateFields: Object.keys(updates),
    });

    // Verify scene exists and user has access
    const scene = await prisma.scene.findUnique({
      where: { id: sceneId },
      include: { project: true },
    });

    if (!scene) {
      console.error('[Update Scene] Scene not found:', sceneId);
      return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
    }

    if (scene.project.ownerId !== session.user.id) {
      console.error('[Update Scene] Forbidden - User does not own project:', {
        sceneId,
        projectId: scene.project.id,
        projectOwnerId: scene.project.ownerId,
        userId: session.user.id,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Convert referenceImageUrls array to JSON if present
    const data: any = { ...updates };
    if (updates.referenceImageUrls !== undefined) {
      data.referenceImageUrls = updates.referenceImageUrls;
    }

    // Check if the scene exists first
    const existingScene = await prisma.scene.findUnique({
      where: { id: sceneId },
    });

    if (!existingScene) {
      console.warn(`[Update Scene] Scene ${sceneId} not found in database - skipping update (scene may not be persisted yet)`);
      return NextResponse.json({
        success: true,
        scene: null,
        warning: 'Scene not yet persisted to database',
      });
    }

    const updatedScene = await prisma.scene.update({
      where: { id: sceneId },
      data,
    });

    console.log('[Update Scene] Success:', {
      sceneId,
      updatedFields: Object.keys(updates),
    });

    return NextResponse.json({
      success: true,
      scene: updatedScene,
    });
  } catch (error) {
    console.error('[Update Scene] Error:', {
      sceneId: (await params).sceneId,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Handle specific Prisma errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return NextResponse.json(
          { error: 'Scene not found' },
          { status: 404 }
        );
      }
      if (error.code === 'P2002') {
        return NextResponse.json(
          { error: 'Duplicate field value' },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { 
        error: 'Failed to update scene',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
