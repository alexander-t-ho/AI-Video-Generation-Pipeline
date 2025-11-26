import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/auth-utils';
import { uploadBufferToS3 } from '@/lib/storage/s3-uploader';
import { convertWebpIfNeeded } from '@/lib/utils/image-converter';

// GET /api/cars/variants/[variantId]/media - List variant media
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ variantId: string }> }
) {
  try {
    const session = await getSession();
    const { variantId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const variant = await prisma.carVariant.findUnique({
      where: { id: variantId },
      include: { model: true },
    });

    if (!variant) {
      return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
    }

    if (variant.model.companyId !== session.user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');

    const media = await prisma.carMedia.findMany({
      where: {
        variantId,
        ...(type && { type: type as 'EXTERIOR' | 'INTERIOR' | 'SOUND' | 'THREE_D_MODEL' }),
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ media });
  } catch (error) {
    console.error('Error fetching media:', error);
    return NextResponse.json({ error: 'Failed to fetch media' }, { status: 500 });
  }
}

// POST /api/cars/variants/[variantId]/media - Upload media
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ variantId: string }> }
) {
  try {
    const session = await getSession();
    const { variantId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const variant = await prisma.carVariant.findUnique({
      where: { id: variantId },
      include: { model: true },
    });

    if (!variant) {
      return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
    }

    if (variant.model.companyId !== session.user.companyId || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string;

    if (!file || !type) {
      return NextResponse.json({ error: 'File and type are required' }, { status: 400 });
    }

    // Validate media type
    const validTypes = ['EXTERIOR', 'INTERIOR', 'SOUND', 'THREE_D_MODEL'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: 'Invalid media type' }, { status: 400 });
    }

    // Upload to S3
    const originalBuffer = Buffer.from(await file.arrayBuffer());
    
    // Convert webp to PNG if needed
    const converted = await convertWebpIfNeeded(originalBuffer, file.type, file.name);
    
    const typeFolder = type.toLowerCase().replace('_', '-');
    const s3Key = `companies/${variant.model.companyId}/cars/${variant.modelId}/${variantId}/${typeFolder}/${Date.now()}-${converted.filename}`;

    await uploadBufferToS3(converted.buffer, s3Key, converted.mimeType);

    const media = await prisma.carMedia.create({
      data: {
        type: type as 'EXTERIOR' | 'INTERIOR' | 'SOUND' | 'THREE_D_MODEL',
        s3Key,
        filename: converted.filename,
        mimeType: converted.mimeType,
        size: converted.buffer.length,
        variantId,
      },
    });

    return NextResponse.json({ media }, { status: 201 });
  } catch (error) {
    console.error('Error uploading media:', error);
    return NextResponse.json({ error: 'Failed to upload media' }, { status: 500 });
  }
}
