/**
 * API Route: Cache Statistics
 * GET /api/cache-stats
 *
 * Returns statistics about the in-memory caches for videos and images
 * Useful for monitoring and debugging performance
 */

import { NextResponse } from 'next/server';
import { videoCache, imageCache } from '@/lib/storage/cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const stats = {
      timestamp: new Date().toISOString(),
      video: videoCache.getStats(),
      image: imageCache.getStats(),
      combined: {
        totalEntries: videoCache.getStats().entries + imageCache.getStats().entries,
        totalSizeMB: (
          parseFloat(videoCache.getStats().sizeMB) +
          parseFloat(imageCache.getStats().sizeMB)
        ).toFixed(2),
      },
    };

    return NextResponse.json(stats, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[API:CacheStats] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

