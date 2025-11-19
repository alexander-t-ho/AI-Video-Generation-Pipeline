'use client';

import { useProjectStore } from '@/lib/state/project-store';
import { Scissors, Trash2, Crop, Undo2, Redo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TimelineClip } from '@/lib/types';

interface TimelineToolbarProps {
  currentTime: number;
  onCropClick: () => void;
}

export default function TimelineToolbar({ currentTime, onCropClick }: TimelineToolbarProps) {
  const {
    timelineClips,
    selectedClipId,
    deleteClip,
    splitAtPlayhead,
    undo,
    redo,
    canUndo,
    canRedo,
    addChatMessage,
  } = useProjectStore();

  const [undoAvailable, setUndoAvailable] = useState(false);
  const [redoAvailable, setRedoAvailable] = useState(false);

  // Update undo/redo availability
  useEffect(() => {
    const updateAvailability = () => {
      setUndoAvailable(canUndo());
      setRedoAvailable(canRedo());
    };

    updateAvailability();
    // Subscribe to store changes
    const unsubscribe = useProjectStore.subscribe(updateAvailability);
    return () => unsubscribe();
  }, [canUndo, canRedo]);

  const selectedClip = selectedClipId
    ? timelineClips.find((c: TimelineClip) => c.id === selectedClipId)
    : null;

  // Check if playhead is inside any clip
  const clipAtPlayhead = timelineClips.find(
    (clip: TimelineClip) => currentTime > clip.startTime && currentTime < clip.endTime
  );

  const handleSplitAtPlayhead = () => {
    if (!clipAtPlayhead) return;

    splitAtPlayhead(currentTime);
    addChatMessage({
      role: 'agent',
      content: 'Clip split at playhead position. Regenerating preview...',
      type: 'status',
    });
  };

  const handleDelete = () => {
    if (!selectedClipId) return;

    if (confirm(`Delete selected clip?`)) {
      deleteClip(selectedClipId);
      addChatMessage({
        role: 'agent',
        content: 'Clip deleted. Regenerating preview...',
        type: 'status',
      });
    }
  };

  const handleUndo = () => {
    if (!undoAvailable) return;
    undo();
    addChatMessage({
      role: 'agent',
      content: 'Undo: Restored previous timeline state. Regenerating preview...',
      type: 'status',
    });
  };

  const handleRedo = () => {
    if (!redoAvailable) return;
    redo();
    addChatMessage({
      role: 'agent',
      content: 'Redo: Restored next timeline state. Regenerating preview...',
      type: 'status',
    });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if we're in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Undo: Cmd/Ctrl + Z
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Redo: Cmd/Ctrl + Shift + Z or Cmd/Ctrl + Y
      if ((e.metaKey || e.ctrlKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Delete: Backspace or Delete key
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedClipId) {
        e.preventDefault();
        handleDelete();
        return;
      }

      // Split at playhead: S key
      if (e.key === 's' && !e.metaKey && !e.ctrlKey && clipAtPlayhead) {
        e.preventDefault();
        handleSplitAtPlayhead();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedClipId, clipAtPlayhead, currentTime, undoAvailable, redoAvailable]);

  return (
    <div className="flex items-center gap-1 bg-gray-900/90 border border-white/20 rounded-lg p-1.5 shadow-xl">
      {/* Undo/Redo */}
      <div className="flex items-center gap-0.5 pr-2 border-r border-white/10">
        <button
          onClick={handleUndo}
          disabled={!undoAvailable}
          className={`p-2 rounded transition-colors ${
            undoAvailable
              ? 'hover:bg-white/10 text-white/80 hover:text-white'
              : 'text-white/30 cursor-not-allowed'
          }`}
          title="Undo (Cmd+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={handleRedo}
          disabled={!redoAvailable}
          className={`p-2 rounded transition-colors ${
            redoAvailable
              ? 'hover:bg-white/10 text-white/80 hover:text-white'
              : 'text-white/30 cursor-not-allowed'
          }`}
          title="Redo (Cmd+Shift+Z)"
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>

      {/* Editing Tools */}
      <div className="flex items-center gap-0.5 pl-1">
        <button
          onClick={handleSplitAtPlayhead}
          disabled={!clipAtPlayhead}
          className={`p-2 rounded transition-colors ${
            clipAtPlayhead
              ? 'hover:bg-white/10 text-white/80 hover:text-white'
              : 'text-white/30 cursor-not-allowed'
          }`}
          title="Split at Playhead (S)"
        >
          <Scissors className="w-4 h-4" />
        </button>
        <button
          onClick={onCropClick}
          disabled={!selectedClip}
          className={`p-2 rounded transition-colors ${
            selectedClip
              ? 'hover:bg-white/10 text-white/80 hover:text-white'
              : 'text-white/30 cursor-not-allowed'
          }`}
          title="Crop Selected Clip"
        >
          <Crop className="w-4 h-4" />
        </button>
        <button
          onClick={handleDelete}
          disabled={!selectedClipId}
          className={`p-2 rounded transition-colors ${
            selectedClipId
              ? 'hover:bg-red-500/20 text-white/80 hover:text-red-400'
              : 'text-white/30 cursor-not-allowed'
          }`}
          title="Delete Selected Clip (Delete)"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Selection Info */}
      {selectedClip && (
        <div className="pl-2 border-l border-white/10 text-xs text-white/60">
          <span className="font-medium text-white/80">Scene {selectedClip.sceneIndex + 1}</span>
          <span className="ml-1.5 font-mono">{selectedClip.duration.toFixed(1)}s</span>
        </div>
      )}
    </div>
  );
}
