import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import prisma from '@/lib/db/prisma';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ variantId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { variantId } = await params;
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const type = formData.get('type') as string;

    if (!file || !type) {
      return NextResponse.json({ error: 'File and type are required' }, { status: 400 });
    }

    // Verify variant belongs to user's company
    const variant = await prisma.carVariant.findFirst({
      where: {
        id: variantId,
        model: {
          companyId: session.user.companyId,
        },
      },
    });

    if (!variant) {
      return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileExt = file.name.split('.').pop() || 'jpg';
    const s3Key = `companies/${session.user.companyId}/cars/${variantId}/${type.toLowerCase()}/${uuidv4()}.${fileExt}`;

    const s3Client = createS3Client();
    const bucket = process.env.AWS_S3_BUCKET || 'ai-video-pipeline-outputs';

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: buffer,
        ContentType: file.type,
      })
    );

    const media = await prisma.carMedia.create({
      data: {
        type: type as any,
        s3Key,
        filename: file.name,
        mimeType: file.type,
        size: buffer.length,
        variantId,
      },
    });

    return NextResponse.json({
      id: media.id,
      type: media.type,
      filename: media.filename,
      url: `/api/s3-image?key=${encodeURIComponent(s3Key)}`,
    });
  } catch (error) {
    console.error('Error uploading media:', error);
    return NextResponse.json({ error: 'Failed to upload media' }, { status: 500 });
  }
}
