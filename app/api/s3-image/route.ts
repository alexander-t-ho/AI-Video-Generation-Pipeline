import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

const THUMBNAIL_CACHE_DIR = '/tmp/s3-thumbnails';
const THUMBNAIL_SIZES = {
  small: { width: 150, height: 150 },
  medium: { width: 300, height: 300 },
  large: { width: 600, height: 600 },
};

function createS3Client(): S3Client {
  const region = process.env.AWS_REGION || 'us-east-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS credentials not found');
  }

  return new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(THUMBNAIL_CACHE_DIR, { recursive: true });
}

function getCachePath(s3Key: string, thumbSize?: string): string {
  const hash = crypto.createHash('md5').update(s3Key).digest('hex');
  const size = thumbSize || 'original';
  return path.join(THUMBNAIL_CACHE_DIR, `${hash}-${size}.jpg`);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const s3Key = searchParams.get('key');
    const thumbSize = searchParams.get('thumb') as 'small' | 'medium' | 'large' | null;

    if (!s3Key) {
      return NextResponse.json({ error: 'S3 key is required' }, { status: 400 });
    }

    await ensureCacheDir();

    // Check cache first
    const cachePath = getCachePath(s3Key, thumbSize || undefined);
    try {
      const cachedBuffer = await fs.readFile(cachePath);
      return new NextResponse(cachedBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Cache': 'HIT',
        },
      });
    } catch {
      // Cache miss, continue to fetch from S3
    }

    const s3Client = createS3Client();
    const bucket = process.env.AWS_S3_BUCKET || 'ai-video-pipeline-outputs';

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    let processedBuffer: Buffer = buffer as Buffer;
    let contentType = response.ContentType || 'application/octet-stream';

    // Generate thumbnail if requested
    if (thumbSize && THUMBNAIL_SIZES[thumbSize]) {
      const { width, height } = THUMBNAIL_SIZES[thumbSize];
      processedBuffer = (await sharp(buffer)
        .resize(width, height, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 80 })
        .toBuffer()) as Buffer;
      contentType = 'image/jpeg';
    }

    // Save to cache
    await fs.writeFile(cachePath, processedBuffer);

    return new NextResponse(Buffer.from(processedBuffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    console.error('Error serving S3 image:', error);
    return NextResponse.json({ error: 'Failed to serve image' }, { status: 500 });
  }
}
