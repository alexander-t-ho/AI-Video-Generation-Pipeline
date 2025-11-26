import { NextRequest, NextResponse } from 'next/server';
import { convertToPublicUrl } from '@/lib/utils/url-converter';

// Route segment config for Next.js 14 App Router
export const maxDuration = 60; // Maximum execution time in seconds
export const dynamic = 'force-dynamic'; // Always run dynamically

/**
 * POST /api/convert-url
 *
 * Converts a local file path or URL to a publicly accessible format
 * for use with external APIs like Replicate
 *
 * Request Body:
 * {
 *   url: string;
 *   projectId: string;
 * }
 *
 * Response:
 * {
 *   success: boolean;
 *   publicUrl?: string;
 *   error?: string;
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { url, projectId } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'url is required and must be a string' },
        { status: 400 }
      );
    }

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'projectId is required and must be a string' },
        { status: 400 }
      );
    }

    console.log(`[Convert URL API] Converting: ${url.substring(0, 100)}...`);

    // Convert the URL using the server-side utility
    const publicUrl = await convertToPublicUrl(url, projectId);

    const duration = Date.now() - startTime;
    const sizeKB = publicUrl.length / 1024;
    console.log(`[Convert URL API] Converted in ${duration}ms, size: ${sizeKB.toFixed(2)}KB`);

    return NextResponse.json({
      success: true,
      publicUrl,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[Convert URL API] Error after ${duration}ms:`, error.message);
    console.error('[Convert URL API] Stack:', error.stack);

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'URL conversion failed',
      },
      { status: 500 }
    );
  }
}
