'use client';

import { useProjectStore } from '@/lib/state/project-store';
import VideoPlayer from './VideoPlayer';
import { Clock, Play } from 'lucide-react';

export default function TimelineView() {
  const { project, currentSceneIndex, setCurrentSceneIndex, setViewMode } = useProjectStore();

  if (!project || !project.storyboard || project.storyboard.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <p className="text-sm">No storyboard available. Generate a storyboard first.</p>
      </div>
    );
  }

  const totalDuration = project.storyboard.reduce(
    (sum, scene) => sum + scene.suggestedDuration,
    0
  );

  const handleSceneClick = (index: number) => {
    setCurrentSceneIndex(index);
    setViewMode('editor');
  };

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Timeline
        </h3>
        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <span>Total: {totalDuration}s</span>
          </div>
          <span>{project.storyboard.length} scenes</span>
        </div>
      </div>

      {/* Timeline Scrubber */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4">
          {/* Scene Clips */}
          {project.storyboard.map((scene, index) => {
            const startTime = project.storyboard
              .slice(0, index)
              .reduce((sum, s) => sum + s.suggestedDuration, 0);
            const endTime = startTime + scene.suggestedDuration;
            const widthPercent = (scene.suggestedDuration / totalDuration) * 100;

            return (
              <div
                key={scene.id}
                className="relative"
              >
                <div className="flex items-center gap-4">
                  {/* Scene Label */}
                  <div className="w-20 flex-shrink-0">
                    <button
                      onClick={() => handleSceneClick(index)}
                      className={`text-sm font-medium transition-colors ${
                        currentSceneIndex === index
                          ? 'text-blue-500 dark:text-blue-400'
                          : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      Scene {index + 1}
                    </button>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {scene.suggestedDuration}s
                    </p>
                  </div>

                  {/* Timeline Bar */}
                  <div className="flex-1 relative">
                    <div
                      className={`h-16 rounded-lg border-2 cursor-pointer transition-all ${
                        currentSceneIndex === index
                          ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                      style={{ width: `${Math.max(widthPercent, 10)}%` }}
                      onClick={() => handleSceneClick(index)}
                    >
                      <div className="h-full flex items-center justify-center p-2">
                        <div className="text-center">
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 line-clamp-1">
                            {scene.description}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {startTime.toFixed(1)}s - {endTime.toFixed(1)}s
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Final Stitched Video Preview */}
          {project.status === 'completed' && project.finalVideoUrl && (
            <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                Final Video
              </h4>
              <VideoPlayer
                src={project.finalVideoUrl}
                className="w-full"
                showDownload={true}
                onDownload={() => {
                  // TODO: Implement download
                  console.log('Download final video');
                }}
              />
            </div>
          )}

          {project.status !== 'completed' && (
            <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-center h-32 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700">
                <div className="text-center text-gray-500 dark:text-gray-400">
                  <Play className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Final video will appear here when all scenes are complete</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

