import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    // Add custom logic here if needed
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;

        // Public routes that don't require authentication
        const publicRoutes = [
          '/auth/signin',
          '/auth/signup',
          '/auth/error',
          '/api/auth',
          '/api/health',
        ];

        // Check if the current path starts with any public route
        const isPublicRoute = publicRoutes.some(
          (route) => pathname.startsWith(route)
        );

        // Allow public routes without token
        if (isPublicRoute) {
          return true;
        }

        // For protected routes, require token
        return !!token;
      },
    },
    pages: {
      signIn: '/auth/signin',
      error: '/auth/error',
    },
  }
);

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
