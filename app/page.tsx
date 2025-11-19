'use client';

import { Suspense } from 'react';
import StartingScreen from '@/components/StartingScreen';

export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <StartingScreen onCreateProject={async (prompt: string, images?: File[], targetDuration?: number) => {}} />
    </Suspense>
  );
}
