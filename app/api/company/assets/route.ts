import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import prisma from '@/lib/db/prisma';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { convertWebpIfNeeded } from '@/lib/utils/image-converter';

export const dynamic = 'force-dynamic';

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

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const assets = await prisma.companyAsset.findMany({
      where: {
        companyId: session.user.companyId,
        type: 'OTHER',
      },
      orderBy: { createdAt: 'desc' },
    });

    const assetsWithUrls = assets.map((asset) => ({
      id: asset.id,
      type: asset.type,
      filename: asset.filename,
      url: asset.s3Key ? `/api/s3-image?key=${encodeURIComponent(asset.s3Key)}` : '',
      createdAt: asset.createdAt,
    }));

    return NextResponse.json({ assets: assetsWithUrls });
  } catch (error) {
    console.error('Error fetching assets:', error);
    return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 });
    }

    const originalBuffer = Buffer.from(await file.arrayBuffer());
    
    // Convert webp to PNG if needed
    const converted = await convertWebpIfNeeded(originalBuffer, file.type, file.name);
    
    const s3Key = `companies/${session.user.companyId}/assets/${uuidv4()}.${converted.extension}`;

    const s3Client = createS3Client();
    const bucket = process.env.AWS_S3_BUCKET || 'ai-video-pipeline-outputs';

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: converted.buffer,
        ContentType: converted.mimeType,
      })
    );

    const asset = await prisma.companyAsset.create({
      data: {
        type: 'OTHER',
        s3Key,
        filename: converted.filename,
        mimeType: converted.mimeType,
        size: converted.buffer.length,
        companyId: session.user.companyId,
      },
    });

    return NextResponse.json({
      id: asset.id,
      type: asset.type,
      filename: asset.filename,
      url: `/api/s3-image?key=${encodeURIComponent(s3Key)}`,
      createdAt: asset.createdAt,
    });
  } catch (error) {
    console.error('Error uploading asset:', error);
    return NextResponse.json({ error: 'Failed to upload asset' }, { status: 500 });
  }
}
