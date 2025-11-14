'use client';

import { useProjectStore } from '@/lib/state/project-store';
import VideoPlayer from './VideoPlayer';
import SeedFrameSelector from './SeedFrameSelector';
import { Loader2, Image as ImageIcon, Video, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

export default function EditorView() {
  const { project, currentSceneIndex } = useProjectStore();
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);

  if (!project || !project.storyboard || project.storyboard.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <p className="text-sm">No scene selected. Choose a scene from the storyboard.</p>
      </div>
    );
  }

  const currentScene = project.storyboard[currentSceneIndex];
  if (!currentScene) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <p className="text-sm">Scene not found.</p>
      </div>
    );
  }

  // TODO: Get actual scene state with images, videos, and seed frames
  const sceneHasImage = false;
  const sceneHasVideo = false;
  const seedFrames: any[] = [];

  const handleGenerateImage = async () => {
    setIsGeneratingImage(true);
    // TODO: Implement image generation
    setTimeout(() => setIsGeneratingImage(false), 2000);
  };

  const handleRegenerateImage = async () => {
    setIsGeneratingImage(true);
    // TODO: Implement image regeneration
    setTimeout(() => setIsGeneratingImage(false), 2000);
  };

  const handleGenerateVideo = async () => {
    setIsGeneratingVideo(true);
    // TODO: Implement video generation
    setTimeout(() => setIsGeneratingVideo(false), 2000);
  };

  const handleApproveAndContinue = () => {
    // TODO: Implement approve and continue workflow
    console.log('Approve and continue to next scene');
  };

  const handleSelectSeedFrame = (frameIndex: number) => {
    // TODO: Implement seed frame selection
    console.log('Select seed frame:', frameIndex);
  };

  return (
    <div className="h-full flex flex-col p-4">
      {/* Scene Header */}
      <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Scene {currentSceneIndex + 1}: {currentScene.description}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {currentScene.suggestedDuration}s • {currentScene.imagePrompt}
            </p>
          </div>
        </div>
      </div>

      {/* Main Preview Area */}
      <div className="flex-1 overflow-y-auto">
        {!sceneHasImage && !sceneHasVideo && (
          <div className="flex flex-col items-center justify-center h-full bg-gray-50 dark:bg-gray-900 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700">
            <ImageIcon className="w-12 h-12 text-gray-400 dark:text-gray-500 mb-4" />
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              No image generated yet
            </p>
            <button
              onClick={handleGenerateImage}
              disabled={isGeneratingImage}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGeneratingImage ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <ImageIcon className="w-4 h-4" />
                  Generate Image
                </>
              )}
            </button>
          </div>
        )}

        {sceneHasImage && !sceneHasVideo && (
          <div className="space-y-4">
            {/* Image Preview */}
            <div className="relative bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
              <div className="aspect-video flex items-center justify-center">
                <ImageIcon className="w-16 h-16 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="absolute top-4 right-4 flex gap-2">
                <button
                  onClick={handleRegenerateImage}
                  disabled={isGeneratingImage}
                  className="px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                >
                  {isGeneratingImage ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Regenerate'
                  )}
                </button>
              </div>
            </div>

            {/* Generate Video Button */}
            <button
              onClick={handleGenerateVideo}
              disabled={isGeneratingVideo}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGeneratingVideo ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating Video...
                </>
              ) : (
                <>
                  <Video className="w-5 h-5" />
                  Generate Video
                </>
              )}
            </button>
          </div>
        )}

        {sceneHasVideo && (
          <div className="space-y-4">
            {/* Video Preview */}
            <VideoPlayer
              src={undefined} // TODO: Get actual video URL
              className="w-full"
            />

            {/* Seed Frame Selection */}
            {seedFrames.length > 0 && currentSceneIndex < 4 && (
              <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <SeedFrameSelector
                  frames={seedFrames}
                  selectedFrameIndex={undefined} // TODO: Get from state
                  onSelectFrame={handleSelectSeedFrame}
                />
              </div>
            )}

            {/* Approve & Continue */}
            <button
              onClick={handleApproveAndContinue}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
            >
              <CheckCircle2 className="w-5 h-5" />
              Approve & Continue to Next Scene
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

