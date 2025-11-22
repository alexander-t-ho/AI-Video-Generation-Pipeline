import { NextRequest, NextResponse } from 'next/server';
import { extractFrames } from '@/lib/video/frame-extractor';
import path from 'path';
import fs from 'fs/promises';

/**
 * POST /api/extract-frames
 * Extracts the last frame from a video for use as a seed frame
 *
 * Request Body:
 * {
 *   videoPath: string;      // Required: Local path to video file
 *   projectId: string;      // Required: Project ID
 *   sceneIndex: number;     // Required: Scene index (0-4)
 * }
 *
 * Response:
 * {
 *   success: boolean;
 *   data?: {
 *     frames: SeedFrame[];  // Array with a single frame
 *   };
 *   error?: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoPath, projectId, sceneIndex } = body;

    // Validate required fields
    if (!videoPath || typeof videoPath !== 'string') {
      return NextResponse.json(
        { success: false, error: 'videoPath is required and must be a string' },
        { status: 400 }
      );
    }

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'projectId is required and must be a string' },
        { status: 400 }
      );
    }

    if (typeof sceneIndex !== 'number' || sceneIndex < 0 || sceneIndex > 4) {
      return NextResponse.json(
        { success: false, error: 'sceneIndex is required and must be a number between 0 and 4' },
        { status: 400 }
      );
    }

    // Convert relative path to absolute if needed
    const projectRoot = process.cwd();
    const absoluteVideoPath = path.isAbsolute(videoPath)
      ? videoPath
      : path.join(projectRoot, videoPath);

    // Verify video file exists
    try {
      await fs.access(absoluteVideoPath);
    } catch {
      return NextResponse.json(
        { success: false, error: `Video file not found: ${videoPath}` },
        { status: 404 }
      );
    }

    // Extract frames
    const frames = await extractFrames(absoluteVideoPath, projectId, sceneIndex);

    // Verify we got exactly 1 frame
    if (!frames || frames.length !== 1) {
      return NextResponse.json(
        { success: false, error: `Expected 1 frame, got ${frames?.length || 0}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        frames,
      },
    });
  } catch (error: any) {
    console.error('[API] Frame extraction error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Frame extraction failed',
      },
      { status: 500 }
    );
  }
}

