/** @type {import('next').NextConfig} */
const nextConfig = {
  // Railway compatibility
  output: 'standalone',
  
  // Skip type checking during build for faster builds
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Skip ESLint during build for faster builds
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

module.exports = nextConfig;

