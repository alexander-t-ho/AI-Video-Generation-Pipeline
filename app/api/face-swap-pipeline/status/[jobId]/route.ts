import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/services/face-swap-pipeline/pipeline-orchestrator';
import { ProcessingStatus } from '@/lib/types/face-swap-pipeline';

export const dynamic = 'force-dynamic';

/**
 * GET /api/face-swap-pipeline/status/[jobId]
 * Get processing job status
 * 
 * Response:
 * {
 *   success: boolean;
 *   status?: ProcessingStatus;
 *   error?: string;
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    console.log('[Status API] Request for jobId:', jobId);

    if (!jobId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing jobId parameter',
        },
        { status: 400 }
      );
    }

    const job = getJob(jobId);

    if (!job) {
      console.warn('[Status API] Job not found:', jobId);
      return NextResponse.json(
        {
          success: false,
          error: 'Job not found',
        },
        { status: 404 }
      );
    }

    console.log('[Status API] Job found:', {
      id: job.id,
      phase: job.phase,
      progress: job.progress,
    });

    const status: ProcessingStatus = {
      jobId: job.id,
      phase: job.phase,
      progress: job.progress,
      totalFrames: job.totalFrames,
      processedFrames: job.processedFrames,
      currentFrame: job.frames.length > 0 ? job.frames[job.processedFrames]?.frameNumber : undefined,
      errors: job.errors,
      resultVideoUrl: job.resultVideoUrl,
    };

    return NextResponse.json({
      success: true,
      status,
    });
  } catch (error: any) {
    console.error('[Status API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get status',
      },
      { status: 500 }
    );
  }
}

