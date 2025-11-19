import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/auth-utils';

// GET /api/cars/[modelId] - Get car model with variants
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  try {
    const session = await getSession();
    const { modelId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const carModel = await prisma.carModel.findUnique({
      where: { id: modelId },
      include: {
        variants: {
          include: {
            media: true,
          },
          orderBy: [{ year: 'desc' }, { trim: 'asc' }],
        },
      },
    });

    if (!carModel) {
      return NextResponse.json({ error: 'Car model not found' }, { status: 404 });
    }

    // Check company access
    if (carModel.companyId !== session.user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ carModel });
  } catch (error) {
    console.error('Error fetching car model:', error);
    return NextResponse.json({ error: 'Failed to fetch car model' }, { status: 500 });
  }
}

// PATCH /api/cars/[modelId] - Update car model
export async function PATCH(
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
    const existingModel = await prisma.carModel.findUnique({
      where: { id: modelId },
    });

    if (!existingModel) {
      return NextResponse.json({ error: 'Car model not found' }, { status: 404 });
    }

    if (existingModel.companyId !== session.user.companyId || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { name } = body;

    const carModel = await prisma.carModel.update({
      where: { id: modelId },
      data: { name },
      include: {
        variants: true,
      },
    });

    return NextResponse.json({ carModel });
  } catch (error) {
    console.error('Error updating car model:', error);
    return NextResponse.json({ error: 'Failed to update car model' }, { status: 500 });
  }
}

// DELETE /api/cars/[modelId] - Delete car model
export async function DELETE(
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
    const existingModel = await prisma.carModel.findUnique({
      where: { id: modelId },
    });

    if (!existingModel) {
      return NextResponse.json({ error: 'Car model not found' }, { status: 404 });
    }

    if (existingModel.companyId !== session.user.companyId || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.carModel.delete({
      where: { id: modelId },
    });

    return NextResponse.json({ message: 'Car model deleted successfully' });
  } catch (error) {
    console.error('Error deleting car model:', error);
    return NextResponse.json({ error: 'Failed to delete car model' }, { status: 500 });
  }
}
