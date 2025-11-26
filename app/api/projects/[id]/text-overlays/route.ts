import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';

/**
 * GET /api/projects/[id]/text-overlays
 * Get all text overlays for a project
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: projectId } = await params;

    // Verify user has access to this project
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: session.user.id },
          { companyId: session.user.companyId }
        ]
      }
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Get all text overlays for this project
    const textOverlays = await prisma.textOverlay.findMany({
      where: { projectId },
      orderBy: { order: 'asc' }
    });

    return NextResponse.json({
      success: true,
      textOverlays
    });
  } catch (error: any) {
    console.error('[API] Get text overlays error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get text overlays' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/[id]/text-overlays
 * Create a new text overlay
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: projectId } = await params;
    const body = await request.json();

    // Verify user has access to this project
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: session.user.id },
          { companyId: session.user.companyId }
        ]
      }
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Create text overlay
    const textOverlay = await prisma.textOverlay.create({
      data: {
        projectId,
        text: body.text,
        startTime: body.startTime,
        duration: body.duration,
        x: body.x ?? 0.5,
        y: body.y ?? 0.85,
        fontSize: body.fontSize ?? 48,
        fontFamily: body.fontFamily ?? 'Arial',
        fontColor: body.fontColor ?? '#FFFFFF',
        backgroundColor: body.backgroundColor,
        backgroundOpacity: body.backgroundOpacity ?? 0.0,
        textAlign: body.textAlign ?? 'center',
        fontWeight: body.fontWeight ?? 'normal',
        borderWidth: body.borderWidth ?? 0,
        borderColor: body.borderColor,
        opacity: body.opacity ?? 1.0,
        rotation: body.rotation ?? 0.0,
        shadowEnabled: body.shadowEnabled ?? false,
        shadowOffsetX: body.shadowOffsetX ?? 2,
        shadowOffsetY: body.shadowOffsetY ?? 2,
        shadowBlur: body.shadowBlur ?? 4,
        shadowColor: body.shadowColor ?? '#000000',
        animationIn: body.animationIn,
        animationOut: body.animationOut,
        order: body.order ?? 0,
      }
    });

    return NextResponse.json({
      success: true,
      textOverlay
    });
  } catch (error: any) {
    console.error('[API] Create text overlay error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create text overlay' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/projects/[id]/text-overlays
 * Update a text overlay
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: projectId } = await params;
    const body = await request.json();
    const { overlayId, ...updates } = body;

    if (!overlayId) {
      return NextResponse.json(
        { error: 'overlayId is required' },
        { status: 400 }
      );
    }

    // Verify user has access to this project
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: session.user.id },
          { companyId: session.user.companyId }
        ]
      }
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Update text overlay
    const textOverlay = await prisma.textOverlay.update({
      where: { id: overlayId },
      data: updates
    });

    return NextResponse.json({
      success: true,
      textOverlay
    });
  } catch (error: any) {
    console.error('[API] Update text overlay error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update text overlay' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[id]/text-overlays
 * Delete a text overlay
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: projectId } = await params;
    const { searchParams } = new URL(request.url);
    const overlayId = searchParams.get('overlayId');

    if (!overlayId) {
      return NextResponse.json(
        { error: 'overlayId is required' },
        { status: 400 }
      );
    }

    // Verify user has access to this project
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: session.user.id },
          { companyId: session.user.companyId }
        ]
      }
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Delete text overlay
    await prisma.textOverlay.delete({
      where: { id: overlayId }
    });

    return NextResponse.json({
      success: true
    });
  } catch (error: any) {
    console.error('[API] Delete text overlay error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete text overlay' },
      { status: 500 }
    );
  }
}
