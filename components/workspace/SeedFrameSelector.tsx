'use client';

import { SeedFrame } from '@/lib/types';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

interface SeedFrameSelectorProps {
  frames: SeedFrame[];
  selectedFrameIndex?: number;
  onSelectFrame: (frameIndex: number) => void;
  className?: string;
}

export default function SeedFrameSelector({
  frames,
  selectedFrameIndex,
  onSelectFrame,
  className = '',
}: SeedFrameSelectorProps) {
  if (!frames || frames.length === 0) {
    return (
      <div className={`text-center text-gray-500 dark:text-gray-400 ${className}`}>
        <p className="text-sm">No seed frames available</p>
        <p className="text-xs mt-1">Generate a video to extract seed frames</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
        Select Seed Frame for Next Scene
      </h4>
      <div className="grid grid-cols-5 gap-2">
        {frames.map((frame, index) => (
          <button
            key={frame.id}
            onClick={() => onSelectFrame(index)}
            className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all duration-200 ${
              selectedFrameIndex === index
                ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-200 dark:ring-blue-800'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <img
              src={frame.url}
              alt={`Seed frame at ${frame.timestamp}s`}
              className="w-full h-full object-cover"
            />
            {selectedFrameIndex === index && (
              <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-blue-500 dark:text-blue-400" />
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-1 py-0.5 text-center">
              {frame.timestamp.toFixed(1)}s
            </div>
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
        Click a frame to use it as the seed for the next scene
      </p>
    </div>
  );
}

