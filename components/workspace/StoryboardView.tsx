'use client';

import { useProjectStore } from '@/lib/state/project-store';
import SceneCard from './SceneCard';
import { RefreshCw } from 'lucide-react';
import { generateStoryboard } from '@/lib/api-client';

export default function StoryboardView() {
  const { project, currentSceneIndex, scenes, setStoryboard, addChatMessage } = useProjectStore();

  if (!project || !project.storyboard || project.storyboard.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 dark:text-gray-400">
        <p className="text-sm mb-4">No storyboard generated yet.</p>
        <p className="text-xs">Create a project to generate a storyboard.</p>
      </div>
    );
  }

  const handleRegenerateStoryboard = async () => {
    if (!project) return;
    
    addChatMessage({
      role: 'agent',
      content: 'Regenerating storyboard...',
      type: 'status',
    });

    try {
      const response = await generateStoryboard(project.prompt, project.targetDuration);
      
      if (response.success && response.scenes) {
        setStoryboard(response.scenes);
        addChatMessage({
          role: 'agent',
          content: '✓ Storyboard regenerated with 5 scenes',
          type: 'status',
        });
      } else {
        throw new Error(response.error || 'Failed to regenerate storyboard');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to regenerate storyboard';
      addChatMessage({
        role: 'agent',
        content: `❌ Error: ${errorMessage}`,
        type: 'error',
      });
    }
  };

  // Calculate progress
  const completedScenes = scenes.filter(s => s.status === 'completed').length;
  const progressPercent = Math.round((completedScenes / project.storyboard.length) * 100);

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header with Actions */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Storyboard
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {project.storyboard.length} scenes • {completedScenes} completed
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
          {project.storyboard.map((scene, index) => {
            // Get actual status from scene state
            const sceneState = scenes[index];
            const status = sceneState?.status || 'pending';
            
            return (
              <SceneCard
                key={scene.id}
                scene={scene}
                sceneIndex={index}
                isSelected={currentSceneIndex === index}
                status={status}
              />
            );
          })}
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-gray-600 dark:text-gray-400">
            Progress: {completedScenes} / {project.storyboard.length} scenes
          </span>
          <span className="text-gray-500 dark:text-gray-500">
            {progressPercent}% complete
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-blue-500 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

