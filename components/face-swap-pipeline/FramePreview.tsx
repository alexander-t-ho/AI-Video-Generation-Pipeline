'use client';

import { FrameMetadata } from '@/lib/types/face-swap-pipeline';
import { Image as ImageIcon } from 'lucide-react';

interface FramePreviewProps {
  frames: FrameMetadata[];
  selectedFrames?: number[];
  onFrameSelect?: (frameNumber: number) => void;
  className?: string;
}

export default function FramePreview({
  frames,
  selectedFrames = [],
  onFrameSelect,
  className = '',
}: FramePreviewProps) {
  if (frames.length === 0) {
    return (
      <div className={`space-y-4 ${className}`}>
        <h3 className="text-lg font-semibold text-white">Frames</h3>
        <div className="border-2 border-dashed border-purple-500/30 rounded-xl p-12 text-center">
          <ImageIcon className="w-12 h-12 text-purple-400/40 mx-auto mb-4" />
          <p className="text-white/60">No frames extracted yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">
          Frames ({frames.length})
        </h3>
        {selectedFrames.length > 0 && (
          <span className="text-sm text-white/60">
            {selectedFrames.length} selected
          </span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3 max-h-96 overflow-y-auto">
        {frames.map((frame) => {
          const isSelected = selectedFrames.includes(frame.frameNumber);
          const hasUrl = frame.url || frame.path;

          return (
            <div
              key={frame.frameNumber}
              onClick={() => onFrameSelect?.(frame.frameNumber)}
              className={`
                relative aspect-video rounded-lg overflow-hidden border-2 cursor-pointer transition-all
                ${
                  isSelected
                    ? 'border-purple-500 ring-2 ring-purple-500/50'
                    : 'border-purple-500/30 hover:border-purple-500/50'
                }
              `}
            >
              {hasUrl ? (
                <img
                  src={frame.url || frame.path}
                  alt={`Frame ${frame.frameNumber}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-purple-500/10 flex items-center justify-center">
                  <ImageIcon className="w-6 h-6 text-purple-400/40" />
                </div>
              )}

              {isSelected && (
                <div className="absolute top-1 right-1 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs">✓</span>
                </div>
              )}

              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
                <p className="text-white text-xs">
                  #{frame.frameNumber} {frame.timestamp.toFixed(1)}s
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

