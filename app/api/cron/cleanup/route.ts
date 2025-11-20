/**
 * Cron Cleanup API - Scheduled cleanup job endpoint
 *
 * This endpoint is designed to be called by a cron service (e.g., Vercel Cron, GitHub Actions)
 * to run scheduled cleanup tasks.
 *
 * POST /api/cron/cleanup
 *
 * Security: Requires CRON_SECRET environment variable to be set and matched in Authorization header
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { runScheduledCleanup } from '@/lib/storage/cleanup-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max for cleanup job

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret) {
      if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
        console.warn('[Cron Cleanup] Unauthorized request');
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    } else {
      console.warn('[Cron Cleanup] CRON_SECRET not set - endpoint is unprotected!');
    }

    console.log('[Cron Cleanup] Starting scheduled cleanup job...');
    const startTime = Date.now();

    // Run the scheduled cleanup
    const result = await runScheduledCleanup(prisma);

    const duration = Date.now() - startTime;

    // Calculate summary stats
    const totalDeletedFiles = Object.values(result.tempCleanup).reduce(
      (sum, r) => sum + r.deletedFiles,
      0
    );
    const totalDeletedBytes = Object.values(result.tempCleanup).reduce(
      (sum, r) => sum + r.deletedBytes,
      0
    );
    const totalErrors = Object.values(result.tempCleanup).reduce(
      (sum, r) => sum + r.errors.length,
      0
    );

    console.log('[Cron Cleanup] Cleanup completed:', {
      duration: `${duration}ms`,
      projectsCleaned: Object.keys(result.tempCleanup).length,
      filesDeleted: totalDeletedFiles,
      bytesFreed: `${(totalDeletedBytes / 1024 / 1024).toFixed(2)} MB`,
      uploadedFilesCleaned: result.uploadedCleanup.deletedFiles,
      orphanedFilesFound: result.orphanedFiles.length,
      errors: totalErrors,
    });

    return NextResponse.json({
      success: true,
      duration: `${duration}ms`,
      summary: {
        projectsCleaned: Object.keys(result.tempCleanup).length,
        filesDeleted: totalDeletedFiles,
        bytesFreed: totalDeletedBytes,
        uploadedFilesCleaned: result.uploadedCleanup.deletedFiles,
        orphanedFilesFound: result.orphanedFiles.length,
        errors: totalErrors,
      },
      details: {
        tempCleanup: result.tempCleanup,
        uploadedCleanup: result.uploadedCleanup,
        orphanedFiles: result.orphanedFiles.slice(0, 100), // Limit to first 100
      },
    });
  } catch (error) {
    console.error('[Cron Cleanup] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cleanup failed' },
      { status: 500 }
    );
  }
}

// GET endpoint for health check
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/cron/cleanup',
    description: 'Scheduled cleanup job for temporary files',
    usage: 'POST with Authorization: Bearer <CRON_SECRET>',
  });
}
