import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession, checkProjectAccess } from '@/lib/auth/auth-utils';

// POST /api/projects/[id]/scenes/[sceneId]/videos - Add generated video
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
    const { url, s3Key, localPath, duration, prompt, isSelected } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // If isSelected, deselect all other videos for this scene
    if (isSelected) {
      await prisma.generatedVideo.updateMany({
        where: { sceneId },
        data: { isSelected: false },
      });
    }

    const video = await prisma.generatedVideo.create({
      data: {
        sceneId,
        url,
        s3Key,
        localPath,
        duration,
        prompt,
        isSelected: isSelected || false,
      },
    });

    // Update scene status
    await prisma.scene.update({
      where: { id: sceneId },
      data: { status: 'VIDEO_READY' },
    });

    return NextResponse.json({ video }, { status: 201 });
  } catch (error) {
    console.error('Error creating video:', error);
    return NextResponse.json({ error: 'Failed to create video' }, { status: 500 });
  }
}

// PATCH /api/projects/[id]/scenes/[sceneId]/videos - Select video
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
    const { videoId } = body;

    if (!videoId) {
      return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
    }

    // Deselect all videos for this scene
    await prisma.generatedVideo.updateMany({
      where: { sceneId },
      data: { isSelected: false },
    });

    // Select the specified video
    const video = await prisma.generatedVideo.update({
      where: { id: videoId },
      data: { isSelected: true },
    });

    return NextResponse.json({ video });
  } catch (error) {
    console.error('Error selecting video:', error);
    return NextResponse.json({ error: 'Failed to select video' }, { status: 500 });
  }
}
