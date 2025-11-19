import type { Metadata } from 'next';
import '@/app/globals.css';
import ErrorHandler from '@/components/ErrorHandler';
import { AuthProvider } from '@/lib/auth/auth-context';

export const metadata: Metadata = {
  title: 'Scene3 | Share Your Vision',
  description: 'Five steps to a cinematic, performance-ready car advertisement. Transform your vision into reality with AI-powered video generation.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <AuthProvider>
          <ErrorHandler />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
