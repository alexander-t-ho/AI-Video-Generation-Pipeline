'use client';

import { ProcessingStatus, PipelinePhase } from '@/lib/types/face-swap-pipeline';
import { Loader2 } from 'lucide-react';

interface ProcessingProgressProps {
  status: ProcessingStatus | null;
  className?: string;
}

const phaseLabels: Record<PipelinePhase, string> = {
  idle: 'Idle',
  extracting_frames: 'Extracting Frames',
  classifying_frames: 'Classifying Frames',
  detecting_key_frames: 'Detecting Key Frames',
  swapping_faces: 'Swapping Faces',
  replacing_person: 'Replacing Person',
  replacing_car: 'Replacing Car',
  enhancing: 'Enhancing',
  reconstructing_video: 'Reconstructing Video',
  completed: 'Completed',
  failed: 'Failed',
};

export default function ProcessingProgress({
  status,
  className = '',
}: ProcessingProgressProps) {
  if (!status) {
    return null;
  }

  const isProcessing = status.phase !== 'completed' && status.phase !== 'failed' && status.phase !== 'idle';

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Processing Status</h3>
        {isProcessing && (
          <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
        )}
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-white/80">Phase</span>
            <span className="text-white font-medium">
              {phaseLabels[status.phase]}
            </span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2">
            <div
              className="bg-purple-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${status.progress}%` }}
            />
          </div>
          <div className="text-xs text-white/60 mt-1">
            {status.progress}% complete
          </div>
        </div>

        {status.totalFrames > 0 && (
          <div className="text-sm text-white/80">
            <span>Frames: </span>
            <span className="font-medium text-white">
              {status.processedFrames} / {status.totalFrames}
            </span>
          </div>
        )}

        {status.currentFrame && (
          <div className="text-sm text-white/80">
            <span>Current frame: </span>
            <span className="font-medium text-white">#{status.currentFrame}</span>
          </div>
        )}

        {status.errors.length > 0 && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-400 text-sm font-medium mb-1">Errors:</p>
            <ul className="text-red-300 text-xs space-y-1">
              {status.errors.map((error, idx) => (
                <li key={idx}>• {error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

