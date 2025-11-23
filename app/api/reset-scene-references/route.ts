import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';

/**
 * One-time API to clear all scene referenceImageUrls
 * This forces AI re-analysis on next page load
 *
 * Usage: POST /api/reset-scene-references with { projectId: "xxx" }
 */
export async function POST(req: NextRequest) {
  try {
    const { projectId } = await req.json();

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      );
    }

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Get all scenes for this project
    const scenes = await prisma.scene.findMany({
      where: { projectId },
      select: { id: true }
    });

    // Clear referenceImageUrls for all scenes
    await prisma.scene.updateMany({
      where: { projectId },
      data: {
        referenceImageUrls: Prisma.JsonNull
      }
    });

    console.log(`[Reset Scene References] Cleared ${scenes.length} scenes for project ${projectId}`);

    return NextResponse.json({
      success: true,
      message: `Cleared referenceImageUrls from ${scenes.length} scenes`,
      clearedScenes: scenes.length
    });

  } catch (error) {
    console.error('[Reset Scene References] Error:', error);
    return NextResponse.json(
      { error: 'Failed to reset scene references' },
      { status: 500 }
    );
  }
}
