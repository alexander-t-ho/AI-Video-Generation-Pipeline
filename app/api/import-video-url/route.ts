import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getStorageService } from '@/lib/storage/storage-service';
import { getVideoDuration } from '@/lib/video/editor';

export async function POST(request: NextRequest) {
  try {
    const { url, projectId } = await request.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Video URL is required' },
        { status: 400 }
      );
    }

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Project ID is required' },
        { status: 400 }
      );
    }

    // Validate URL format
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return NextResponse.json(
        { success: false, error: 'URL must be HTTP or HTTPS' },
        { status: 400 }
      );
    }

    // Download and store video
    const storage = getStorageService();
    const videoId = uuidv4();

    const storedFile = await storage.storeFromUrl(
      url,
      {
        projectId,
        category: 'uploads',
        mimeType: 'video/mp4',
        customFilename: `${videoId}.mp4`,
      },
      {
        keepLocal: true,
        retries: 3,
      }
    );

    // Get video duration
    const duration = await getVideoDuration(storedFile.localPath);

    return NextResponse.json({
      success: true,
      video: {
        id: videoId,
        url: storedFile.url,
        localPath: storedFile.localPath,
        s3Key: storedFile.s3Key,
        duration,
        originalUrl: url,
      },
    });
  } catch (error: any) {
    console.error('[VideoImport] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Video import failed' },
      { status: 500 }
    );
  }
}
