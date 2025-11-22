'use client';

import { TimelineClip as TimelineClipType } from '@/lib/types';
import { Scissors, Trash2, Crop, X, Image as ImageIcon, Film } from 'lucide-react';
import { useState } from 'react';
import { summarizeSceneDescription } from '@/lib/utils/text-utils';

interface TimelineClipProps {
  clip: TimelineClipType;
  totalDuration: number;
  zoomLevel?: number;
  onSplit: (clipId: string, time: number) => void;
  onDelete: (clipId: string) => void;
  onCrop: (clipId: string, trimStart: number, trimEnd: number) => void;
  onSelect?: () => void;
  isSelected?: boolean;
}

export default function TimelineClip({
  clip,
  totalDuration,
  zoomLevel = 1,
  onSplit,
  onDelete,
  onCrop,
  onSelect,
  isSelected = false,
}: TimelineClipProps) {
  const [showControls, setShowControls] = useState(false);
  const [showCropDialog, setShowCropDialog] = useState(false);
  const [cropStart, setCropStart] = useState(clip.trimStart || 0);
  const [cropEnd, setCropEnd] = useState(clip.trimEnd || clip.sourceDuration);
  const [splitTime, setSplitTime] = useState(clip.startTime + clip.duration / 2);

  // Apply zoom to width and position calculations
  const widthPercent = (clip.duration / totalDuration) * 100 * zoomLevel;
  const leftPercent = (clip.startTime / totalDuration) * 100 * zoomLevel;

  const handleSplit = () => {
    onSplit(clip.id, splitTime);
    setShowControls(false);
  };

  const handleDelete = () => {
    if (confirm(`Delete clip "${clip.title}"?`)) {
      onDelete(clip.id);
      setShowControls(false);
    }
  };

  const handleCrop = () => {
    onCrop(clip.id, cropStart, cropEnd);
    setShowCropDialog(false);
    setShowControls(false);
  };

  const isImageClip = clip.type === 'image';
  const badgeColor = isImageClip ? 'bg-purple-600/80' : 'bg-blue-600/80';
  const borderColor = isImageClip
    ? (isSelected ? 'border-purple-400 bg-purple-500/20 shadow-lg shadow-purple-500/30 ring-2 ring-purple-400/30' : 'border-white/20 bg-gradient-to-br from-purple-900/30 to-purple-950/20 hover:border-white/30 hover:from-purple-900/40 hover:to-purple-950/30')
    : (isSelected ? 'border-blue-400 bg-blue-500/20 shadow-lg shadow-blue-500/30 ring-2 ring-blue-400/30' : 'border-white/20 bg-gradient-to-br from-white/10 to-white/5 hover:border-white/30 hover:from-white/15 hover:to-white/10');

  return (
    <>
      <div
        className={`absolute top-10 h-20 rounded-md border transition-all cursor-pointer group ${borderColor}`}
        style={{
          left: `${leftPercent}%`,
          width: `${Math.max(widthPercent, 2)}%`,
        }}
        data-clip="true"
        onClick={(e) => {
          // Don't stop propagation - let timeline track also handle click for seeking
          onSelect?.();
        }}
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => !showCropDialog && setShowControls(false)}
      >
        <div className="h-full flex flex-col p-2.5 relative overflow-hidden">
          {/* Trim Indicator - Only show if actually trimmed from original source */}
          {((clip.trimStart && clip.trimStart > 0) || (clip.trimEnd && clip.trimEnd < clip.sourceDuration)) && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-yellow-400/60" />
          )}

          {/* Clip Type Badge */}
          <div className={`absolute top-1 left-1 ${badgeColor} text-white text-[9px] font-semibold px-1.5 py-0.5 rounded z-10 flex items-center gap-1`}>
            {isImageClip ? (
              <>
                <ImageIcon className="w-3 h-3" />
                Image
              </>
            ) : (
              <>
                <Film className="w-3 h-3" />
                Scene {clip.sceneIndex + 1}
              </>
            )}
          </div>

          {/* Clip Title */}
          <div className="flex-1 flex items-start gap-1.5 min-w-0 pt-4">
            <p className="text-xs font-medium text-white line-clamp-2 flex-1 leading-tight">
              {summarizeSceneDescription(clip.title, 50)}
            </p>
            {clip.isSplit && (
              <span className="text-[9px] text-white/40 bg-white/10 px-1.5 py-0.5 rounded flex-shrink-0">
                split
              </span>
            )}
          </div>

          {/* Clip Info */}
          <div className="flex items-center justify-between text-[10px] text-white/50 mt-auto">
            <span className="font-mono">{clip.duration.toFixed(1)}s</span>
            <span className="font-mono text-white/40">
              {clip.endTime.toFixed(1)}s
            </span>
          </div>

          {/* Controls */}
          {showControls && (
            <div className="absolute -top-10 left-0 flex gap-1 bg-gray-900/95 border border-white/20 rounded-lg p-1 z-20 shadow-xl">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCropDialog(true);
                }}
                className="p-1.5 hover:bg-white/20 rounded transition-colors"
                title="Crop/Trim"
              >
                <Crop className="w-3.5 h-3.5 text-white" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSplit();
                }}
                className="p-1.5 hover:bg-white/20 rounded transition-colors"
                title="Split"
              >
                <Scissors className="w-3.5 h-3.5 text-white" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                className="p-1.5 hover:bg-red-500/20 rounded transition-colors"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Crop Dialog */}
      {showCropDialog && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowCropDialog(false);
            }
          }}
        >
          <div
            className="bg-gray-900 border border-white/20 rounded-lg p-6 w-96 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Crop Clip</h3>
              <button
                onClick={() => setShowCropDialog(false)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/80 mb-2">
                  Start Time (seconds)
                </label>
                <input
                  type="number"
                  min="0"
                  max={clip.sourceDuration}
                  step="0.1"
                  value={cropStart}
                  onChange={(e) => setCropStart(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-white/80 mb-2">
                  End Time (seconds)
                </label>
                <input
                  type="number"
                  min={cropStart}
                  max={clip.sourceDuration}
                  step="0.1"
                  value={cropEnd}
                  onChange={(e) => setCropEnd(parseFloat(e.target.value) || clip.sourceDuration)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="text-xs text-white/60 bg-white/5 p-2 rounded">
                Duration: <span className="font-mono">{(cropEnd - cropStart).toFixed(1)}s</span>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setShowCropDialog(false)}
                  className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCrop}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium"
                >
                  Apply Crop
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
