import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AI Video Generator',
  description: 'AI-powered video generation pipeline',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
