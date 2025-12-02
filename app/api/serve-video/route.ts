import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { videoCache } from '@/lib/storage/cache';

/**
 * GET /api/serve-video
 * Serves local video files with HTTP 206 range request support
 *
 * Query Parameters:
 * - path: string - Local file path to the video
 *
 * Headers:
 * - Range: bytes=start-end (optional) - Request specific byte range
 */
export const dynamic = 'force-dynamic';

// Allowed base paths for security
const ALLOWED_PATHS = [
  '/tmp/projects/',
  path.join(process.cwd(), 'video testing'),
];

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

    // Security check: ensure path is within allowed directories
    const isAllowed = ALLOWED_PATHS.some(allowedPath =>
      absolutePath.startsWith(allowedPath)
    );

    if (!isAllowed) {
      console.warn(`[serve-video] Blocked access to: ${absolutePath}`);
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Get file stats
    let stats;
    try {
      stats = await fs.stat(absolutePath);
    } catch {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    const fileSize = stats.size;
    const rangeHeader = request.headers.get('range');

    // Determine content type from extension
    const ext = path.extname(absolutePath).toLowerCase();
    const contentType = ext === '.webm' ? 'video/webm' :
                        ext === '.mov' ? 'video/quicktime' :
                        'video/mp4';

    // Handle range request (HTTP 206 Partial Content)
    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      // Validate range
      if (start >= fileSize || end >= fileSize || start > end) {
        return new NextResponse(null, {
          status: 416, // Range Not Satisfiable
          headers: {
            'Content-Range': `bytes */${fileSize}`,
          },
        });
      }

      const chunkSize = end - start + 1;

      // Read the specific range
      const fileHandle = await fs.open(absolutePath, 'r');
      const buffer = Buffer.alloc(chunkSize);
      await fileHandle.read(buffer, 0, chunkSize, start);
      await fileHandle.close();

      return new NextResponse(buffer, {
        status: 206, // Partial Content
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // No range header - return full file
    // CHECK CACHE FIRST
    let fileBuffer = videoCache.get(absolutePath);
    let fromCache = false;

    if (!fileBuffer) {
      // Not in cache - read from disk
      fileBuffer = await fs.readFile(absolutePath);
      
      // Cache for next time (only if reasonably sized)
      if (fileSize <= 100 * 1024 * 1024) { // Only cache files ≤ 100MB
        videoCache.set(absolutePath, fileBuffer);
      }
    } else {
      fromCache = true;
    }

    return new NextResponse(Buffer.from(fileBuffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(fileSize),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
        'X-Cache': fromCache ? 'HIT' : 'MISS', // Debug header
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

/**
 * HEAD request support for video metadata
 */
export async function HEAD(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const videoPath = searchParams.get('path');

    if (!videoPath) {
      return new NextResponse(null, { status: 400 });
    }

    // Convert to absolute path
    let absolutePath = videoPath;
    if (!path.isAbsolute(videoPath)) {
      absolutePath = path.join(process.cwd(), videoPath);
    }

    // Security check
    const isAllowed = ALLOWED_PATHS.some(allowedPath =>
      absolutePath.startsWith(allowedPath)
    );

    if (!isAllowed) {
      return new NextResponse(null, { status: 403 });
    }

    // Get file stats
    let stats;
    try {
      stats = await fs.stat(absolutePath);
    } catch {
      return new NextResponse(null, { status: 404 });
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const contentType = ext === '.webm' ? 'video/webm' :
                        ext === '.mov' ? 'video/quicktime' :
                        'video/mp4';

    return new NextResponse(null, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(stats.size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error('[API] Error in HEAD request:', error);
    return new NextResponse(null, { status: 500 });
  }
}
