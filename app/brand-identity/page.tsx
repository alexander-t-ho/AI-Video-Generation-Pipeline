'use client';

import { Suspense } from 'react';
import BrandIdentityScreen from '@/components/BrandIdentityScreen';

export default function BrandIdentityPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col cinematic-gradient relative overflow-hidden">
        <div className="fixed top-6 left-6 z-40">
          <h1 className="text-2xl font-light text-white tracking-tighter select-none whitespace-nowrap leading-none">
            Scen3
          </h1>
        </div>
        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 mt-20 mb-6 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-white/60">Loading brand identity...</p>
          </div>
        </div>
      </div>
    }>
      <BrandIdentityScreen />
    </Suspense>
  );
}





