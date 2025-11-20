/**
 * Cleanup API - Manages temporary file cleanup
 *
 * POST /api/cleanup - Run cleanup job
 * GET /api/cleanup/status - Get disk usage status
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/auth-utils';
import { prisma } from '@/lib/db/prisma';
import {
  cleanupProjectTempFiles,
  cleanupAllTempFiles,
  getProjectDiskUsage,
  checkStorageThreshold,
  runScheduledCleanup,
  findOrphanedFiles,
  deleteProjectTempFiles,
} from '@/lib/storage/cleanup-service';

// ============================================================================
// POST /api/cleanup - Run cleanup job
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      action = 'cleanup',
      projectId,
      maxAgeHours = 24,
      dryRun = false,
    } = body;

    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

    switch (action) {
      case 'cleanup': {
        // Clean up temp files
        if (projectId) {
          // Verify user has access to project
          const project = await prisma.project.findFirst({
            where: {
              id: projectId,
              ownerId: session.user.id,
            },
          });

          if (!project) {
            return NextResponse.json(
              { error: 'Project not found or access denied' },
              { status: 404 }
            );
          }

          const result = await cleanupProjectTempFiles(projectId, {
            maxAgeMs,
            dryRun,
          });

          return NextResponse.json({
            success: true,
            action: 'cleanup',
            projectId,
            result,
          });
        } else {
          // Clean all projects (admin only or own projects)
          const results = await cleanupAllTempFiles({
            maxAgeMs,
            dryRun,
          });

          return NextResponse.json({
            success: true,
            action: 'cleanup-all',
            results,
          });
        }
      }

      case 'scheduled': {
        // Run full scheduled cleanup
        const result = await runScheduledCleanup(prisma);

        return NextResponse.json({
          success: true,
          action: 'scheduled',
          result,
        });
      }

      case 'delete-project': {
        // Delete all temp files for a project
        if (!projectId) {
          return NextResponse.json(
            { error: 'projectId is required for delete-project action' },
            { status: 400 }
          );
        }

        // Verify user has access to project
        const project = await prisma.project.findFirst({
          where: {
            id: projectId,
            ownerId: session.user.id,
          },
        });

        if (!project) {
          return NextResponse.json(
            { error: 'Project not found or access denied' },
            { status: 404 }
          );
        }

        const result = await deleteProjectTempFiles(projectId);

        return NextResponse.json({
          success: true,
          action: 'delete-project',
          projectId,
          result,
        });
      }

      case 'find-orphans': {
        // Find orphaned files
        const orphans = await findOrphanedFiles(prisma, projectId);

        return NextResponse.json({
          success: true,
          action: 'find-orphans',
          orphanedFiles: orphans,
          count: orphans.length,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Cleanup API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET /api/cleanup/status - Get disk usage status
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (projectId) {
      // Verify user has access to project
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          ownerId: session.user.id,
        },
      });

      if (!project) {
        return NextResponse.json(
          { error: 'Project not found or access denied' },
          { status: 404 }
        );
      }

      const usage = await getProjectDiskUsage(projectId);
      const { exceeded, usage: thresholdUsage } = await checkStorageThreshold(projectId);

      return NextResponse.json({
        success: true,
        projectId,
        usage,
        thresholdExceeded: exceeded,
        thresholdBytes: 5 * 1024 * 1024 * 1024, // 5GB
      });
    } else {
      // Get usage for all user's projects
      const projects = await prisma.project.findMany({
        where: { ownerId: session.user.id },
        select: { id: true, name: true },
      });

      const usageByProject = await Promise.all(
        projects.map(async (project) => {
          const usage = await getProjectDiskUsage(project.id);
          const { exceeded } = await checkStorageThreshold(project.id);
          return {
            ...usage,
            projectName: project.name,
            thresholdExceeded: exceeded,
          };
        })
      );

      const totalBytes = usageByProject.reduce((sum, p) => sum + p.totalBytes, 0);
      const totalFiles = usageByProject.reduce((sum, p) => sum + p.fileCount, 0);

      return NextResponse.json({
        success: true,
        totalBytes,
        totalFiles,
        projects: usageByProject,
      });
    }
  } catch (error) {
    console.error('[Cleanup API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
