import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession, checkProjectAccess } from '@/lib/auth/auth-utils';

// GET /api/projects/[id]/scenes/[sceneId] - Get scene with all assets
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sceneId: string }> }
) {
  try {
    const session = await getSession();
    const { id, sceneId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasAccess = await checkProjectAccess(session.user.id, id);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const scene = await prisma.scene.findUnique({
      where: { id: sceneId, projectId: id },
      include: {
        generatedImages: {
          orderBy: { createdAt: 'desc' },
        },
        generatedVideos: {
          orderBy: { createdAt: 'desc' },
        },
        seedFrames: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!scene) {
      return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
    }

    return NextResponse.json({ scene });
  } catch (error) {
    console.error('Error fetching scene:', error);
    return NextResponse.json({ error: 'Failed to fetch scene' }, { status: 500 });
  }
}

// PATCH /api/projects/[id]/scenes/[sceneId] - Update scene
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sceneId: string }> }
) {
  try {
    const session = await getSession();
    const { id, sceneId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasAccess = await checkProjectAccess(session.user.id, id);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const {
      sceneTitle,
      sceneSummary,
      imagePrompt,
      videoPrompt,
      suggestedDuration,
      negativePrompt,
      customDuration,
      customImageInput,
      useSeedFrame,
      status,
    } = body;

    const scene = await prisma.scene.update({
      where: { id: sceneId, projectId: id },
      data: {
        ...(sceneTitle !== undefined && { sceneTitle }),
        ...(sceneSummary !== undefined && { sceneSummary }),
        ...(imagePrompt !== undefined && { imagePrompt }),
        ...(videoPrompt !== undefined && { videoPrompt }),
        ...(suggestedDuration !== undefined && { suggestedDuration }),
        ...(negativePrompt !== undefined && { negativePrompt }),
        ...(customDuration !== undefined && { customDuration }),
        ...(customImageInput !== undefined && { customImageInput }),
        ...(useSeedFrame !== undefined && { useSeedFrame }),
        ...(status !== undefined && { status }),
      },
      include: {
        generatedImages: true,
        generatedVideos: true,
        seedFrames: true,
      },
    });

    return NextResponse.json({ scene });
  } catch (error) {
    console.error('Error updating scene:', error);
    return NextResponse.json({ error: 'Failed to update scene' }, { status: 500 });
  }
}

// DELETE /api/projects/[id]/scenes/[sceneId] - Delete scene
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sceneId: string }> }
) {
  try {
    const session = await getSession();
    const { id, sceneId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasAccess = await checkProjectAccess(session.user.id, id);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // TODO: Delete S3 assets

    await prisma.scene.delete({
      where: { id: sceneId, projectId: id },
    });

    // Renumber remaining scenes
    const remainingScenes = await prisma.scene.findMany({
      where: { projectId: id },
      orderBy: { sceneNumber: 'asc' },
    });

    await prisma.$transaction(
      remainingScenes.map((scene, index) =>
        prisma.scene.update({
          where: { id: scene.id },
          data: { sceneNumber: index + 1 },
        })
      )
    );

    return NextResponse.json({ message: 'Scene deleted successfully' });
  } catch (error) {
    console.error('Error deleting scene:', error);
    return NextResponse.json({ error: 'Failed to delete scene' }, { status: 500 });
  }
}
