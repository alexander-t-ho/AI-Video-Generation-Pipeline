// app/components/ProgressIndicator.tsx
'use client';

import { useProjectStore } from '@/lib/store';

const steps = [
  { id: 'storyboard', label: 'Generating Storyboard', description: 'Creating 5-scene narrative' },
  { id: 'scene_generation', label: 'Generating Scenes', description: 'Creating images and videos' },
  { id: 'stitching', label: 'Stitching Video', description: 'Combining all clips' },
  { id: 'completed', label: 'Complete', description: 'Video ready!' },
];

export default function ProgressIndicator() {
  const { project } = useProjectStore();

  if (!project) return null;

  const currentStepIndex = steps.findIndex(step => step.id === project.status);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  return (
    <div className="w-full max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-sm">
      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-medium">Project: {project.id}</span>
          <span className="text-gray-600">{Math.round(progress)}% Complete</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-4 gap-4">
        {steps.map((step, index) => {
          const isComplete = index < currentStepIndex;
          const isCurrent = index === currentStepIndex;
          const isUpcoming = index > currentStepIndex;

          return (
            <div key={step.id} className="flex flex-col items-center text-center">
              {/* Circle */}
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 transition-colors ${
                  isComplete
                    ? 'bg-green-500 text-white'
                    : isCurrent
                    ? 'bg-blue-500 text-white animate-pulse'
                    : 'bg-gray-200 text-gray-400'
                }`}
              >
                {isComplete ? (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <span className="text-sm font-bold">{index + 1}</span>
                )}
              </div>

              {/* Label */}
              <div className="text-xs font-medium mb-1">{step.label}</div>
              <div className="text-xs text-gray-500">{step.description}</div>
            </div>
          );
        })}
      </div>

      {/* Current Scene (if in scene generation) */}
      {project.status === 'scene_generation' && (
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">Scene Progress</span>
            <span className="text-sm text-gray-600">
              Scene {project.currentSceneIndex + 1} of 5
            </span>
          </div>
          <div className="w-full bg-blue-100 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((project.currentSceneIndex + 1) / 5) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
