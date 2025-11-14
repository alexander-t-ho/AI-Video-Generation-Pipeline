'use client';

import StartingScreen from '@/components/StartingScreen';
import '@/app/globals.css';

export default function Home() {
  return <StartingScreen onCreateProject={async () => {}} />;
}
