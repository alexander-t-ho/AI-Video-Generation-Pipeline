'use client';

import { AudioTrack } from '@/lib/types';
import { Trash2, Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';

interface AudioTrackItemProps {
  track: AudioTrack;
  totalDuration: number;
  zoomLevel?: number;
  onDelete: (trackId: string) => void;
  onUpdate: (trackId: string, updates: Partial<AudioTrack>) => void;
  onSelect?: () => void;
  isSelected?: boolean;
}

export default function AudioTrackItem({
  track,
  totalDuration,
  zoomLevel = 1,
  onDelete,
  onUpdate,
  onSelect,
  isSelected = false,
}: AudioTrackItemProps) {
  const [showControls, setShowControls] = useState(false);
  const [volume, setVolume] = useState(track.volume);

  // Apply zoom to width and position calculations
  const widthPercent = (track.duration / totalDuration) * 100 * zoomLevel;
  const leftPercent = (track.startTime / totalDuration) * 100 * zoomLevel;

  const handleDelete = () => {
    if (confirm(`Delete audio track "${track.title}"?`)) {
      onDelete(track.id);
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    onUpdate(track.id, { volume: newVolume });
  };

  return (
    <div
      className={`absolute top-2 h-16 rounded-md border transition-all cursor-pointer group ${
        isSelected
          ? 'border-green-400 bg-green-500/20 shadow-lg shadow-green-500/30 ring-2 ring-green-400/30'
          : 'border-white/20 bg-gradient-to-br from-green-900/30 to-green-950/20 hover:border-white/30 hover:from-green-900/40 hover:to-green-950/30'
      }`}
      style={{
        left: `${leftPercent}%`,
        width: `${Math.max(widthPercent, 2)}%`,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      <div className="h-full flex flex-col p-2 relative overflow-hidden">
        {/* Audio Icon Badge */}
        <div className="absolute top-1 left-1 bg-green-600/80 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded z-10 flex items-center gap-1">
          {volume > 0 ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
          Audio
        </div>

        {/* Track Title */}
        <div className="flex-1 flex items-center gap-1.5 min-w-0 pt-4">
          <p className="text-xs font-medium text-white line-clamp-1 flex-1">
            {track.title}
          </p>
        </div>

        {/* Track Info */}
        <div className="flex items-center justify-between text-[10px] text-white/50 mt-auto">
          <span className="font-mono">{track.duration.toFixed(1)}s</span>
          <span className="font-mono text-white/40">Vol: {volume}%</span>
        </div>

        {/* Controls */}
        {showControls && (
          <div className="absolute -top-10 left-0 flex gap-1 bg-gray-900/95 border border-white/20 rounded-lg p-2 z-20 shadow-xl min-w-[200px]">
            <div className="flex items-center gap-2 flex-1">
              <Volume2 className="w-3.5 h-3.5 text-white/60" />
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                className="flex-1 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-green-500"
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-xs text-white/60 font-mono min-w-[35px]">{volume}%</span>
            </div>
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
  );
}
