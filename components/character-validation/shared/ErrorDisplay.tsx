import { X } from 'lucide-react';
import type { ErrorDisplayProps } from '../types';

export function ErrorDisplay({ error, onDismiss }: ErrorDisplayProps) {
  if (!error) return null;

  return (
    <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm text-red-400 font-medium">Error</p>
          <p className="text-sm text-red-300 mt-1">{error}</p>
        </div>
        <button
          onClick={onDismiss}
          className="text-red-400 hover:text-red-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}




