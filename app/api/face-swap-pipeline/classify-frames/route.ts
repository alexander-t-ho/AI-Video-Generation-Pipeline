import { NextRequest, NextResponse } from 'next/server';
import { classifyFrames } from '@/lib/services/face-swap-pipeline/scene-classifier';

export const dynamic = 'force-dynamic';

/**
 * POST /api/face-swap-pipeline/classify-frames
 * Classify frames to detect scene types
 * 
 * Request Body (JSON):
 * {
 *   frameUrls: string[] - Array of frame URLs or paths
 * }
 * 
 * Response:
 * {
 *   success: boolean;
 *   classifications?: SceneClassificationResult[];
 *   error?: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { frameUrls } = body;

    if (!frameUrls || !Array.isArray(frameUrls) || frameUrls.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing or invalid field: frameUrls (must be non-empty array)',
        },
        { status: 400 }
      );
    }

    console.log('[ClassifyFrames API] Classifying', frameUrls.length, 'frames');

    const classifications = await classifyFrames(frameUrls);

    console.log('[ClassifyFrames API] ✓ Classified', classifications.length, 'frames');

    return NextResponse.json({
      success: true,
      classifications,
    });
  } catch (error: any) {
    console.error('[ClassifyFrames API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to classify frames',
      },
      { status: 500 }
    );
  }
}

