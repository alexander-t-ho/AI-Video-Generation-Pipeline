'use client';

import { useProjectStore } from '@/lib/state/project-store';
import VideoPlayer from './VideoPlayer';
import { Clock, Play, Download, Loader2, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { stitchVideos } from '@/lib/api-client';

export default function TimelineView() {
  const { project, currentSceneIndex, setCurrentSceneIndex, setViewMode, scenes, setFinalVideo, addChatMessage } = useProjectStore();
  const [isStitching, setIsStitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Check if all scenes have videos
  const allScenesHaveVideos = scenes.every(s => s.videoLocalPath);
  const videoPaths = scenes
    .map(s => s.videoLocalPath)
    .filter((path): path is string => !!path);

  const handleSceneClick = (index: number) => {
    setCurrentSceneIndex(index);
    setViewMode('editor');
  };

  const handleStitchVideos = async () => {
    if (!project || videoPaths.length === 0) {
      setError('Not all scenes have videos yet');
      return;
    }

    setIsStitching(true);
    setError(null);

    try {
      addChatMessage({
        role: 'agent',
        content: 'Stitching all videos together...',
        type: 'status',
      });

      const response = await stitchVideos(videoPaths, project.id);

      if (response.finalVideoPath) {
        // Convert local path to URL for display
        const finalVideoUrl = response.finalVideoPath.startsWith('http')
          ? response.finalVideoPath
          : `/api/video?path=${encodeURIComponent(response.finalVideoPath)}`;
        
        setFinalVideo(finalVideoUrl, response.s3Url);
        
        addChatMessage({
          role: 'agent',
          content: '✓ Final video stitched successfully! Ready for download.',
          type: 'status',
        });
      } else {
        throw new Error('Failed to stitch videos');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to stitch videos';
      setError(errorMessage);
      addChatMessage({
        role: 'agent',
        content: `❌ Error: ${errorMessage}`,
        type: 'error',
      });
    } finally {
      setIsStitching(false);
    }
  };

  const handleDownload = () => {
    if (!project.finalVideoUrl) return;

    // Create a temporary link and trigger download
    const link = document.createElement('a');
    link.href = project.finalVideoUrl;
    link.download = `video-${project.id}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

                  {/* Timeline Bar with Scene Boundaries (Phase 9.1.3) */}
                  <div className="flex-1 relative">
                    <div
                      className={`h-16 rounded-lg border-2 cursor-pointer transition-all relative ${
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
                      {/* Scene boundary indicators */}
                      {index > 0 && (
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gray-400 dark:bg-gray-600" />
                      )}
                      {index < project.storyboard.length - 1 && (
                        <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-gray-400 dark:bg-gray-600" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Stitch Videos Button */}
          {allScenesHaveVideos && !project.finalVideoUrl && (
            <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                      All Scenes Complete
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {videoPaths.length} videos ready to stitch
                    </p>
                  </div>
                  <button
                    onClick={handleStitchVideos}
                    disabled={isStitching}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isStitching ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Stitching...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Stitch Final Video
                      </>
                    )}
                  </button>
                </div>
                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Final Stitched Video Preview */}
          {project.finalVideoUrl && (
            <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Final Video
                </h4>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download MP4
                </button>
              </div>
              <VideoPlayer
                src={project.finalVideoUrl}
                className="w-full"
                showDownload={false}
              />
            </div>
          )}

          {!allScenesHaveVideos && !project.finalVideoUrl && (
            <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-center h-32 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700">
                <div className="text-center text-gray-500 dark:text-gray-400">
                  <Play className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">
                    {videoPaths.length} of {project.storyboard.length} scenes have videos
                  </p>
                  <p className="text-xs mt-1">Complete all scenes to stitch final video</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

