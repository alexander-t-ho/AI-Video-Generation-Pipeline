import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/auth-utils';

// GET /api/cars/variants/[variantId] - Get variant with media
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
      include: {
        model: true,
        media: true,
      },
    });

    if (!variant) {
      return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
    }

    if (variant.model.companyId !== session.user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ variant });
  } catch (error) {
    console.error('Error fetching variant:', error);
    return NextResponse.json({ error: 'Failed to fetch variant' }, { status: 500 });
  }
}

// PATCH /api/cars/variants/[variantId] - Update variant
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ variantId: string }> }
) {
  try {
    const session = await getSession();
    const { variantId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const existingVariant = await prisma.carVariant.findUnique({
      where: { id: variantId },
      include: { model: true },
    });

    if (!existingVariant) {
      return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
    }

    if (existingVariant.model.companyId !== session.user.companyId || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { year, trim } = body;

    const variant = await prisma.carVariant.update({
      where: { id: variantId },
      data: {
        ...(year && { year: parseInt(year) }),
        ...(trim && { trim }),
      },
      include: {
        media: true,
      },
    });

    return NextResponse.json({ variant });
  } catch (error) {
    console.error('Error updating variant:', error);
    return NextResponse.json({ error: 'Failed to update variant' }, { status: 500 });
  }
}

// DELETE /api/cars/variants/[variantId] - Delete variant
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ variantId: string }> }
) {
  try {
    const session = await getSession();
    const { variantId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const existingVariant = await prisma.carVariant.findUnique({
      where: { id: variantId },
      include: { model: true },
    });

    if (!existingVariant) {
      return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
    }

    if (existingVariant.model.companyId !== session.user.companyId || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.carVariant.delete({
      where: { id: variantId },
    });

    return NextResponse.json({ message: 'Variant deleted successfully' });
  } catch (error) {
    console.error('Error deleting variant:', error);
    return NextResponse.json({ error: 'Failed to delete variant' }, { status: 500 });
  }
}
