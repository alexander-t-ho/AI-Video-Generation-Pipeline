import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/auth-utils';
import { uploadBufferToS3 } from '@/lib/storage/s3-uploader';

// GET /api/companies/[id]/assets - List company assets
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const { id } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.companyId !== id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');

    const assets = await prisma.companyAsset.findMany({
      where: {
        companyId: id,
        ...(type && { type: type as 'LOGO' | 'COLOR_SCHEME' | 'BADGE' | 'OTHER' }),
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ assets });
  } catch (error) {
    console.error('Error fetching assets:', error);
    return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 });
  }
}

// POST /api/companies/[id]/assets - Upload company asset
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const { id } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can upload assets
    if (session.user.companyId !== id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const type = formData.get('type') as string;
    const value = formData.get('value') as string | null;

    if (!type) {
      return NextResponse.json({ error: 'Asset type is required' }, { status: 400 });
    }

    // Build asset data
    const assetCreateData: {
      companyId: string;
      type: 'LOGO' | 'COLOR_SCHEME' | 'BADGE' | 'OTHER';
      s3Key?: string;
      filename?: string;
      mimeType?: string;
      size?: number;
      value?: any;
    } = {
      companyId: id,
      type: type as 'LOGO' | 'COLOR_SCHEME' | 'BADGE' | 'OTHER',
    };

    if (file) {
      // Upload file to S3
      const buffer = Buffer.from(await file.arrayBuffer());
      const s3Key = `companies/${id}/assets/${type.toLowerCase()}s/${Date.now()}-${file.name}`;

      await uploadBufferToS3(buffer, s3Key, file.type);

      assetCreateData.s3Key = s3Key;
      assetCreateData.filename = file.name;
      assetCreateData.mimeType = file.type;
      assetCreateData.size = file.size;
    }

    if (value) {
      // For JSON data like color schemes
      assetCreateData.value = JSON.parse(value);
    }

    const asset = await prisma.companyAsset.create({
      data: assetCreateData,
    });

    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    console.error('Error uploading asset:', error);
    return NextResponse.json({ error: 'Failed to upload asset' }, { status: 500 });
  }
}

// DELETE /api/companies/[id]/assets?assetId=xxx - Delete asset
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const { id } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can delete assets
    if (session.user.companyId !== id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const assetId = searchParams.get('assetId');

    if (!assetId) {
      return NextResponse.json({ error: 'Asset ID is required' }, { status: 400 });
    }

    await prisma.companyAsset.delete({
      where: {
        id: assetId,
        companyId: id,
      },
    });

    return NextResponse.json({ message: 'Asset deleted successfully' });
  } catch (error) {
    console.error('Error deleting asset:', error);
    return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 });
  }
}
