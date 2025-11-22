'use client';

import { SeedFrame } from '@/lib/types';
import { CheckCircle2 } from 'lucide-react';
import { useMemo } from 'react';

interface SeedFrameSelectorProps {
  frames: SeedFrame[];
  selectedFrameIndex?: number;
  onSelectFrame: (frameIndex: number) => void;
  className?: string;
}

// Helper to get serveable URL for a frame
function getFrameUrl(frame: SeedFrame): string {
  // Always serve through API using localPath for consistent access
  if (frame.localPath) {
    return `/api/serve-image?path=${encodeURIComponent(frame.localPath)}`;
  } else if (frame.url.startsWith('/api')) {
    return frame.url;
  } else if (!frame.url.startsWith('http://') && !frame.url.startsWith('https://')) {
    return `/api/serve-image?path=${encodeURIComponent(frame.url)}`;
  } else {
    // For S3 URLs, use localPath if available
    return `/api/serve-image?path=${encodeURIComponent(frame.localPath || frame.url)}`;
  }
}

export default function SeedFrameSelector({
  frames,
  selectedFrameIndex,
  onSelectFrame,
  className = '',
}: SeedFrameSelectorProps) {
  if (!frames || frames.length === 0) {
    return (
      <div className={`text-center text-white/60 ${className}`}>
        <p className="text-sm">No seed frame available</p>
        <p className="text-xs mt-1">Generate a video to extract the last frame</p>
      </div>
    );
  }

  // Only show the first frame (since we now only extract one)
  const frame = frames[0];

  return (
    <div className={className}>
      <h4 className="text-sm font-semibold text-white mb-3">
        Last Frame from Previous Scene
      </h4>
      <div className="w-full max-w-xs">
        <div className="relative aspect-video rounded-lg overflow-hidden border-2 border-white/20">
          <img
            src={getFrameUrl(frame)}
            alt="Last frame from previous scene"
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-2 py-1 text-center">
            Last Frame
          </div>
        </div>
      </div>
      <p className="text-xs text-white/60 mt-2">
        This frame will be used as the seed for the next scene
      </p>
    </div>
  );
}

