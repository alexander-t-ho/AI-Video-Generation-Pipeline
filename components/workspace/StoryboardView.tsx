'use client';

import { useProjectStore } from '@/lib/state/project-store';
import SceneCard from './SceneCard';
import { RefreshCw } from 'lucide-react';

export default function StoryboardView() {
  const { project, currentSceneIndex } = useProjectStore();

  if (!project || !project.storyboard || project.storyboard.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 dark:text-gray-400">
        <p className="text-sm mb-4">No storyboard generated yet.</p>
        <p className="text-xs">Create a project to generate a storyboard.</p>
      </div>
    );
  }

  const handleRegenerateStoryboard = () => {
    // TODO: Implement storyboard regeneration
    console.log('Regenerate storyboard');
  };

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header with Actions */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Storyboard
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {project.storyboard.length} scenes
          </p>
        </div>
        <button
          onClick={handleRegenerateStoryboard}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Regenerate
        </button>
      </div>

      {/* Scene Grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
          {project.storyboard.map((scene, index) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              sceneIndex={index}
              isSelected={currentSceneIndex === index}
              status="pending" // TODO: Get actual status from scene state
            />
          ))}
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            Progress: {project.storyboard.length} / 5 scenes
          </span>
          <span className="text-gray-500 dark:text-gray-500">
            {Math.round((project.storyboard.length / 5) * 100)}% complete
          </span>
        </div>
      </div>
    </div>
  );
}

