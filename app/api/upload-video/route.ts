import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { getStorageService } from '@/lib/storage/storage-service';
import { getVideoDuration } from '@/lib/video/editor';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('video') as File;
    const projectId = formData.get('projectId') as string;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No video file provided' },
        { status: 400 }
      );
    }

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID is required' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: `Unsupported video type: ${file.type}` },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_VIDEO_SIZE) {
      return NextResponse.json(
        { success: false, error: `Video too large. Maximum size is ${MAX_VIDEO_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Store video using storage service
    const storage = getStorageService();
    const storedFile = await storage.storeFile(
      buffer,
      {
        projectId,
        category: 'uploads',
        mimeType: file.type,
      },
      {
        keepLocal: true, // Keep local for FFmpeg operations
        filename: `${uuidv4()}${path.extname(file.name)}`,
      }
    );

    // Get video duration
    const duration = await getVideoDuration(storedFile.localPath);

    // Generate thumbnail (optional, for MediaDrawer display)
    const thumbnailPath = storedFile.localPath.replace(/\.[^.]+$/, '_thumb.jpg');
    const thumbnailCommand = `ffmpeg -i "${storedFile.localPath}" -ss 0 -vframes 1 -vf "scale=320:-1" -y "${thumbnailPath}"`;

    try {
      await execAsync(thumbnailCommand);
    } catch (error) {
      console.warn('[VideoUpload] Failed to generate thumbnail:', error);
    }

    return NextResponse.json({
      success: true,
      video: {
        id: uuidv4(),
        url: storedFile.url,
        localPath: storedFile.localPath,
        s3Key: storedFile.s3Key,
        duration,
        originalName: file.name,
        fileSize: file.size,
        thumbnailUrl: thumbnailPath ? `/api/serve-image?path=${encodeURIComponent(thumbnailPath)}` : undefined,
      },
    });
  } catch (error: any) {
    console.error('[VideoUpload] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Video upload failed' },
      { status: 500 }
    );
  }
}
