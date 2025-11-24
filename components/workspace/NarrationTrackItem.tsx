'use client';

import { NarrationTrack, NarrationVoice } from '@/lib/types';
import { Trash2, Volume2, VolumeX, Mic, User, GripVertical } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface NarrationTrackItemProps {
  track: NarrationTrack;
  totalDuration: number;
  zoomLevel?: number;
  onDelete: (trackId: string) => void;
  onUpdate: (trackId: string, updates: Partial<NarrationTrack>) => void;
  onSelect?: () => void;
  isSelected?: boolean;
}

// Voice display names
const VOICE_NAMES: Record<NarrationVoice, string> = {
  alloy: 'Alloy',
  echo: 'Echo',
  fable: 'Fable',
  onyx: 'Onyx',
  nova: 'Nova',
  shimmer: 'Shimmer',
};

export default function NarrationTrackItem({
  track,
  totalDuration,
  zoomLevel = 1,
  onDelete,
  onUpdate,
  onSelect,
  isSelected = false,
}: NarrationTrackItemProps) {
  const [showControls, setShowControls] = useState(false);
  const [volume, setVolume] = useState(track.volume);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartTime, setDragStartTime] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Apply zoom to width and position calculations
  const widthPercent = (track.duration / totalDuration) * 100 * zoomLevel;
  const leftPercent = (track.startTime / totalDuration) * 100 * zoomLevel;

  // Find the timeline container for calculating positions
  useEffect(() => {
    if (trackRef.current) {
      // Find the scrollable container (the one with overflow-x-auto)
      const scrollableContainer = trackRef.current.closest('.overflow-x-auto');
      if (scrollableContainer) {
        containerRef.current = scrollableContainer as HTMLDivElement;
      } else {
        // Fallback to the relative container
        containerRef.current = trackRef.current.closest('.relative') as HTMLDivElement;
      }
    }
  }, []);

  const handleDelete = () => {
    if (confirm(`Delete narration "${track.title}"?`)) {
      onDelete(track.id);
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    onUpdate(track.id, { volume: newVolume });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only start dragging if clicking on the track itself (not controls)
    if ((e.target as HTMLElement).closest('.absolute.-top-10') || 
        (e.target as HTMLElement).closest('.absolute.-bottom-16')) {
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragStartTime(track.startTime);
    onSelect?.();
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const deltaX = e.clientX - dragStartX;
      
      // Calculate the actual timeline width (accounting for zoom)
      const timelineWidth = containerRect.width;
      
      // Convert pixel movement to time
      const deltaTime = (deltaX / timelineWidth) * totalDuration;
      
      let newStartTime = dragStartTime + deltaTime;
      
      // Constrain to timeline bounds
      newStartTime = Math.max(0, Math.min(newStartTime, totalDuration - track.duration));
      
      // Update the track position
      onUpdate(track.id, { startTime: newStartTime });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStartX, dragStartTime, totalDuration, zoomLevel, track.duration, track.id, onUpdate]);

  return (
    <div
      ref={trackRef}
      className={`absolute top-2 h-16 rounded-md border transition-all group ${
        isDragging
          ? 'cursor-grabbing z-50'
          : 'cursor-grab'
      } ${
        isSelected
          ? 'border-purple-400 bg-purple-500/20 shadow-lg shadow-purple-500/30 ring-2 ring-purple-400/30'
          : 'border-white/20 bg-gradient-to-br from-purple-900/30 to-purple-950/20 hover:border-white/30 hover:from-purple-900/40 hover:to-purple-950/30'
      }`}
      style={{
        left: `${leftPercent}%`,
        width: `${Math.max(widthPercent, 2)}%`,
      }}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => {
        if (!isDragging) {
          setShowControls(false);
        }
      }}
    >
      <div className="h-full flex flex-col p-2 relative overflow-hidden">
        {/* Drag Handle */}
        <div className="absolute top-1 right-1 bg-purple-600/80 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
          <GripVertical className="w-3 h-3" />
        </div>
        
        {/* Narration Icon Badge */}
        <div className="absolute top-1 left-1 bg-purple-600/80 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded z-10 flex items-center gap-1">
          <Mic className="w-3 h-3" />
          Narration
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
          <div className="flex items-center gap-1.5">
            <User className="w-2.5 h-2.5" />
            <span className="font-mono">{VOICE_NAMES[track.voice]}</span>
          </div>
        </div>

        {/* Controls */}
        {showControls && (
          <div className="absolute -top-10 left-0 flex gap-1 bg-gray-900/95 border border-white/20 rounded-lg p-2 z-20 shadow-xl min-w-[200px]">
            <div className="flex items-center gap-2 flex-1">
              {volume > 0 ? <Volume2 className="w-3.5 h-3.5 text-white/60" /> : <VolumeX className="w-3.5 h-3.5 text-white/60" />}
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                className="flex-1 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-purple-500"
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

        {/* Text Preview Tooltip */}
        {showControls && track.text && (
          <div className="absolute -bottom-16 left-0 right-0 bg-gray-900/95 border border-white/20 rounded-lg p-2 z-20 shadow-xl max-w-[300px]">
            <p className="text-xs text-white/80 line-clamp-2">{track.text}</p>
          </div>
        )}
      </div>
    </div>
  );
}
