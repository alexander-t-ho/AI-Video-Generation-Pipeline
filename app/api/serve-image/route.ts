/**
 * API Route: Serve Image
 * GET /api/serve-image
 *
 * Serves locally stored images by their file path OR proxies remote images
 * Supports optional thumbnail generation via query params
 *
 * Query params:
 * - path: Optional - local file path to serve
 * - url: Optional - remote URL to serve (proxy)
 * - thumb: Optional - thumbnail size ('small', 'medium', 'large')
 * - format: Optional - output format ('jpeg', 'webp', 'png')
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { generateThumbnail, type ThumbnailSize } from '@/lib/storage/thumbnail-service';
import { imageCache } from '@/lib/storage/cache';

// Force dynamic rendering since we use request.url
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Temporary file path for remote images
  let tempFilePath: string | null = null;

  try {
    const { searchParams } = new URL(req.url);
    const filePath = searchParams.get('path');
    const remoteUrl = searchParams.get('url');
    const thumbSize = searchParams.get('thumb') as ThumbnailSize | null;
    const format = searchParams.get('format') as 'jpeg' | 'webp' | 'png' | null;

    if (!filePath && !remoteUrl) {
      return NextResponse.json(
        { error: 'Missing path or url parameter' },
        { status: 400 }
      );
    }

    // Create cache key
    const cacheKey = `${filePath || remoteUrl}-${thumbSize || 'full'}-${format || 'original'}`;

    // CHECK CACHE FIRST (for non-remote or already-processed)
    if (filePath && !thumbSize) { // Only cache simple local file requests
      const cached = imageCache.get(cacheKey);
      if (cached) {
        return new NextResponse(Buffer.from(cached.buffer), {
          status: 200,
          headers: {
            'Content-Type': cached.contentType,
            'Cache-Control': 'public, max-age=31536000',
            'X-Cache': 'HIT',
          },
        });
      }
    }

    let sourcePath: string;
    let isRemote = false;

    // CASE 1: Remote URL (Proxy)
    if (remoteUrl) {
      isRemote = true;
      
      // Validate URL
      try {
        new URL(remoteUrl);
      } catch {
        return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
      }

      // Fetch remote image
      const response = await fetch(remoteUrl);
      if (!response.ok) {
        return NextResponse.json(
          { error: `Failed to fetch remote image: ${response.statusText}` },
          { status: response.status }
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // If no thumbnail requested, return the image directly
      if (!thumbSize) {
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000',
          },
        });
      }

      // If thumbnail requested, save to temp file for processing
      const tempDir = '/tmp/temp-downloads';
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Try to guess extension from content-type
      const contentType = response.headers.get('content-type');
      let ext = '.jpg';
      if (contentType === 'image/png') ext = '.png';
      else if (contentType === 'image/webp') ext = '.webp';
      else if (contentType === 'image/gif') ext = '.gif';
      
      tempFilePath = path.join(tempDir, `${uuidv4()}${ext}`);
      fs.writeFileSync(tempFilePath, buffer);
      sourcePath = tempFilePath;
    } 
    // CASE 2: Local File Path
    else {
      sourcePath = filePath!;
      
      // Security check: ensure path is within allowed directories
      const allowedPaths = ['/tmp/projects', '/tmp/thumbnails', path.join(process.cwd(), 'generated')];
      const isAllowedPath = allowedPaths.some(allowedPath =>
        sourcePath.startsWith(allowedPath)
      );

      if (!isAllowedPath) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }

      // Check if file exists
      if (!fs.existsSync(sourcePath)) {
        return NextResponse.json(
          { error: 'File not found' },
          { status: 404 }
        );
      }
    }

    // Generate/serve thumbnail
    if (thumbSize) {
      try {
        // Use a consistent project ID for caching remote thumbnails if possible
        // For remote URLs, we use a hash of the URL as the project ID for caching
        let projectId: string | undefined;
        
        if (isRemote && remoteUrl) {
            // Use 'remote-cache' as project ID to group remote thumbnails
            projectId = 'remote-cache';
        } else {
            // Extract projectId from path if possible
            const projectMatch = sourcePath.match(/\/projects\/([^/]+)\//);
            projectId = projectMatch ? projectMatch[1] : undefined;
        }

        const thumbnail = await generateThumbnail(sourcePath, projectId, {
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
        // (Only for local files - for remote we already handled non-thumb case)
        if (isRemote) {
           return NextResponse.json({ error: 'Thumbnail generation failed' }, { status: 500 });
        }
      }
    }

    // If we get here, it's a local file request without thumbnail (remote handled above)
    const fileBuffer = fs.readFileSync(sourcePath);

    // Determine content type from file extension
    const ext = path.extname(sourcePath).toLowerCase();
    const contentTypeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    };
    const contentType = contentTypeMap[ext] || 'application/octet-stream';

    // CACHE IT
    if (filePath && !thumbSize) {
      imageCache.set(cacheKey, fileBuffer, contentType);
    }

    // Return image
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000',
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    console.error('[API:ServeImage] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  } finally {
    // Cleanup temp file if it exists
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        console.error('[API:ServeImage] Failed to cleanup temp file:', cleanupError);
      }
    }
  }
}
