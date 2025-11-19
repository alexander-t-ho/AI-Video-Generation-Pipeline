import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession, checkProjectAccess } from '@/lib/auth/auth-utils';

// GET /api/projects/[id]/timeline - Get timeline clips
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

    const clips = await prisma.timelineClip.findMany({
      where: { projectId: id },
      include: {
        scene: true,
        video: true,
      },
      orderBy: { order: 'asc' },
    });

    return NextResponse.json({ clips });
  } catch (error) {
    console.error('Error fetching timeline:', error);
    return NextResponse.json({ error: 'Failed to fetch timeline' }, { status: 500 });
  }
}

// POST /api/projects/[id]/timeline - Add timeline clip
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
    const { sceneId, videoId, title, startTime, duration, trimStart, trimEnd, order } = body;

    if (!sceneId || !videoId || !title || startTime === undefined || !duration || order === undefined) {
      return NextResponse.json(
        { error: 'sceneId, videoId, title, startTime, duration, and order are required' },
        { status: 400 }
      );
    }

    const clip = await prisma.timelineClip.create({
      data: {
        projectId: id,
        sceneId,
        videoId,
        title,
        startTime,
        duration,
        trimStart,
        trimEnd,
        order,
      },
      include: {
        scene: true,
        video: true,
      },
    });

    return NextResponse.json({ clip }, { status: 201 });
  } catch (error) {
    console.error('Error creating clip:', error);
    return NextResponse.json({ error: 'Failed to create clip' }, { status: 500 });
  }
}

// PUT /api/projects/[id]/timeline - Replace entire timeline
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
    const clipsData = Array.isArray(body) ? body : body.clips;

    // Replace all clips in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Delete existing clips
      await tx.timelineClip.deleteMany({
        where: { projectId: id },
      });

      // Create new clips
      const createdClips = await Promise.all(
        clipsData.map((clipData: {
          sceneId: string;
          videoId: string;
          title: string;
          startTime: number;
          duration: number;
          trimStart?: number;
          trimEnd?: number;
          order: number;
        }) =>
          tx.timelineClip.create({
            data: {
              projectId: id,
              sceneId: clipData.sceneId,
              videoId: clipData.videoId,
              title: clipData.title,
              startTime: clipData.startTime,
              duration: clipData.duration,
              trimStart: clipData.trimStart,
              trimEnd: clipData.trimEnd,
              order: clipData.order,
            },
            include: {
              scene: true,
              video: true,
            },
          })
        )
      );

      return createdClips;
    });

    return NextResponse.json({ clips: result });
  } catch (error) {
    console.error('Error replacing timeline:', error);
    return NextResponse.json({ error: 'Failed to replace timeline' }, { status: 500 });
  }
}

// PATCH /api/projects/[id]/timeline - Update clip(s)
export async function PATCH(
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
    const { clipId, startTime, duration, trimStart, trimEnd, order } = body;

    if (!clipId) {
      return NextResponse.json({ error: 'Clip ID is required' }, { status: 400 });
    }

    const clip = await prisma.timelineClip.update({
      where: { id: clipId, projectId: id },
      data: {
        ...(startTime !== undefined && { startTime }),
        ...(duration !== undefined && { duration }),
        ...(trimStart !== undefined && { trimStart }),
        ...(trimEnd !== undefined && { trimEnd }),
        ...(order !== undefined && { order }),
      },
      include: {
        scene: true,
        video: true,
      },
    });

    return NextResponse.json({ clip });
  } catch (error) {
    console.error('Error updating clip:', error);
    return NextResponse.json({ error: 'Failed to update clip' }, { status: 500 });
  }
}

// DELETE /api/projects/[id]/timeline?clipId=xxx - Delete clip
export async function DELETE(
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

    const { searchParams } = new URL(req.url);
    const clipId = searchParams.get('clipId');

    if (!clipId) {
      return NextResponse.json({ error: 'Clip ID is required' }, { status: 400 });
    }

    await prisma.timelineClip.delete({
      where: { id: clipId, projectId: id },
    });

    return NextResponse.json({ message: 'Clip deleted successfully' });
  } catch (error) {
    console.error('Error deleting clip:', error);
    return NextResponse.json({ error: 'Failed to delete clip' }, { status: 500 });
  }
}
