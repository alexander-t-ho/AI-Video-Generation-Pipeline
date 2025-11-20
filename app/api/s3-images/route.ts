import { NextRequest, NextResponse } from 'next/server';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getS3Url } from '@/lib/storage/s3-uploader';

export const dynamic = 'force-dynamic';

interface S3Image {
  s3Key: string;
  url: string;
  filename: string;
  size: number;
  lastModified: string;
  isProcessed: boolean; // true if it's a background-removed version (-nobg.png)
  originalKey?: string; // If processed, the original image key
}

/**
 * GET /api/s3-images
 * Lists all images from S3 uploads/ prefix, prioritizing processed versions
 * 
 * Query params:
 * - prefix: Optional S3 prefix to filter (default: 'uploads/')
 * - preferProcessed: Prefer background-removed versions (default: true)
 */
export async function GET(request: NextRequest) {
  try {
    // Use AWS_S3_BUCKET (consistent with s3-uploader) or fallback to AWS_S3_BUCKET_NAME
    const bucket = process.env.AWS_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME;
    const region = process.env.AWS_REGION || 'us-east-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!bucket || !accessKeyId || !secretAccessKey) {
      console.error('[S3 Images API] Missing configuration:', {
        bucket: bucket ? 'set' : 'missing',
        accessKeyId: accessKeyId ? 'set' : 'missing',
        secretAccessKey: secretAccessKey ? 'set' : 'missing',
      });
      return NextResponse.json(
        { error: 'S3 not configured. Please check AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY environment variables.' },
        { status: 500 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const prefix = searchParams.get('prefix') || 'uploads/';
    const preferProcessed = searchParams.get('preferProcessed') !== 'false';

    const s3Client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });

    // List all objects with the prefix (handle pagination)
    const allObjects: any[] = [];
    let continuationToken: string | undefined;
    
    do {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      });

      const response = await s3Client.send(command);
      
      if (response.Contents && response.Contents.length > 0) {
        allObjects.push(...response.Contents);
      }
      
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    if (allObjects.length === 0) {
      return NextResponse.json({ images: [], count: 0 });
    }

    // Group images: original and processed versions
    const imageMap = new Map<string, { original?: S3Image; processed?: S3Image }>();

    for (const object of allObjects) {
      if (!object.Key) continue;

      const s3Key = object.Key;
      const filename = s3Key.split('/').pop() || s3Key;
      const isProcessed = filename.includes('-nobg.png') || filename.includes('-nobg.jpg');
      
      // Extract base key (without -nobg suffix) for grouping
      const baseKey = isProcessed 
        ? s3Key.replace(/-nobg\.(png|jpg)$/, '.$1')
        : s3Key;

      if (!imageMap.has(baseKey)) {
        imageMap.set(baseKey, {});
      }

      const image: S3Image = {
        s3Key,
        url: getS3Url(s3Key),
        filename,
        size: object.Size || 0,
        lastModified: object.LastModified?.toISOString() || new Date().toISOString(),
        isProcessed,
        originalKey: isProcessed ? baseKey : undefined,
      };

      const group = imageMap.get(baseKey)!;
      if (isProcessed) {
        group.processed = image;
      } else {
        group.original = image;
      }
    }

    // Convert to array, preferring processed versions
    const images: S3Image[] = [];
    for (const [baseKey, group] of imageMap.entries()) {
      if (preferProcessed && group.processed) {
        images.push(group.processed);
      } else if (group.original) {
        images.push(group.original);
      }
    }

    // Sort by last modified (newest first)
    images.sort((a, b) => 
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    );

    return NextResponse.json({ 
      images,
      count: images.length,
    });
  } catch (error: any) {
    console.error('[S3 Images API] Error:', error);
    console.error('[S3 Images API] Error details:', {
      message: error.message,
      name: error.name,
      code: error.Code || error.code,
      statusCode: error.$metadata?.httpStatusCode,
    });
    return NextResponse.json(
      { 
        error: error.message || 'Failed to list S3 images',
        details: error.Code || error.code || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

