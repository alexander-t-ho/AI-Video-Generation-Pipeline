import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ req, token }) => {
        // Allow access to auth pages
        if (req.nextUrl.pathname.startsWith('/auth/')) {
          return true;
        }

        // Allow access to test routes (flux-test, veo-test, seedance-test, nana-banana-pro-test, faceswap-test)
        if (
          req.nextUrl.pathname.startsWith('/flux-test') ||
          req.nextUrl.pathname.startsWith('/veo-test') ||
          req.nextUrl.pathname.startsWith('/seedance-test') ||
          req.nextUrl.pathname.startsWith('/nana-banana-pro-test') ||
          req.nextUrl.pathname.startsWith('/faceswap-test') ||
          req.nextUrl.pathname.startsWith('/api/flux-test') ||
          req.nextUrl.pathname.startsWith('/api/veo-test') ||
          req.nextUrl.pathname.startsWith('/api/seedance-test') ||
          req.nextUrl.pathname.startsWith('/api/nana-banana-pro-test') ||
          req.nextUrl.pathname.startsWith('/api/faceswap-test')
        ) {
          return true;
        }

        // Require authentication for all other routes
        return !!token;
      },
    },
    pages: {
      signIn: '/auth/signin',
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
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
