'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useProjectStore } from '@/lib/state/project-store';
import { Edit, Loader2, Upload, ArrowRight } from 'lucide-react';
import { detectCharactersOrProducts, extractCharacterDescription, detectPromptStyle } from '@/lib/utils/character-detection';
import { ProgressIndicator } from '../shared/ProgressIndicator';
import { ImagePreview } from '../shared/ImagePreview';
import { ActionButtons } from '../shared/ActionButtons';
import type { ConfirmationStageProps } from '../types';

export function ConfirmationStage({ onContinue }: ConfirmationStageProps) {
  const router = useRouter();
  const {
    project,
    setCharacterValidationStage,
    setCharacterDescription
  } = useProjectStore();

  const [cleanDescription, setCleanDescription] = useState<string>('');
  const [tempDescription, setTempDescription] = useState<string>('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [isExtractingDescription, setIsExtractingDescription] = useState(false);
  const [hasAttemptedExtraction, setHasAttemptedExtraction] = useState(false);
  const [detectedStyle, setDetectedStyle] = useState<'cartoon' | 'realistic' | 'default'>('default');
  const [hasCharacters, setHasCharacters] = useState(false);

  // Extract clean character description on mount
  useEffect(() => {
    const extractCleanDescription = async () => {
      if (!project?.characterDescription || hasAttemptedExtraction) {
        if (!project?.characterDescription && !hasAttemptedExtraction) {
          setHasAttemptedExtraction(true);
          setCleanDescription('Character from your video prompt');
          setTempDescription('Character from your video prompt');
        }
        return;
      }

      setHasAttemptedExtraction(true);

      // First, try client-side extraction using the character-detection utility
      const clientExtracted = extractCharacterDescription(project.characterDescription);
      const style = detectPromptStyle(project.characterDescription);
      const hasChars = detectCharactersOrProducts(project.characterDescription);

      // Store detection results
      setDetectedStyle(style);
      setHasCharacters(hasChars);

      // Show immediate feedback based on client-side detection
      if (clientExtracted && hasChars) {
        setCleanDescription(clientExtracted);
        setTempDescription(clientExtracted);

        console.log(`[ConfirmationStage] Client-side detection: style="${style}", hasCharacters=${hasChars}`);
      } else {
        // Fallback to first sentence if no characters detected
        const firstSentence = project.characterDescription.split(/[.!?]/)[0].trim();
        const fallback = firstSentence || 'Character from your video prompt';
        setCleanDescription(fallback);
        setTempDescription(fallback);
      }

      // Then, enhance with AI extraction in background (non-blocking)
      setIsExtractingDescription(true);

      try {
        const response = await fetch('/api/extract-character-description', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullPrompt: project.characterDescription,
            detectedStyle: style,
          }),
        });

        const data = await response.json();
        if (data.success && data.characterDescription) {
          // Only update if AI extraction provides something more refined (longer than 20 chars)
          if (data.characterDescription.length > 20) {
            setCleanDescription(data.characterDescription);
            setTempDescription(data.characterDescription);
            console.log('[ConfirmationStage] Enhanced with AI extraction:', data.characterDescription);
          }
        }
      } catch (error) {
        console.error('Failed to extract clean description:', error);
        // Keep client-side extraction if API fails
      } finally {
        setIsExtractingDescription(false);
      }
    };

    extractCleanDescription();
  }, [project?.characterDescription, hasAttemptedExtraction]);

  const handleEditDescription = () => {
    setEditingDescription(true);
  };

  const handleSaveDescription = () => {
    setCleanDescription(tempDescription);
    setCharacterDescription(tempDescription);
    setEditingDescription(false);
    setHasAttemptedExtraction(false); // Allow re-extraction if needed
  };

  const handleCancelEdit = () => {
    setTempDescription(cleanDescription);
    setEditingDescription(false);
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
  }, [router, project?.id]);

  const handleConfirmGeneration = () => {
    setCharacterValidationStage('main-reference');
    onContinue();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 cinematic-gradient relative overflow-hidden">
      {/* Large Background Text */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <h1 className="text-[20vw] md:text-[18vw] font-light text-white/10 tracking-tighter select-none whitespace-nowrap leading-none">
          Confirm
        </h1>
      </div>

      <div className="relative z-10 w-full max-w-4xl mx-auto">
        <ProgressIndicator currentStage="confirmation" totalStages={5} />

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Review Character Setup
          </h1>
          <p className="text-white/60">
            Review your character description and reference images before generation
          </p>
        </div>

        <div className="rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl p-8 space-y-6">
          {/* Loading State */}
          {isExtractingDescription && (
            <div className="text-center">
              <Loader2 className="w-12 h-12 text-white/60 animate-spin mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-white mb-2">Preparing Character Setup</h2>
              <p className="text-white/60">Analyzing your character description...</p>
            </div>
          )}

          {/* Character Description Section */}
          {!isExtractingDescription && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-white">Character Description</h2>
                  {hasCharacters && detectedStyle !== 'default' && (
                    <span className="text-xs px-2 py-1 rounded-full bg-white/10 text-white/60 border border-white/20">
                      {detectedStyle} style
                    </span>
                  )}
                </div>
                {!editingDescription && (
                  <button
                    onClick={handleEditDescription}
                    className="text-sm text-white/60 hover:text-white transition-colors"
                  >
                    <Edit className="w-4 h-4 inline mr-1" />
                    Edit
                  </button>
                )}
              </div>

              {editingDescription ? (
                <div className="space-y-3">
                  <textarea
                    value={tempDescription}
                    onChange={(e) => setTempDescription(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-white/20 bg-white/[0.02] px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/40 focus:bg-white/[0.05] backdrop-blur-sm transition-all resize-none"
                    placeholder="Describe your character..."
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveDescription}
                      className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="px-4 py-2 rounded-lg border border-white/20 text-white text-sm hover:bg-white/10 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-white/5 rounded-lg border border-white/20">
                  <p className="text-sm text-white/80">
                    {cleanDescription || 'Character from your video prompt'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Reference Images Section */}
          {project?.uploadedImageUrls && project.uploadedImageUrls.length > 0 && !isExtractingDescription && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Reference Images</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                {project.uploadedImageUrls.map((url, index) => (
                  <ImagePreview
                    key={index}
                    src={url}
                    alt={`Reference ${index + 1}`}
                  />
                ))}
              </div>
              <p className="text-xs text-white/60">
                {project.uploadedImageUrls.length} reference image(s) will be used to generate character variations
              </p>
            </div>
          )}

          {/* Action Buttons */}
          {!isExtractingDescription && (
            <ActionButtons
              onSkip={handleSkip}
              onContinue={handleConfirmGeneration}
              continueText="Start Generation"
              showSkip={true}
            />
          )}
        </div>
      </div>
    </div>
  );
}
