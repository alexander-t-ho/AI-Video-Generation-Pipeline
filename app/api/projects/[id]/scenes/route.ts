import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession, checkProjectAccess } from '@/lib/auth/auth-utils';

// GET /api/projects/[id]/scenes - List scenes for project
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const { id } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasAccess = await checkProjectAccess(session.user.id, id);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const scenes = await prisma.scene.findMany({
      where: { projectId: id },
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
      orderBy: { sceneNumber: 'asc' },
    });

    return NextResponse.json({ scenes });
  } catch (error) {
    console.error('Error fetching scenes:', error);
    return NextResponse.json({ error: 'Failed to fetch scenes' }, { status: 500 });
  }
}

// POST /api/projects/[id]/scenes - Add scene(s)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const { id } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasAccess = await checkProjectAccess(session.user.id, id);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();

    // Support both single scene and array of scenes
    const scenesData = Array.isArray(body) ? body : [body];

    const createdScenes = await prisma.$transaction(
      scenesData.map((sceneData) =>
        prisma.scene.create({
          data: {
            projectId: id,
            sceneNumber: sceneData.sceneNumber,
            sceneTitle: sceneData.sceneTitle,
            sceneSummary: sceneData.sceneSummary,
            imagePrompt: sceneData.imagePrompt,
            suggestedDuration: sceneData.suggestedDuration,
            negativePrompt: sceneData.negativePrompt,
            customDuration: sceneData.customDuration,
            customImageInput: sceneData.customImageInput,
            useSeedFrame: sceneData.useSeedFrame || false,
            status: 'PENDING',
          },
        })
      )
    );

    // Update project status to scene_generation
    await prisma.project.update({
      where: { id },
      data: { status: 'SCENE_GENERATION' },
    });

    return NextResponse.json({ scenes: createdScenes }, { status: 201 });
  } catch (error) {
    console.error('Error creating scenes:', error);
    return NextResponse.json({ error: 'Failed to create scenes' }, { status: 500 });
  }
}

// PUT /api/projects/[id]/scenes - Replace all scenes (for storyboard regeneration)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const { id } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasAccess = await checkProjectAccess(session.user.id, id);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const scenesData = Array.isArray(body) ? body : [body];

    // Delete existing scenes and create new ones in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Delete existing scenes (cascade deletes related data)
      await tx.scene.deleteMany({
        where: { projectId: id },
      });

      // Create new scenes
      const createdScenes = await Promise.all(
        scenesData.map((sceneData) =>
          tx.scene.create({
            data: {
              projectId: id,
              sceneNumber: sceneData.sceneNumber,
              sceneTitle: sceneData.sceneTitle,
              sceneSummary: sceneData.sceneSummary,
              imagePrompt: sceneData.imagePrompt,
              suggestedDuration: sceneData.suggestedDuration,
              negativePrompt: sceneData.negativePrompt,
              customDuration: sceneData.customDuration,
              customImageInput: sceneData.customImageInput,
              useSeedFrame: sceneData.useSeedFrame || false,
              status: 'PENDING',
            },
          })
        )
      );

      return createdScenes;
    });

    return NextResponse.json({ scenes: result });
  } catch (error) {
    console.error('Error replacing scenes:', error);
    return NextResponse.json({ error: 'Failed to replace scenes' }, { status: 500 });
  }
}
