import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import prisma from '@/lib/db/prisma';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { assetId } = await params;

    const asset = await prisma.companyAsset.findFirst({
      where: {
        id: assetId,
        companyId: session.user.companyId,
      },
    });

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    // Delete from S3
    if (asset.s3Key) {
      const s3Client = createS3Client();
      const bucket = process.env.AWS_S3_BUCKET || 'ai-video-pipeline-outputs';

      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: asset.s3Key,
          })
        );
      } catch (s3Error) {
        console.error('Error deleting from S3:', s3Error);
      }
    }

    await prisma.companyAsset.delete({
      where: { id: assetId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting asset:', error);
    return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 });
  }
}
