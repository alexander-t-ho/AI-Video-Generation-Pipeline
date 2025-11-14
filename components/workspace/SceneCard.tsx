'use client';

import { Scene } from '@/lib/types';
import { CheckCircle2, Clock, Loader2, AlertCircle } from 'lucide-react';
import { useProjectStore } from '@/lib/state/project-store';

interface SceneCardProps {
  scene: Scene;
  sceneIndex: number;
  status?: 'pending' | 'generating_image' | 'image_ready' | 'generating_video' | 'video_ready' | 'completed';
  isSelected?: boolean;
  onClick?: () => void;
}

export default function SceneCard({
  scene,
  sceneIndex,
  status = 'pending',
  isSelected = false,
  onClick,
}: SceneCardProps) {
  const { setCurrentSceneIndex, setViewMode } = useProjectStore();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      setCurrentSceneIndex(sceneIndex);
      setViewMode('editor');
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full animate-success">
            <CheckCircle2 className="w-3 h-3" />
            Completed
          </span>
        );
      case 'video_ready':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full">
            <CheckCircle2 className="w-3 h-3" />
            Video Ready
          </span>
        );
      case 'image_ready':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-full">
            <CheckCircle2 className="w-3 h-3" />
            Image Ready
          </span>
        );
      case 'generating_video':
      case 'generating_image':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full">
            <Loader2 className="w-3 h-3 animate-spin" />
            Generating...
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full">
            Pending
          </span>
        );
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 group animate-fade-in ${
        isSelected
          ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20 shadow-md ring-2 ring-blue-200 dark:ring-blue-800'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md hover:scale-[1.02] active:scale-[0.98]'
      }`}
    >
      {/* Scene Number Badge */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300">
            {sceneIndex + 1}
          </span>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {scene.suggestedDuration}s
            </span>
          </div>
        </div>
        {getStatusBadge()}
      </div>

      {/* Description */}
      <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2 line-clamp-2">
        {scene.description}
      </h3>

      {/* Image Prompt Preview */}
      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3">
        {scene.imagePrompt}
      </p>

      {/* Hover Effect Indicator */}
      <div className="absolute inset-0 rounded-lg border-2 border-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

