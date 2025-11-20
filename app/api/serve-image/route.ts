/**
 * API Route: Serve Image
 * GET /api/serve-image
 *
 * Serves locally stored images by their file path
 * Supports optional thumbnail generation via query params
 *
 * Query params:
 * - path: Required - local file path to serve
 * - thumb: Optional - thumbnail size ('small', 'medium', 'large')
 * - format: Optional - output format ('jpeg', 'webp', 'png')
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { generateThumbnail, type ThumbnailSize } from '@/lib/storage/thumbnail-service';

// Force dynamic rendering since we use request.url
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const filePath = searchParams.get('path');
    const thumbSize = searchParams.get('thumb') as ThumbnailSize | null;
    const format = searchParams.get('format') as 'jpeg' | 'webp' | 'png' | null;

    if (!filePath) {
      return NextResponse.json(
        { error: 'Missing path parameter' },
        { status: 400 }
      );
    }

    // Security check: ensure path is within allowed directories
    const allowedPaths = ['/tmp/projects', '/tmp/thumbnails', path.join(process.cwd(), 'generated')];
    const isAllowedPath = allowedPaths.some(allowedPath =>
      filePath.startsWith(allowedPath)
    );

    if (!isAllowedPath) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // If thumbnail requested, generate/serve cached thumbnail
    if (thumbSize) {
      try {
        // Extract projectId from path if possible
        const projectMatch = filePath.match(/\/projects\/([^/]+)\//);
        const projectId = projectMatch ? projectMatch[1] : undefined;

        const thumbnail = await generateThumbnail(filePath, projectId, {
          size: thumbSize,
          format: format || 'jpeg',
        });

        const thumbBuffer = fs.readFileSync(thumbnail.path);
        const thumbContentType = thumbnail.format === 'jpeg'
          ? 'image/jpeg'
          : thumbnail.format === 'webp'
            ? 'image/webp'
            : 'image/png';

        return new NextResponse(thumbBuffer, {
          status: 200,
          headers: {
            'Content-Type': thumbContentType,
            'Cache-Control': 'public, max-age=31536000',
            'X-Thumbnail-Cached': thumbnail.cached ? 'true' : 'false',
          },
        });
      } catch (thumbError) {
        console.error('[API:ServeImage] Thumbnail generation failed:', thumbError);
        // Fall through to serve original if thumbnail fails
      }
    }

    // Read original file
    const fileBuffer = fs.readFileSync(filePath);

    // Determine content type from file extension
    const ext = path.extname(filePath).toLowerCase();
    const contentTypeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    };
    const contentType = contentTypeMap[ext] || 'application/octet-stream';

    // Return image
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error) {
    console.error('[API:ServeImage] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
