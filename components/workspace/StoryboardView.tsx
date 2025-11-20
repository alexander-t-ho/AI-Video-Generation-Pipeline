'use client';

import { useProjectStore } from '@/lib/state/project-store';
import SceneCard from './SceneCard';
import { RefreshCw } from 'lucide-react';
import { generateStoryboard } from '@/lib/api-client';

export default function StoryboardView() {
  const { project, currentSceneIndex, scenes, setStoryboard, addChatMessage } = useProjectStore();

  if (!project || !project.storyboard || project.storyboard.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-white/60">
        <p className="text-base mb-4">Loading your story</p>
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

  // Calculate progress - account for subscenes if present
  const hasSubscenes = project.storyboard.some(scene => scene.subscenes && scene.subscenes.length > 0);

  let completedCount = 0;
  let totalCount = 0;

  if (hasSubscenes) {
    // Count subscenes
    project.storyboard.forEach((scene, sceneIndex) => {
      const sceneState = scenes[sceneIndex];
      if (scene.subscenes && scene.subscenes.length > 0) {
        totalCount += scene.subscenes.length;
        // Count completed subscenes
        if (sceneState?.subscenesWithState) {
          completedCount += sceneState.subscenesWithState.filter(sub => sub.status === 'completed').length;
        }
      } else {
        // Legacy scene without subscenes
        totalCount += 1;
        if (sceneState?.status === 'completed') {
          completedCount += 1;
        }
      }
    });
  } else {
    // Legacy: count scenes
    completedCount = scenes.filter(s => s.status === 'completed').length;
    totalCount = project.storyboard.length;
  }

  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const completedScenes = scenes.filter(s => s.status === 'completed').length;

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header with Actions */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xl font-semibold text-white">
            Storyboard
          </h3>
          <p className="text-base text-white/60">
            {project.storyboard.length} scenes{hasSubscenes ? ` • ${totalCount} clips` : ''} • {hasSubscenes ? completedCount : completedScenes} completed
          </p>
        </div>
        <button
          onClick={handleRegenerateStoryboard}
          className="flex items-center gap-2 px-4 py-2 text-base font-medium text-white/80 bg-white/5 border border-white/20 rounded-lg hover:bg-white/10 transition-colors backdrop-blur-sm"
        >
          <RefreshCw className="w-5 h-5" />
          Regenerate
        </button>
      </div>

      {/* Scene Grid */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
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
      <div className="mt-4 pt-4 border-t border-white/20">
        <div className="flex items-center justify-between text-base mb-2">
          <span className="text-white/80">
            Progress: {completedCount} / {totalCount} {hasSubscenes ? 'clips' : 'scenes'}
          </span>
          <span className="text-white/60">
            {progressPercent}% complete
          </span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-2">
          <div
            className="bg-white/40 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

