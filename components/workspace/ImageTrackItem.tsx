'use client';

import { ImageTrack } from '@/lib/types';
import { Trash2, Image as ImageIcon, Clock } from 'lucide-react';
import { useState } from 'react';

interface ImageTrackItemProps {
  track: ImageTrack;
  totalDuration: number;
  zoomLevel?: number;
  onDelete: (trackId: string) => void;
  onUpdate: (trackId: string, updates: Partial<ImageTrack>) => void;
  onSelect?: () => void;
  isSelected?: boolean;
}

export default function ImageTrackItem({
  track,
  totalDuration,
  zoomLevel = 1,
  onDelete,
  onUpdate,
  onSelect,
  isSelected = false,
}: ImageTrackItemProps) {
  const [showControls, setShowControls] = useState(false);
  const [duration, setDuration] = useState(track.duration);
  const [animation, setAnimation] = useState<ImageTrack['animation']>(track.animation || 'none');

  // Apply zoom to width and position calculations
  const widthPercent = (track.duration / totalDuration) * 100 * zoomLevel;
  const leftPercent = (track.startTime / totalDuration) * 100 * zoomLevel;

  const handleDelete = () => {
    if (confirm(`Delete image track "${track.title}"?`)) {
      onDelete(track.id);
    }
  };

  const handleDurationChange = (newDuration: number) => {
    const validDuration = Math.max(0.1, newDuration);
    setDuration(validDuration);
    onUpdate(track.id, { duration: validDuration });
  };

  const handleAnimationChange = (newAnimation: ImageTrack['animation']) => {
    setAnimation(newAnimation);
    onUpdate(track.id, { animation: newAnimation });
  };

  return (
    <div
      className={`absolute top-2 h-16 rounded-md border transition-all cursor-pointer group ${
        isSelected
          ? 'border-purple-400 bg-purple-500/20 shadow-lg shadow-purple-500/30 ring-2 ring-purple-400/30'
          : 'border-white/20 bg-gradient-to-br from-purple-900/30 to-purple-950/20 hover:border-white/30 hover:from-purple-900/40 hover:to-purple-950/30'
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
        {/* Image Icon Badge */}
        <div className="absolute top-1 left-1 bg-purple-600/80 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded z-10 flex items-center gap-1">
          <ImageIcon className="w-3 h-3" />
          Image
        </div>

        {/* Track Title */}
        <div className="flex-1 flex items-center gap-1.5 min-w-0 pt-4">
          <p className="text-xs font-medium text-white line-clamp-1 flex-1">
            {track.title}
          </p>
        </div>

        {/* Track Info */}
        <div className="flex items-center justify-between text-[10px] text-white/50 mt-auto">
          <span className="font-mono flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {track.duration.toFixed(1)}s
          </span>
          <span className="font-mono text-white/40">{animation}</span>
        </div>

        {/* Controls */}
        {showControls && (
          <div className="absolute -top-28 left-0 flex flex-col gap-2 bg-gray-900/95 border border-white/20 rounded-lg p-3 z-20 shadow-xl min-w-[250px]">
            {/* Duration Control */}
            <div className="space-y-1">
              <label className="text-xs text-white/80 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Duration (seconds)
              </label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={duration}
                onChange={(e) => handleDurationChange(parseFloat(e.target.value) || 0.1)}
                className="w-full px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Animation Control */}
            <div className="space-y-1">
              <label className="text-xs text-white/80">Animation</label>
              <select
                value={animation}
                onChange={(e) => handleAnimationChange(e.target.value as ImageTrack['animation'])}
                className="w-full px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                onClick={(e) => e.stopPropagation()}
              >
                <option value="none">None</option>
                <option value="zoom-in">Zoom In</option>
                <option value="zoom-out">Zoom Out</option>
                <option value="pan-left">Pan Left</option>
                <option value="pan-right">Pan Right</option>
                <option value="fade">Fade</option>
              </select>
            </div>

            {/* Delete Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              className="flex items-center justify-center gap-2 px-3 py-1.5 hover:bg-red-500/20 rounded transition-colors text-xs text-red-400"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Track
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
