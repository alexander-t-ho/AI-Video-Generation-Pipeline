import { NextResponse } from 'next/server';

// NextAuth disabled - all routes are public
export default function middleware(req: any) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - api routes that should be public (test routes)
     */
    '/((?!_next/static|_next/image|favicon.ico|public|api/test-).*)',
  ],
};
