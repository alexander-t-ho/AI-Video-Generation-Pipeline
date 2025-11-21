import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const company = await prisma.company.findUnique({
      where: { id: session.user.companyId },
      include: {
        assets: {
          where: { type: 'LOGO' },
          select: {
            id: true,
            s3Key: true,
            filename: true,
          },
        },
      },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const logos = company.assets.map((asset) => ({
      id: asset.id,
      s3Key: asset.s3Key,
      filename: asset.filename,
      url: asset.s3Key ? `/api/s3-image?key=${encodeURIComponent(asset.s3Key)}` : '',
    }));

    return NextResponse.json({
      id: company.id,
      name: company.name,
      logos,
    });
  } catch (error) {
    console.error('Error fetching company:', error);
    return NextResponse.json({ error: 'Failed to fetch company' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can update company info
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only admins can update company settings' }, { status: 403 });
    }

    const { name } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    const updatedCompany = await prisma.company.update({
      where: { id: session.user.companyId },
      data: { name },
    });

    return NextResponse.json({
      id: updatedCompany.id,
      name: updatedCompany.name,
    });
  } catch (error) {
    console.error('Error updating company:', error);
    return NextResponse.json({ error: 'Failed to update company' }, { status: 500 });
  }
}
