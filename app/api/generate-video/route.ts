import { NextRequest, NextResponse } from 'next/server';
import { createVideoPredictionWithRetry } from '@/lib/video/generator';

/**
 * POST /api/generate-video
 * Creates a video generation prediction and returns prediction ID for polling
 * 
 * Request Body:
 * {
 *   imageUrl: string;        // Required: S3 URL or public HTTP/HTTPS URL
 *   prompt: string;          // Required: Motion/action description
 *   seedFrame?: string;      // Optional: Seed frame URL for Scene 1-4
 *   sceneIndex: number;      // Required: Scene index (0-4)
 *   projectId: string;       // Required: Project ID
 * }
 * 
 * Response:
 * {
 *   success: boolean;
 *   data?: {
 *     predictionId: string;
 *   };
 *   error?: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Check for required environment variables
    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json(
        {
          success: false,
          error: 'REPLICATE_API_TOKEN environment variable is not set.',
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { imageUrl, prompt, seedFrame, sceneIndex, projectId } = body;

    // Validate required fields
    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json(
        { success: false, error: 'imageUrl is required and must be a string' },
        { status: 400 }
      );
    }

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { success: false, error: 'prompt is required and must be a string' },
        { status: 400 }
      );
    }

    if (typeof sceneIndex !== 'number' || sceneIndex < 0 || sceneIndex > 4) {
      return NextResponse.json(
        { success: false, error: 'sceneIndex is required and must be a number between 0 and 4' },
        { status: 400 }
      );
    }

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'projectId is required and must be a string' },
        { status: 400 }
      );
    }

    // Validate that imageUrl is an HTTP/HTTPS URL (S3 or other public URL)
    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'imageUrl must be a publicly accessible HTTP/HTTPS URL (e.g., S3 URL)' 
        },
        { status: 400 }
      );
    }

    // Validate seed frame URL if provided
    let seedFrameUrl: string | undefined;
    if (seedFrame) {
      if (typeof seedFrame !== 'string') {
        return NextResponse.json(
          { success: false, error: 'seedFrame must be a string if provided' },
          { status: 400 }
        );
      }
      if (!seedFrame.startsWith('http://') && !seedFrame.startsWith('https://')) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'seedFrame must be a publicly accessible HTTP/HTTPS URL (e.g., S3 URL)' 
          },
          { status: 400 }
        );
      }
      seedFrameUrl = seedFrame;
    }

    // Create video prediction (returns prediction ID for polling)
    const predictionId = await createVideoPredictionWithRetry(
      imageUrl,
      prompt,
      seedFrameUrl
    );

    return NextResponse.json({
      success: true,
      data: {
        predictionId,
      },
    });
  } catch (error: any) {
    console.error('[API] Video generation error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Video generation failed',
      },
      { status: 500 }
    );
  }
}

