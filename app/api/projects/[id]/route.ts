/**
 * Project API Routes
 * GET/PATCH/DELETE /api/projects/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { requireAuth, requireProjectAccess, createErrorResponse, createSuccessResponse } from '@/lib/api/middleware';

// GET /api/projects/[id] - Get project with all data
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { session, error: authError } = await requireAuth(req);
    if (authError) return authError;

    const { hasAccess, error: accessError } = await requireProjectAccess(session.user.id, id);
    if (accessError) return accessError;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
        scenes: {
          include: {
            generatedImages: { orderBy: { createdAt: 'desc' } },
            generatedVideos: { orderBy: { createdAt: 'desc' } },
            seedFrames: { orderBy: { createdAt: 'desc' } },
          },
          orderBy: { sceneNumber: 'asc' },
        },
        timelineClips: {
          include: { video: true, scene: true },
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

    return createSuccessResponse({ project });
  } catch (error) {
    return createErrorResponse(error, 'Failed to fetch project');
  }
}

// PATCH /api/projects/[id] - Update project
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Skip auth in development
    if (process.env.NODE_ENV !== 'development') {
      const { session, error: authError } = await requireAuth(req);
      if (authError) return authError;

      const { hasAccess, error: accessError } = await requireProjectAccess(session.user.id, id);
      if (accessError) return accessError;
    }

    const body = await req.json();
    const { name, status, finalVideoUrl, finalVideoS3Key, characterDescription, targetDuration } = body;

    // Check if the project exists first
    const existingProject = await prisma.project.findUnique({
      where: { id },
    });

    if (!existingProject) {
      console.warn(`[Update Project] Project ${id} not found in database`);
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(status && { status }),
        ...(finalVideoUrl !== undefined && { finalVideoUrl }),
        ...(finalVideoS3Key !== undefined && { finalVideoS3Key }),
        ...(characterDescription !== undefined && { characterDescription }),
        ...(targetDuration !== undefined && { targetDuration }),
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        scenes: { orderBy: { sceneNumber: 'asc' } },
      },
    });

    return createSuccessResponse({ project });
  } catch (error) {
    return createErrorResponse(error, 'Failed to update project');
  }
}

// DELETE /api/projects/[id] - Delete project
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { session, error: authError } = await requireAuth(req);
    if (authError) return authError;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const isOwner = project.ownerId === session.user.id;
    const isAdmin = session.user.role === 'ADMIN' && project.companyId === session.user.companyId;

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.project.delete({ where: { id } });

    return createSuccessResponse({ message: 'Project deleted successfully' });
  } catch (error) {
    return createErrorResponse(error, 'Failed to delete project');
  }
}
