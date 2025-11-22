import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession, checkProjectAccess } from '@/lib/auth/auth-utils';

// GET /api/projects/[id] - Get project with all data
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

    // Check access
    const hasAccess = await checkProjectAccess(session.user.id, id);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        scenes: {
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
        },
        timelineClips: {
          include: {
            video: true,
            scene: true,
          },
          orderBy: { order: 'asc' },
        },
        uploadedImages: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error('Error fetching project:', error);
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
  }
}

// PATCH /api/projects/[id] - Update project
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const { id } = await params;

    // Skip auth in development mode
    if (process.env.NODE_ENV !== 'development') {
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Check access
      const hasAccess = await checkProjectAccess(session.user.id, id);
      if (!hasAccess) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const body = await req.json();
    const { name, status, finalVideoUrl, finalVideoS3Key, characterDescription } = body;

    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(status && { status }),
        ...(finalVideoUrl !== undefined && { finalVideoUrl }),
        ...(finalVideoS3Key !== undefined && { finalVideoS3Key }),
        ...(characterDescription !== undefined && { characterDescription }),
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        scenes: {
          orderBy: { sceneNumber: 'asc' },
        },
      },
    });

    return NextResponse.json({ project });
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

// DELETE /api/projects/[id] - Delete project
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

    // Only owner or admin can delete
    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const isOwner = project.ownerId === session.user.id;
    const isAdmin = session.user.role === 'ADMIN' && project.companyId === session.user.companyId;

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // TODO: Delete S3 assets

    await prisma.project.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
