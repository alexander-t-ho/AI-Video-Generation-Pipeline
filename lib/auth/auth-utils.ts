import { getServerSession } from 'next-auth';
import { authOptions } from './auth-options';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';

// NextAuth disabled - return mock session
export async function getSession() {
  // Return a mock session so API routes don't break
  return {
    user: {
      id: 'mock-user-id',
      email: 'mock@example.com',
      name: 'Mock User',
      companyId: 'mock-company-id',
      companyName: 'Mock Company',
      role: 'ADMIN',
    },
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function getCurrentUser() {
  const session = await getSession();

  if (!session?.user?.id) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { company: true },
  });

  return user;
}

export async function requireAuth() {
  const session = await getSession();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  return session;
}

export async function requireAdmin() {
  const session = await requireAuth();

  if (session.user.role !== 'ADMIN') {
    throw new Error('Forbidden: Admin access required');
  }

  return session;
}

// Middleware helper for API routes
export function withAuth(
  handler: (req: NextRequest, context: { session: Awaited<ReturnType<typeof getSession>> }) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return handler(req, { session });
  };
}

export function withAdmin(
  handler: (req: NextRequest, context: { session: Awaited<ReturnType<typeof getSession>> }) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    return handler(req, { session });
  };
}

// Check if user belongs to company
// NextAuth disabled - always return true
export async function checkCompanyAccess(userId: string, companyId: string): Promise<boolean> {
  return true; // Always allow access when auth is disabled
}

// Check if user owns project or is in same company
// NextAuth disabled - always return true
export async function checkProjectAccess(userId: string, projectId: string): Promise<boolean> {
  return true; // Always allow access when auth is disabled
}
