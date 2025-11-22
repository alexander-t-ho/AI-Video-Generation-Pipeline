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

    const cars = await prisma.carModel.findMany({
      where: { companyId: session.user.companyId },
      include: {
        variants: {
          include: {
            media: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const carsWithUrls = cars.map((car) => ({
      id: car.id,
      name: car.name,
      variants: car.variants.map((variant) => ({
        id: variant.id,
        year: variant.year,
        trim: variant.trim,
        media: variant.media.map((m) => ({
          id: m.id,
          type: m.type,
          filename: m.filename,
          url: `/api/s3-image?key=${encodeURIComponent(m.s3Key)}`,
        })),
      })),
    }));

    return NextResponse.json({ cars: carsWithUrls });
  } catch (error) {
    console.error('Error fetching cars:', error);
    return NextResponse.json({ error: 'Failed to fetch cars' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Car name is required' }, { status: 400 });
    }

    const car = await prisma.carModel.create({
      data: {
        name,
        companyId: session.user.companyId,
      },
      include: {
        variants: true,
      },
    });

    return NextResponse.json({
      id: car.id,
      name: car.name,
      variants: [],
    });
  } catch (error) {
    console.error('Error creating car:', error);
    return NextResponse.json({ error: 'Failed to create car' }, { status: 500 });
  }
}
