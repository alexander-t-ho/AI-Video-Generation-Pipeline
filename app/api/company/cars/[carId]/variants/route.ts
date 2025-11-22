import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ carId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { carId } = await params;
    const { year, trim } = await request.json();

    if (!year || !trim) {
      return NextResponse.json({ error: 'Year and trim are required' }, { status: 400 });
    }

    // Verify the car belongs to the user's company
    const car = await prisma.carModel.findFirst({
      where: {
        id: carId,
        companyId: session.user.companyId,
      },
    });

    if (!car) {
      return NextResponse.json({ error: 'Car not found' }, { status: 404 });
    }

    const variant = await prisma.carVariant.create({
      data: {
        year,
        trim,
        modelId: carId,
      },
    });

    return NextResponse.json({
      id: variant.id,
      year: variant.year,
      trim: variant.trim,
      media: [],
    });
  } catch (error) {
    console.error('Error creating variant:', error);
    return NextResponse.json({ error: 'Failed to create variant' }, { status: 500 });
  }
}
