import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

/**
 * GET /api/serve-image
 * Serves local image files
 * 
 * Query Parameters:
 * - path: string - Local file path to the image
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const imagePath = searchParams.get('path');

    if (!imagePath) {
      return NextResponse.json(
        { error: 'path parameter is required' },
        { status: 400 }
      );
    }

    // Convert to absolute path
    let absolutePath = imagePath;
    if (!path.isAbsolute(imagePath)) {
      absolutePath = path.join(process.cwd(), imagePath);
    }

    // Check if file exists
    try {
      await fs.access(absolutePath);
    } catch {
      return NextResponse.json(
        { error: 'Image not found' },
        { status: 404 }
      );
    }

    // Read file
    const fileBuffer = await fs.readFile(absolutePath);
    const ext = path.extname(absolutePath).toLowerCase();
    
    // Determine content type
    const contentType = 
      ext === '.png' ? 'image/png' :
      ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
      ext === '.gif' ? 'image/gif' :
      ext === '.webp' ? 'image/webp' :
      'image/png';

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error('[API] Error serving image:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to serve image' },
      { status: 500 }
    );
  }
}

