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
        <p className="text-sm">No seed frames available</p>
        <p className="text-xs mt-1">Generate a video to extract seed frames</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <h4 className="text-sm font-semibold text-white mb-3">
        Select Seed Frame for Next Scene
      </h4>
      <div className="grid grid-cols-5 gap-2">
        {frames.map((frame, index) => (
          <button
            key={frame.id}
            onClick={() => onSelectFrame(index)}
            className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all duration-200 ${
              selectedFrameIndex === index
                ? 'border-white/40 ring-2 ring-white/20'
                : 'border-white/20 hover:border-white/30'
            }`}
          >
            <img
              src={getFrameUrl(frame)}
              alt={`Seed frame at ${frame.timestamp}s`}
              className="w-full h-full object-cover"
            />
            {selectedFrameIndex === index && (
              <div className="absolute inset-0 bg-white/10 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-white" />
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-1 py-0.5 text-center">
              {frame.timestamp.toFixed(1)}s
            </div>
          </button>
        ))}
      </div>
      <p className="text-xs text-white/60 mt-2">
        Click a frame to use it as the seed for the next scene
      </p>
    </div>
  );
}

