'use client';

import { useProjectStore } from '@/lib/state/project-store';
import { ViewMode } from '@/lib/types/components';
import { LayoutGrid, Clock, Video, Image, Loader2 } from 'lucide-react';
import { useMemo } from 'react';

const modes: { mode: ViewMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'storyboard', label: 'Storyboard', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
  { mode: 'images', label: 'Images', icon: <Image className="w-3.5 h-3.5" /> },
  { mode: 'video', label: 'Video', icon: <Video className="w-3.5 h-3.5" /> },
  { mode: 'timeline', label: 'Timeline', icon: <Clock className="w-3.5 h-3.5" /> },
];

export default function ModeToggle() {
  const { viewMode, setViewMode, scenes, generationStates, currentSceneIndex } = useProjectStore();

  // Check if any generation is happening for the current scene
  const hasActiveGeneration = useMemo(() => {
    const currentGenState = generationStates[currentSceneIndex];
    const currentScene = scenes[currentSceneIndex];
    
    return {
      images: currentGenState?.isGeneratingImage || currentScene?.status === 'generating_image',
      video: currentGenState?.isGeneratingVideo || currentScene?.status === 'generating_video',
      storyboard: scenes.some(s => s.status === 'generating_image' || s.status === 'generating_video'),
    };
  }, [generationStates, currentSceneIndex, scenes]);

  // Helper to check if a mode has active generation
  const getModeGenerationStatus = (mode: ViewMode) => {
    switch (mode) {
      case 'images':
        return hasActiveGeneration.images;
      case 'video':
        return hasActiveGeneration.video;
      case 'storyboard':
        return hasActiveGeneration.storyboard;
      default:
        return false;
    }
  };

  return (
    <div className="flex items-center gap-0 bg-white/5 rounded-lg p-1">
      {modes.map(({ mode, label, icon }, index) => {
        const isGenerating = getModeGenerationStatus(mode);
        
        return (
          <div key={mode} className="flex items-center">
            {index > 0 && (
              <div className="h-5 w-px bg-white/20" />
            )}
            <button
              onClick={() => setViewMode(mode)}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                viewMode === mode
                  ? 'bg-white/20 text-white shadow-sm'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
              aria-label={`Switch to ${label} view`}
              aria-pressed={viewMode === mode}
            >
              {icon}
              <span className="hidden sm:inline">{label}</span>
              
              {/* Generation indicator - show when not in current view */}
              {isGenerating && viewMode !== mode && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500">
                    <Loader2 className="w-2 h-2 text-white animate-spin absolute inset-0 m-auto" />
                  </span>
                </span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

