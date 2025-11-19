import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/auth-utils';

// GET /api/companies - List all companies (admin only, or just user's company)
export async function GET() {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Return only user's company
    const company = await prisma.company.findUnique({
      where: { id: session.user.companyId },
      include: {
        _count: {
          select: {
            users: true,
            projects: true,
            carModels: true,
          },
        },
      },
    });

    return NextResponse.json({ company });
  } catch (error) {
    console.error('Error fetching companies:', error);
    return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 });
  }
}

// POST /api/companies - Create a new company (for signup flow, handled there)
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();

    // Only allow if not logged in (signup flow) or if admin creating another company
    if (session?.user?.id && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    const company = await prisma.company.create({
      data: { name },
    });

    return NextResponse.json({ company }, { status: 201 });
  } catch (error) {
    console.error('Error creating company:', error);
    return NextResponse.json({ error: 'Failed to create company' }, { status: 500 });
  }
}
