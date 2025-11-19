import type { ProgressIndicatorProps } from '../types';

export function ProgressIndicator({ currentStage, totalStages }: ProgressIndicatorProps) {
  const stages: Array<{ id: string; label: string }> = [
    { id: 'confirmation', label: 'Confirm' },
    { id: 'main-reference', label: 'Generate' },
    { id: 'angle-selection', label: 'Angles' },
    { id: 'angle-generation', label: 'Generate' },
    { id: 'complete', label: 'Complete' }
  ];

  const currentIndex = stages.findIndex(stage => stage.id === currentStage);

  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {stages.slice(0, totalStages).map((stage, index) => (
        <div key={stage.id} className="flex items-center">
          <div
            className={`h-3 w-3 rounded-full transition-all duration-300 ${
              index <= currentIndex
                ? 'bg-white'
                : 'bg-white/20'
            }`}
          />
          {index < stages.slice(0, totalStages).length - 1 && (
            <div
              className={`h-0.5 w-8 mx-2 transition-all duration-300 ${
                index < currentIndex
                  ? 'bg-white'
                  : 'bg-white/20'
              }`}
            />
          )}
        </div>
      ))}
      <div className="ml-4 text-sm text-white/60">
        Step {currentIndex + 1} of {totalStages}
      </div>
    </div>
  );
}




