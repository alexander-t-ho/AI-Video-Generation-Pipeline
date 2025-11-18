'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useProjectStore } from '@/lib/state/project-store';
import { RefreshCw, Loader2 } from 'lucide-react';
import type { AngleType } from '../types';
import { ANGLE_DEFINITIONS, GENERATION_PROMPTS } from '../constants';
import { useImageGeneration } from '../hooks/useImageGeneration';
import { useImageProcessing } from '../hooks/useImageProcessing';
import { ProgressIndicator } from '../shared/ProgressIndicator';
import { ErrorDisplay } from '../shared/ErrorDisplay';
import { ImagePreview } from '../shared/ImagePreview';
import { ActionButtons } from '../shared/ActionButtons';
import type { AngleGenerationStageProps } from '../types';

export function AngleGenerationStage({ onComplete }: AngleGenerationStageProps) {
  const router = useRouter();
  const {
    project,
    mainReferenceImage,
    selectedAngles,
    angleReferenceImages,
    currentAngleIndex,
    angleGenerationMethod,
    characterReferenceModel,
    setAngleReferenceImage,
    setCurrentAngleIndex,
    setCharacterValidationStage,
    setCharacterDescription
  } = useProjectStore();

  const [currentAngle, setCurrentAngle] = useState<AngleType | null>(null);
  const [feedback, setFeedback] = useState('');
  const [completedAngles, setCompletedAngles] = useState<Set<AngleType>>(new Set());

  const { 
    isGenerating, 
    generatedImage,
    error: generationError, 
    generateImage, 
    setGeneratedImage,
    setError: setGenerationError,
    clearState
  } = useImageGeneration();
  const {
    upscaleState,
    splitState,
    upscaleImage,
    splitImageGrid,
    backgroundRemovalState,
    removeBackground
  } = useImageProcessing();

  // Start generation when component mounts (only once)
  useEffect(() => {
    const initGeneration = async () => {
      if (selectedAngles.length === 0) {
        console.log('[AngleGenerationStage] No angles selected, skipping generation');
        return;
      }

      if (currentAngle !== null) {
        console.log('[AngleGenerationStage] Generation already started, skipping');
        return;
      }

      if (isGenerating) {
        console.log('[AngleGenerationStage] Generation already in progress, skipping');
        return;
      }

      console.log('[AngleGenerationStage] Starting angle generation on mount with', selectedAngles.length, 'angles');
      console.log('[AngleGenerationStage] Method:', angleGenerationMethod);
      console.log('[AngleGenerationStage] Main reference:', mainReferenceImage?.url ? 'present' : 'missing');

      // Small delay to ensure component is fully mounted
      await new Promise(resolve => setTimeout(resolve, 100));

      startAngleGeneration();
    };

    initGeneration();
  }, []); // Empty deps - only run once on mount

  const startAngleGeneration = () => {
    if (angleGenerationMethod === 'turnaround') {
      generateTurnaroundSheet();
    } else {
      // Sequential generation - start with first angle
      const firstAngle = selectedAngles[0];
      setCurrentAngle(firstAngle);
      setCurrentAngleIndex(0);
    }
  };

  const generateTurnaroundSheet = async () => {
    console.log('[TurnaroundSheet] ==> Starting generateTurnaroundSheet');
    console.log('[TurnaroundSheet] Project:', project?.id);
    console.log('[TurnaroundSheet] Project characterDescription:', project?.characterDescription);
    console.log('[TurnaroundSheet] Project prompt:', project?.prompt);
    console.log('[TurnaroundSheet] Main reference image:', {
      url: mainReferenceImage?.url?.startsWith('data:')
        ? `${mainReferenceImage.url.substring(0, 30)}... [base64 data]`
        : mainReferenceImage?.url,
      localPath: mainReferenceImage?.localPath,
      exists: !!mainReferenceImage,
    });
    console.log('[TurnaroundSheet] Selected angles:', selectedAngles);

    // Safety check: Ensure characterDescription is set
    if (!project?.characterDescription && project?.prompt) {
      console.warn('[TurnaroundSheet] characterDescription missing, falling back to prompt');
      setCharacterDescription(project.prompt);
    }

    if (!project?.characterDescription || !mainReferenceImage) {
      console.error('[TurnaroundSheet] Missing required data:', {
        hasProject: !!project,
        hasCharacterDescription: !!project?.characterDescription,
        hasPrompt: !!project?.prompt,
        hasMainReferenceImage: !!mainReferenceImage,
      });
      setGenerationError('Missing project or main reference image. Please ensure you have selected a main reference image and provided a character description.');
      return;
    }

    // Create a comprehensive prompt for all angles
    const anglePrompts = selectedAngles.map(angle => ANGLE_DEFINITIONS[angle].prompt).join(', ');
    const angleCount = selectedAngles.length;

    // Create explicit turnaround sheet prompt with ONLY the selected angles
    const angleLabels = selectedAngles.map(angle => ANGLE_DEFINITIONS[angle].label).join(', ');
    const prompt = `Professional automotive turnaround reference sheet. ${project.characterDescription}.
CRITICAL: This must be a SINGLE composite image showing EXACTLY ${angleCount} different camera angles of the SAME vehicle, arranged side-by-side in a horizontal grid.
REQUIRED ANGLES (${angleCount} total): ${angleLabels}
Specific views: ${anglePrompts}.
Style: Professional car design reference sheet, automotive photography, studio lighting, white/neutral background, orthographic views.
Layout: ${angleCount} views arranged horizontally in one image (like a character turnaround sheet in animation/game design).
Each view must show the exact same vehicle from a different angle, maintaining consistent lighting and style across all angles.
This should look like a professional automotive design turnaround/reference sheet used in car design studios.`;

    // Build reference image URLs - use ONLY the refined reference image from previous step
    const referenceImages = [];

    // Add main reference - prefer localPath or original URL over serve-image API paths
    if (mainReferenceImage.localPath && !mainReferenceImage.localPath.startsWith('/api/')) {
      referenceImages.push(mainReferenceImage.localPath);
    } else if (mainReferenceImage.url && !mainReferenceImage.url.startsWith('/api/')) {
      referenceImages.push(mainReferenceImage.url);
    }

    console.log('[TurnaroundSheet] Reference images to send:', referenceImages);

    await generateImage({
      prompt,
      projectId: project.id,
      sceneIndex: 0,
      referenceImageUrls: referenceImages,
      model: characterReferenceModel
    });
  };

  const generateCurrentAngle = async () => {
    if (!currentAngle || !project?.characterDescription || !mainReferenceImage) return;

    const angleDef = ANGLE_DEFINITIONS[currentAngle];
    let prompt = `${project.characterDescription}. ${angleDef.prompt}`;

    if (feedback.trim()) {
      prompt += `. ${feedback.trim()}`;
    }

    prompt += GENERATION_PROMPTS.automotiveContext;

    // Use ONLY the refined reference image from previous step - prefer localPath, then url
    const referenceImageUrls: string[] = [];
    if (mainReferenceImage.localPath && !mainReferenceImage.localPath.startsWith('/api/')) {
      referenceImageUrls.push(mainReferenceImage.localPath);
    } else if (mainReferenceImage.url && !mainReferenceImage.url.startsWith('/api/')) {
      referenceImageUrls.push(mainReferenceImage.url);
    }

    await generateImage({
      prompt,
      projectId: project.id,
      sceneIndex: 0,
      referenceImageUrls,
      model: characterReferenceModel
    });
  };

  const handleUpscaleAndConfirm = async () => {
    if (!generatedImage || !project?.id) return;

    // TURNAROUND MODE: Split the turnaround sheet into individual angles first
    if (angleGenerationMethod === 'turnaround') {
      console.log('[TurnaroundSheet] Starting split process...');
      console.log('[TurnaroundSheet] Image URL:', generatedImage.substring(0, 100) + '...');
      console.log('[TurnaroundSheet] Frame count:', selectedAngles.length);

      // Split turnaround sheet into individual angle images
      const splitResult = await splitImageGrid(generatedImage, selectedAngles.length, project.id);

      if (!splitResult.success || !splitResult.frames) {
        setGenerationError('Failed to split turnaround sheet into individual angles');
        return;
      }

      // Process each angle frame
      for (let i = 0; i < splitResult.frames.length; i++) {
        const frame = splitResult.frames[i];
        const frameUrl = frame.url; // Always an object with url property
        const angle = selectedAngles[i];
        console.log(`[TurnaroundSheet] Processing angle ${i + 1}/${splitResult.frames.length}: ${ANGLE_DEFINITIONS[angle].label}`);
        console.log(`[TurnaroundSheet] Frame URL: ${frameUrl?.substring(0, 100)}...`);

        try {
          // Remove background
          const bgResult = await removeBackground([frameUrl], project.id);
          if (!bgResult.success || !bgResult.processedImages?.[0]) {
            throw new Error(`Failed to remove background for ${ANGLE_DEFINITIONS[angle].label}`);
          }

          const bgRemovedImage = bgResult.processedImages[0].url;

          // Upscale
          const upscaleResult = await upscaleImage([bgRemovedImage], project.id);
          if (!upscaleResult.success || !upscaleResult.upscaledImages?.[0]) {
            throw new Error(`Failed to upscale ${ANGLE_DEFINITIONS[angle].label}`);
          }

          const finalImage = upscaleResult.upscaledImages[0];

          // Create CharacterReferenceImage object
          const angleImage = {
            id: finalImage.id || `angle-${angle}-${Date.now()}`,
            url: finalImage.url,
            localPath: finalImage.localPath || '',
            prompt: `${project.characterDescription}. ${ANGLE_DEFINITIONS[angle].prompt}`,
            replicateId: '',
            createdAt: new Date().toISOString(),
            angleType: angle,
            generationModel: characterReferenceModel,
            isUpscaled: true,
            originalPrompt: project.characterDescription || '',
          };

          // Store in project store
          setAngleReferenceImage(angle, angleImage);
          console.log(`[TurnaroundSheet] Saved ${ANGLE_DEFINITIONS[angle].label} to store`);
        } catch (angleError) {
          console.error(`[TurnaroundSheet] Failed to process ${ANGLE_DEFINITIONS[angle].label}:`, angleError);
          throw new Error(`Failed to process ${ANGLE_DEFINITIONS[angle].label}: ${angleError instanceof Error ? angleError.message : 'Unknown error'}`);
        }
      }

      console.log('[TurnaroundSheet] All angles processed successfully');

      // Move to completion stage
      setTimeout(() => {
        setCharacterValidationStage('complete');
        onComplete();
      }, 2000);

      return;
    }

    // SEQUENTIAL MODE: Process single angle
    if (!currentAngle) return;

    // Remove background first
    const bgResult = await removeBackground([generatedImage], project.id);
    if (!bgResult.success || !bgResult.processedImages?.[0]) {
      setGenerationError('Failed to remove background');
      return;
    }

    const bgRemovedImage = bgResult.processedImages[0].url;

    // Then upscale
    const upscaleResult = await upscaleImage([bgRemovedImage], project.id);
    if (!upscaleResult.success || !upscaleResult.upscaledImages?.[0]) {
      setGenerationError('Failed to upscale image');
      return;
    }

    const finalImage = upscaleResult.upscaledImages[0];

    // Create CharacterReferenceImage object
    const angleImage = {
      id: finalImage.id || `angle-${currentAngle}-${Date.now()}`,
      url: finalImage.url,
      localPath: finalImage.localPath || '',
      prompt: `${project.characterDescription}. ${ANGLE_DEFINITIONS[currentAngle].prompt}` + (feedback ? `. ${feedback}` : ''),
      replicateId: '',
      createdAt: new Date().toISOString(),
      angleType: currentAngle,
      generationModel: characterReferenceModel,
      isUpscaled: true,
      originalPrompt: project.characterDescription || '',
    };

    // Store in project store
    setAngleReferenceImage(currentAngle, angleImage);

    // Mark this angle as completed
    const newCompleted = new Set(completedAngles);
    newCompleted.add(currentAngle);
    setCompletedAngles(newCompleted);

    // Reset for next angle or completion
    clearState();
    setFeedback('');

    // Move to next angle or complete
    const currentIndex = selectedAngles.indexOf(currentAngle);
    if (currentIndex < selectedAngles.length - 1) {
      // Next angle
      const nextAngle = selectedAngles[currentIndex + 1];
      setCurrentAngle(nextAngle);
      setCurrentAngleIndex(currentIndex + 1);
    } else {
      // All angles completed
      setTimeout(() => {
        setCharacterValidationStage('complete');
        onComplete();
      }, 1000);
    }
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

  const progressPercent = angleGenerationMethod === 'turnaround'
    ? (isGenerating ? 50 : completedAngles.size === selectedAngles.length ? 100 : 0)
    : ((completedAngles.size * 100) / selectedAngles.length);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 cinematic-gradient relative overflow-hidden">
      {/* Large Background Text */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <h1 className="text-[20vw] md:text-[18vw] font-light text-white/10 tracking-tighter select-none whitespace-nowrap leading-none">
          Generate
        </h1>
      </div>

      <div className="relative z-10 w-full max-w-5xl mx-auto">
        <ProgressIndicator currentStage="angle-generation" totalStages={5} />

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            {angleGenerationMethod === 'turnaround' ? 'Generating Turnaround Sheet' : 'Generating Angle References'}
          </h1>
          <p className="text-white/60">
            {angleGenerationMethod === 'turnaround'
              ? 'Creating a comprehensive reference sheet with all selected angles'
              : `Processing angle ${currentAngleIndex + 1} of ${selectedAngles.length}`
            }
          </p>
        </div>

        <div className="rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl p-8 space-y-6">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-white/60">
              <span>Progress</span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-2">
              <div
                className="bg-white h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Current Angle Info */}
          {angleGenerationMethod === 'sequential' && currentAngle && (
            <div className="text-center">
              <h2 className="text-xl font-semibold text-white mb-2">
                {ANGLE_DEFINITIONS[currentAngle].label}
              </h2>
              <div className="flex justify-center space-x-2 mb-4">
                {selectedAngles.map((angle, index) => (
                  <div
                    key={angle}
                    className={`w-3 h-3 rounded-full ${
                      completedAngles.has(angle)
                        ? 'bg-green-500'
                        : angle === currentAngle
                        ? 'bg-white'
                        : 'bg-white/30'
                    }`}
                    title={ANGLE_DEFINITIONS[angle].label}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Generated Image Preview */}
          {generatedImage && (
            <div className="text-center">
              <div className="relative max-w-md mx-auto">
                <ImagePreview
                  src={generatedImage}
                  alt={currentAngle ? ANGLE_DEFINITIONS[currentAngle].label : 'Generated reference'}
                  badge={angleGenerationMethod === 'sequential' && currentAngle ? ANGLE_DEFINITIONS[currentAngle].label : undefined}
                />
              </div>
            </div>
          )}

          {/* Feedback Input (for sequential mode) */}
          {angleGenerationMethod === 'sequential' && generatedImage && (
            <div className="space-y-3">
              <label className="text-sm font-medium text-white">
                Refinement Instructions (Optional)
              </label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="E.g., more dramatic lighting, adjust angle slightly..."
                rows={3}
                className="w-full rounded-lg border border-white/20 bg-white/[0.02] px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/40 focus:bg-white/[0.05] backdrop-blur-sm transition-all resize-none"
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-4">
            {/* Generate Button */}
            {angleGenerationMethod === 'sequential' && !generatedImage && !isGenerating && (
              <button
                onClick={generateCurrentAngle}
                disabled={isGenerating}
                className="w-full px-6 py-3 rounded-full bg-white text-black text-base font-semibold hover:bg-white/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    Generate {currentAngle ? ANGLE_DEFINITIONS[currentAngle].label : 'Angle'}
                  </>
                )}
              </button>
            )}

            {/* Upscale Button */}
            {generatedImage && (
              <button
                onClick={handleUpscaleAndConfirm}
                disabled={isGenerating || upscaleState.isProcessing || backgroundRemovalState.isProcessing || splitState.isProcessing}
                className="w-full px-6 py-3 rounded-full bg-white text-black text-base font-semibold hover:bg-white/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {(isGenerating || upscaleState.isProcessing || backgroundRemovalState.isProcessing || splitState.isProcessing) ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Process & Continue
                  </>
                )}
              </button>
            )}

            {/* Regenerate Button */}
            {generatedImage && !isGenerating && angleGenerationMethod === 'sequential' && (
              <button
                onClick={generateCurrentAngle}
                className="w-full px-4 py-2 rounded-lg border border-white/20 text-white text-sm hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Regenerate with Feedback
              </button>
            )}

            {/* Skip Option */}
            <div className="flex justify-center">
              <button
                onClick={handleSkip}
                className="px-6 py-3 rounded-full border border-white/20 text-white text-base font-medium hover:bg-white/10 transition-colors"
              >
                Skip to Workspace
              </button>
            </div>
          </div>

          {/* Error Display */}
          <ErrorDisplay
            error={generationError || upscaleState.error || backgroundRemovalState.error || splitState.error || null}
            onDismiss={() => setGenerationError(null)}
          />
        </div>
      </div>
    </div>
  );
}
