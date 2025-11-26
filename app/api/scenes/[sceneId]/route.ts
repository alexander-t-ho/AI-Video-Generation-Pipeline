import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';

/**
 * PATCH /api/scenes/[sceneId]
 * Update scene settings including referenceImageUrls
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  try {
    const { sceneId } = await params;
    const updates = await req.json();

    // Convert referenceImageUrls array to JSON if present
    const data: any = { ...updates };
    if (updates.referenceImageUrls !== undefined) {
      data.referenceImageUrls = updates.referenceImageUrls;
    }

    const updatedScene = await prisma.scene.update({
      where: { id: sceneId },
      data,
    });

    return NextResponse.json({
      success: true,
      scene: updatedScene,
    });
  } catch (error) {
    console.error('[Update Scene] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update scene' },
      { status: 500 }
    );
  }
}
