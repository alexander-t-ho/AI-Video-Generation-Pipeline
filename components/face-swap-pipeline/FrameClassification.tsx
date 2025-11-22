'use client';

import { FrameMetadata, FrameClassification } from '@/lib/types/face-swap-pipeline';

interface FrameClassificationProps {
  frames: FrameMetadata[];
  className?: string;
}

const classificationLabels: Record<FrameClassification, string> = {
  face_closeup: 'Face Close-up',
  full_body: 'Full Body',
  car_visible: 'Car Visible',
  environment_only: 'Environment Only',
  unknown: 'Unknown',
};

const classificationColors: Record<FrameClassification, string> = {
  face_closeup: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
  full_body: 'bg-green-500/20 text-green-300 border-green-500/50',
  car_visible: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
  environment_only: 'bg-gray-500/20 text-gray-300 border-gray-500/50',
  unknown: 'bg-white/10 text-white/60 border-white/20',
};

export default function FrameClassificationDisplay({
  frames,
  className = '',
}: FrameClassificationProps) {
  const classificationCounts = frames.reduce((acc, frame) => {
    const classification = frame.classification || 'unknown';
    acc[classification] = (acc[classification] || 0) + 1;
    return acc;
  }, {} as Record<FrameClassification, number>);

  return (
    <div className={`space-y-4 ${className}`}>
      <h3 className="text-lg font-semibold text-white">Frame Classification</h3>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(Object.keys(classificationLabels) as FrameClassification[]).map((classification) => {
          const count = classificationCounts[classification] || 0;
          return (
            <div
              key={classification}
              className={`p-3 rounded-lg border ${classificationColors[classification]}`}
            >
              <div className="text-sm font-medium">
                {classificationLabels[classification]}
              </div>
              <div className="text-lg font-bold">{count}</div>
            </div>
          );
        })}
      </div>

      {frames.length === 0 && (
        <p className="text-white/60 text-sm">No frames classified yet</p>
      )}
    </div>
  );
}

