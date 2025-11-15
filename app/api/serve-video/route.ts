import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

/**
 * GET /api/serve-video
 * Serves local video files
 * 
 * Query Parameters:
 * - path: string - Local file path to the video
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const videoPath = searchParams.get('path');

    if (!videoPath) {
      return NextResponse.json(
        { error: 'path parameter is required' },
        { status: 400 }
      );
    }

    // Convert to absolute path
    let absolutePath = videoPath;
    if (!path.isAbsolute(videoPath)) {
      absolutePath = path.join(process.cwd(), videoPath);
    }

    // Check if file exists
    try {
      await fs.access(absolutePath);
    } catch {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    // Read file
    const fileBuffer = await fs.readFile(absolutePath);
    
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Cache-Control': 'public, max-age=3600',
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (error: any) {
    console.error('[API] Error serving video:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to serve video' },
      { status: 500 }
    );
  }
}

