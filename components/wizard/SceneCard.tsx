'use client';

import { useState, useRef, useEffect } from 'react';
import { Scene } from '@/lib/types';
import { Save, X, Edit, Sparkles } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SceneCardProps {
  scene: Scene;
  index: number;
  onUpdate: (sceneId: string, updates: Partial<Scene>) => void;
  isEditing: boolean;
  onEditToggle: (sceneId: string | null) => void;
  onRegenerate?: (sceneId: string) => void;
  isRegenerating?: boolean;
}

export default function SceneCard({
  scene,
  index,
  onUpdate,
  isEditing,
  onEditToggle,
  onRegenerate,
  isRegenerating = false,
}: SceneCardProps) {
  const [editDescription, setEditDescription] = useState(scene.description);
  const [editImagePrompt, setEditImagePrompt] = useState(scene.imagePrompt || '');
  const [editVideoPrompt, setEditVideoPrompt] = useState(scene.videoPrompt || scene.imagePrompt || '');
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const imagePromptRef = useRef<HTMLTextAreaElement>(null);
  const videoPromptRef = useRef<HTMLTextAreaElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isSorting,
  } = useSortable({ 
    id: scene.id,
    disabled: isEditing,
    transition: {
      duration: 200,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)',
    opacity: isDragging ? 0 : isSorting ? 0.8 : 1,
    zIndex: isDragging ? 999 : 'auto',
  };

  // Focus inputs when entering edit mode
  useEffect(() => {
    if (isEditing && descriptionRef.current) {
      descriptionRef.current.focus();
    }
  }, [isEditing]);

  // Sync edit state when scene is updated externally (e.g., from regenerate)
  useEffect(() => {
    if (isEditing) {
      setEditDescription(scene.description);
      setEditImagePrompt(scene.imagePrompt || '');
      setEditVideoPrompt(scene.videoPrompt || scene.imagePrompt || '');
    }
  }, [scene.description, scene.imagePrompt, scene.videoPrompt, isEditing]);

  const handleSave = () => {
    onUpdate(scene.id, {
      description: editDescription.trim(),
      imagePrompt: editImagePrompt.trim(),
      videoPrompt: editVideoPrompt.trim() || editImagePrompt.trim(), // Fallback to imagePrompt if empty
    });
    onEditToggle(null);
  };

  const handleCancel = () => {
    setEditDescription(scene.description);
    setEditImagePrompt(scene.imagePrompt || '');
    setEditVideoPrompt(scene.videoPrompt || scene.imagePrompt || '');
    onEditToggle(null);
  };

  const handleRewrite = async () => {
    if (onRegenerate) {
      await onRegenerate(scene.id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  // Capitalize first letter of description
  const capitalizeFirst = (str: string) => {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(!isEditing ? listeners : {})}
      className={`p-5 rounded-lg border-2 bg-white/5 border-white/20 transition-all select-none will-change-transform ${
        isDragging 
          ? 'opacity-0' 
          : isSorting
            ? 'border-white/40 bg-white/10 shadow-lg'
            : isEditing 
              ? 'cursor-default' 
              : 'cursor-grab hover:border-white/30 hover:bg-white/[0.08] active:cursor-grabbing hover:shadow-md'
      }`}
    >
      {/* Horizontal Layout: [Scene #] [Short Summary] [Full Description] */}
      <div className="grid grid-cols-[auto_1fr_3fr_auto] gap-4 items-start">
        {/* Scene Number */}
        <div className="flex flex-col items-center gap-2">
          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 text-base font-semibold text-white/90 border border-white/20">
            {index + 1}
          </span>
        </div>

        {/* Short Summary */}
        <div className="min-w-0">
          {isEditing ? (
            <div>
              <label className="block text-sm font-medium text-white/60 mb-1">
                Scene Summary
              </label>
              <textarea
                ref={descriptionRef}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={3}
                className="w-full px-3 py-2 bg-white/10 border border-white/30 rounded-md text-base text-white placeholder-white/40 focus:outline-none focus:border-white/50 focus:bg-white/15 resize-none"
                placeholder="Brief description of what happens in this scene..."
              />
            </div>
          ) : (
            <div>
              <h3 className="text-lg font-medium text-white leading-tight line-clamp-3">
                {capitalizeFirst(scene.description)}
              </h3>
              <div className="flex items-center gap-2 mt-2 text-sm text-white/40">
                <span>{scene.suggestedDuration}s</span>
              </div>
            </div>
          )}
        </div>

        {/* Full Scene Description */}
        <div className="min-w-0">
          {isEditing ? (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1">
                  Image Prompt
                </label>
                <textarea
                  ref={imagePromptRef}
                  value={editImagePrompt}
                  onChange={(e) => setEditImagePrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={3}
                  className="w-full px-3 py-2 bg-white/10 border border-white/30 rounded-md text-base text-white placeholder-white/40 focus:outline-none focus:border-white/50 focus:bg-white/15 resize-none"
                  placeholder="Detailed visual description for image generation..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1">
                  Video Prompt
                </label>
                <textarea
                  ref={videoPromptRef}
                  value={editVideoPrompt}
                  onChange={(e) => setEditVideoPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={3}
                  className="w-full px-3 py-2 bg-white/10 border border-white/30 rounded-md text-base text-white placeholder-white/40 focus:outline-none focus:border-white/50 focus:bg-white/15 resize-none"
                  placeholder="Detailed description for video generation (motion/action)..."
                />
              </div>
            </div>
          ) : (
            <div>
              {scene.imagePrompt && (
                <p className="text-base text-white/70 leading-relaxed line-clamp-4">
                  {scene.imagePrompt}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div
          className="flex flex-row gap-1 relative z-10"
        >
          {!isEditing ? (
            <>
              <button
                onClick={() => onEditToggle(scene.id)}
                className="p-2 text-white/70 hover:text-white border border-white/20 rounded-md hover:bg-white/10 transition-colors flex items-center justify-center"
                title="Edit scene"
              >
                <Edit className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  if (onRegenerate && !isRegenerating) {
                    onRegenerate(scene.id);
                  }
                }}
                disabled={isRegenerating}
                className="p-2 text-white/70 hover:text-white border border-white/20 rounded-md hover:bg-white/10 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                title={isRegenerating ? "Regenerating..." : "Regenerate scene"}
              >
                <Sparkles className={`w-4 h-4 ${isRegenerating ? 'animate-pulse' : ''}`} />
              </button>
            </>
          ) : (
            <div className="flex flex-row gap-1">
              <button
                type="button"
                onClick={handleSave}
                className="p-2 text-white bg-white/20 hover:bg-white/30 border border-white/30 rounded hover:border-white/50 transition-colors flex items-center justify-center cursor-pointer"
                title="Save changes"
              >
                <Save className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="p-2 text-white/70 hover:text-white border border-white/20 rounded hover:bg-white/10 transition-colors flex items-center justify-center cursor-pointer"
                title="Cancel editing"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleRewrite}
                disabled={isRegenerating}
                className="p-2 text-white/70 hover:text-white border border-white/20 rounded hover:bg-white/10 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                title={isRegenerating ? "Rewriting..." : "Rewrite scene"}
              >
                <Sparkles className={`w-4 h-4 ${isRegenerating ? 'animate-pulse' : ''}`} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Keyboard Shortcuts Hint (only in edit mode) */}
      {isEditing && (
        <div className="mt-2 text-sm text-white/40 text-right">
          Ctrl+Enter to save • Esc to cancel
        </div>
      )}
    </div>
  );
}

