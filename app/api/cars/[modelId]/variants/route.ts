import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/auth-utils';

// POST /api/cars/[modelId]/variants - Add variant (year/trim)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  try {
    const session = await getSession();
    const { modelId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check car model exists and user has access
    const carModel = await prisma.carModel.findUnique({
      where: { id: modelId },
    });

    if (!carModel) {
      return NextResponse.json({ error: 'Car model not found' }, { status: 404 });
    }

    if (carModel.companyId !== session.user.companyId || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { year, trim } = body;

    if (!year || !trim) {
      return NextResponse.json({ error: 'Year and trim are required' }, { status: 400 });
    }

    const variant = await prisma.carVariant.create({
      data: {
        year: parseInt(year),
        trim,
        modelId,
      },
      include: {
        media: true,
      },
    });

    return NextResponse.json({ variant }, { status: 201 });
  } catch (error) {
    console.error('Error creating variant:', error);
    return NextResponse.json({ error: 'Failed to create variant' }, { status: 500 });
  }
}
