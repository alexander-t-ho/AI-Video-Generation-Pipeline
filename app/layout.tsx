import type { Metadata } from 'next';
import '@/app/globals.css';
import ErrorHandler from '@/components/ErrorHandler';

export const metadata: Metadata = {
  title: 'AI Video Generation Pipeline',
  description: 'Transform your ideas into professional video advertisements',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <ErrorHandler />
        {children}
      </body>
    </html>
  );
}
