import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession, checkProjectAccess } from '@/lib/auth/auth-utils';

// POST /api/projects/[id]/scenes/[sceneId]/images - Add generated image
export async function POST(
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
    const { url, s3Key, localPath, prompt, replicateId, isSelected } = body;

    if (!url || !prompt || !replicateId) {
      return NextResponse.json(
        { error: 'URL, prompt, and replicateId are required' },
        { status: 400 }
      );
    }

    // If isSelected, deselect all other images for this scene
    if (isSelected) {
      await prisma.generatedImage.updateMany({
        where: { sceneId },
        data: { isSelected: false },
      });
    }

    const image = await prisma.generatedImage.create({
      data: {
        sceneId,
        url,
        s3Key,
        localPath,
        prompt,
        replicateId,
        isSelected: isSelected || false,
      },
    });

    // Update scene status
    await prisma.scene.update({
      where: { id: sceneId },
      data: { status: 'IMAGE_READY' },
    });

    return NextResponse.json({ image }, { status: 201 });
  } catch (error) {
    console.error('Error creating image:', error);
    return NextResponse.json({ error: 'Failed to create image' }, { status: 500 });
  }
}

// PATCH /api/projects/[id]/scenes/[sceneId]/images - Select image
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
    const { imageId } = body;

    if (!imageId) {
      return NextResponse.json({ error: 'Image ID is required' }, { status: 400 });
    }

    // Deselect all images for this scene
    await prisma.generatedImage.updateMany({
      where: { sceneId },
      data: { isSelected: false },
    });

    // Select the specified image
    const image = await prisma.generatedImage.update({
      where: { id: imageId },
      data: { isSelected: true },
    });

    return NextResponse.json({ image });
  } catch (error) {
    console.error('Error selecting image:', error);
    return NextResponse.json({ error: 'Failed to select image' }, { status: 500 });
  }
}
