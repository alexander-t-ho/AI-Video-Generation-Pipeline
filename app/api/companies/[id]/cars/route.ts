import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/auth-utils';

// GET /api/companies/[id]/cars - List company car models
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

    const carModels = await prisma.carModel.findMany({
      where: { companyId: id },
      include: {
        variants: {
          include: {
            media: true,
            _count: {
              select: {
                media: true,
              },
            },
          },
          orderBy: [{ year: 'desc' }, { trim: 'asc' }],
        },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ carModels });
  } catch (error) {
    console.error('Error fetching car models:', error);
    return NextResponse.json({ error: 'Failed to fetch car models' }, { status: 500 });
  }
}

// POST /api/companies/[id]/cars - Create car model
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

    // Only admins can create car models
    if (session.user.companyId !== id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json({ error: 'Model name is required' }, { status: 400 });
    }

    const carModel = await prisma.carModel.create({
      data: {
        name,
        companyId: id,
      },
      include: {
        variants: true,
      },
    });

    return NextResponse.json({ carModel }, { status: 201 });
  } catch (error) {
    console.error('Error creating car model:', error);
    return NextResponse.json({ error: 'Failed to create car model' }, { status: 500 });
  }
}
