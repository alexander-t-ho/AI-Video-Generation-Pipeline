'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useProjectStore } from '@/lib/state/project-store';
import type { AngleType } from '../types';
import { ANGLE_OPTIONS } from '../constants';
import { ProgressIndicator } from '../shared/ProgressIndicator';
import { ImagePreview } from '../shared/ImagePreview';
import { ActionButtons } from '../shared/ActionButtons';
import type { AngleSelectionStageProps } from '../types';

export function AngleSelectionStage({ onContinue }: AngleSelectionStageProps) {
  const router = useRouter();
  const {
    project,
    mainReferenceImage,
    selectedAngles,
    setSelectedAngles,
    selectAllAngles,
    setCharacterValidationStage
  } = useProjectStore();

  const [method, setMethod] = useState<'turnaround' | 'sequential'>('turnaround');

  const handleAngleToggle = (angleId: AngleType) => {
    if (selectedAngles.includes(angleId)) {
      // Remove from selection
      const newSelection = selectedAngles.filter(id => id !== angleId);
      setSelectedAngles(newSelection);
    } else {
      // Add to selection
      setSelectedAngles([...selectedAngles, angleId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedAngles.length === ANGLE_OPTIONS.length) {
      // Deselect all
      setSelectedAngles([]);
    } else {
      // Select all
      selectAllAngles();
    }
  };

  const handleContinue = () => {
    if (selectedAngles.length === 0) {
      alert('Please select at least one angle to generate');
      return;
    }
    setCharacterValidationStage('angle-generation');
    onContinue();
  };

  const handleSkip = useCallback(() => {
    if (!project?.id) {
      console.error('Cannot skip: Project ID is missing');
      const storeProject = useProjectStore.getState().project;
      if (storeProject?.id) {
        router.push(`/workspace?projectId=${storeProject.id}`);
      } else {
        router.push('/');
      }
      return;
    }
    router.push(`/workspace?projectId=${project.id}`);
  }, [project?.id]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 cinematic-gradient relative overflow-hidden">
      {/* Large Background Text */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <h1 className="text-[20vw] md:text-[18vw] font-light text-white/10 tracking-tighter select-none whitespace-nowrap leading-none">
          Angles
        </h1>
      </div>

      <div className="relative z-10 w-full max-w-6xl mx-auto">
        <ProgressIndicator currentStage="angle-selection" totalStages={5} />

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Select Reference Angles
          </h1>
          <p className="text-white/60">
            Choose which angles to generate for comprehensive reference coverage
          </p>
        </div>

        <div className="rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl p-8 space-y-6">
          {/* Main Reference Display */}
          {mainReferenceImage && (
            <div className="text-center">
              <h2 className="text-lg font-semibold text-white mb-4">Main Reference</h2>
              <div className="relative max-w-sm mx-auto">
                <ImagePreview
                  src={mainReferenceImage.url}
                  alt="Main reference"
                  badge="Main Reference"
                />
              </div>
              <p className="text-sm text-white/60 mt-2">
                This will be used as the base reference for generating angle variations
              </p>
            </div>
          )}

          {/* Method Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-white">Generation Method</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="turnaround"
                  checked={method === 'turnaround'}
                  onChange={(e) => setMethod(e.target.value as 'turnaround')}
                  className="text-white border-white/20 bg-white/5"
                />
                <span className="text-sm text-white">Turnaround Sheet (All angles in one image)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="sequential"
                  checked={method === 'sequential'}
                  onChange={(e) => setMethod(e.target.value as 'sequential')}
                  className="text-white border-white/20 bg-white/5"
                />
                <span className="text-sm text-white">Sequential (One angle at a time)</span>
              </label>
            </div>
            <p className="text-xs text-white/40">
              Turnaround method is faster and ensures consistency, but sequential allows more control over each angle.
            </p>
          </div>

          {/* Angle Selection Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Select Angles</h2>
              <div className="flex items-center gap-4">
                <span className="text-sm text-white/60">
                  {selectedAngles.length} of {ANGLE_OPTIONS.length} selected
                </span>
                <button
                  onClick={handleSelectAll}
                  className="px-4 py-2 rounded-lg border border-white/20 text-white text-sm hover:bg-white/10 transition-colors"
                >
                  {selectedAngles.length === ANGLE_OPTIONS.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {ANGLE_OPTIONS.map((angle) => (
                <button
                  key={angle.id}
                  onClick={() => handleAngleToggle(angle.id)}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    selectedAngles.includes(angle.id)
                      ? 'border-white bg-white/10'
                      : 'border-white/20 bg-white/5 hover:border-white/40'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-4 h-4 rounded border-2 mt-0.5 flex-shrink-0 ${
                      selectedAngles.includes(angle.id)
                        ? 'bg-white border-white'
                        : 'border-white/40'
                    }`}>
                      {selectedAngles.includes(angle.id) && (
                        <div className="w-full h-full bg-black rounded-sm" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-medium text-white text-sm">{angle.label}</h3>
                      <p className="text-xs text-white/60 mt-1">{angle.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <ActionButtons
            onSkip={handleSkip}
            onContinue={handleContinue}
            continueDisabled={selectedAngles.length === 0}
            continueText={`Generate ${selectedAngles.length} Angle${selectedAngles.length !== 1 ? 's' : ''}`}
            showSkip={true}
          />
        </div>
      </div>
    </div>
  );
}
