import { NextRequest, NextResponse } from 'next/server';
import { applyClipEdits } from '@/lib/video/editor';
import { TimelineClip } from '@/lib/types';

/**
 * POST /api/apply-clip-edits
 * Applies timeline clip edits (trim/crop) and returns paths to edited videos
 * 
 * Request Body:
 * {
 *   clips: TimelineClip[];
 *   projectId: string;
 * }
 * 
 * Response:
 * {
 *   success: boolean;
 *   data?: {
 *     editedVideoPaths: string[];
 *   };
 *   error?: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clips, projectId } = body;

    if (!Array.isArray(clips)) {
      return NextResponse.json(
        { success: false, error: 'clips must be an array' },
        { status: 400 }
      );
    }

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'projectId is required and must be a string' },
        { status: 400 }
      );
    }

    const editedVideoPaths = await applyClipEdits(clips as TimelineClip[], projectId);

    return NextResponse.json({
      success: true,
      data: {
        editedVideoPaths,
      },
    });
  } catch (error: any) {
    console.error('[API] Apply clip edits error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to apply clip edits',
      },
      { status: 500 }
    );
  }
}

