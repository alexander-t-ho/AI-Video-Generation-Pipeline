'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProjectStore } from '@/lib/state/project-store';
import { Loader2 } from 'lucide-react';
import type { ValidationStage } from './types';
import { ConfirmationStage } from './stages/ConfirmationStage';
import { MainReferenceStage } from './stages/MainReferenceStage';
import { AngleSelectionStage } from './stages/AngleSelectionStage';
import { AngleGenerationStage } from './stages/AngleGenerationStage';
import { CompletionStage } from './stages/CompletionStage';
import { ErrorBoundary } from './shared/ErrorBoundary';

export default function CharacterValidationScreen() {
  const router = useRouter();
  const {
    project,
    characterValidationStage,
    setCharacterValidationStage,
    createProject: createProjectInStore,
  } = useProjectStore();

  const [stage, setStage] = useState<ValidationStage>('confirmation');
  const [isChecking, setIsChecking] = useState(true);

  // Sync with store state
  useEffect(() => {
    if (characterValidationStage) {
      setStage(characterValidationStage);
    }
  }, [characterValidationStage]);

  // Check if project exists on mount, create one if it doesn't
  useEffect(() => {
    const checkOrCreateProject = () => {
      if (!project) {
        console.log('CharacterValidationScreen: No project found, creating new project');
        // Create a default project for character validation
        createProjectInStore('Character validation project', 15);
      }
      setIsChecking(false);
    };

    // Give the store a moment to hydrate on mount
    const timer = setTimeout(checkOrCreateProject, 100);
    return () => clearTimeout(timer);
  }, [project, createProjectInStore]);

  const handleStageContinue = (nextStage: ValidationStage) => {
    setStage(nextStage);
    setCharacterValidationStage(nextStage);
  };

  // Show loading state while checking for project
  if (isChecking || !project) {
    return (
      <div className="min-h-screen flex items-center justify-center cinematic-gradient">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60">Loading...</p>
        </div>
      </div>
    );
  }

  // Route to different stages
  if (stage === 'confirmation') {
    return (
      <ErrorBoundary>
        <ConfirmationStage onContinue={() => handleStageContinue('main-reference')} />
      </ErrorBoundary>
    );
  }

  if (stage === 'main-reference') {
    return (
      <ErrorBoundary>
        <MainReferenceStage onContinue={() => handleStageContinue('angle-selection')} />
      </ErrorBoundary>
    );
  }

  if (stage === 'angle-selection') {
    return (
      <ErrorBoundary>
        <AngleSelectionStage onContinue={() => handleStageContinue('angle-generation')} />
      </ErrorBoundary>
    );
  }

  if (stage === 'angle-generation') {
    return (
      <ErrorBoundary>
        <AngleGenerationStage onComplete={() => handleStageContinue('complete')} />
      </ErrorBoundary>
    );
  }

  if (stage === 'complete') {
    return (
      <ErrorBoundary>
        <CompletionStage />
      </ErrorBoundary>
    );
  }

  // Placeholder for other stages - will implement next
  return (
    <div className="min-h-screen flex items-center justify-center p-6 cinematic-gradient">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white mb-4">Stage: {stage}</h1>
        <p className="text-white/60">This stage is not yet implemented</p>
      </div>
    </div>
  );
}
