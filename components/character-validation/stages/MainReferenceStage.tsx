'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useProjectStore } from '@/lib/state/project-store';
import { RefreshCw, Upload, Edit, Loader2, Check } from 'lucide-react';
import type { AngleType } from '../types';
import { GENERATION_PROMPTS } from '../constants';
import { useImageGeneration } from '../hooks/useImageGeneration';
import { useImageProcessing } from '../hooks/useImageProcessing';
import { ProgressIndicator } from '../shared/ProgressIndicator';
import { ErrorDisplay } from '../shared/ErrorDisplay';
import { ImagePreview } from '../shared/ImagePreview';
import { ActionButtons } from '../shared/ActionButtons';
import type { MainReferenceStageProps } from '../types';

export function MainReferenceStage({ onContinue }: MainReferenceStageProps) {
  const router = useRouter();
  const {
    project,
    mainReferenceImage,
    characterReferenceModel,
    setMainReferenceImage,
    setCharacterValidationStage,
    setUploadedImageUrls,
  } = useProjectStore();

  const [mode, setMode] = useState<'select' | 'iterate' | 'generate'>('select');
  const [selectedUploadedImage, setSelectedUploadedImage] = useState<string | null>(null);
  const [upscaledImage, setUpscaledImage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  const { 
    isGenerating, 
    generatedImage,
    error: generationError, 
    generateImage, 
    setGeneratedImage,
    setError: setGenerationError,
    clearState
  } = useImageGeneration();
  const { uploadState, upscaleState, uploadImages, upscaleImage } = useImageProcessing();

  // Handler to select an uploaded reference image
  const handleSelectUploadedImage = (imageUrl: string) => {
    setSelectedUploadedImage(imageUrl);
    setMode('iterate');
    // Reset iteration state
    clearState();
    setUpscaledImage(null);
    setFeedback('');
    setGenerationError(null);
  };

  // Handler for file upload
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !project?.id) return;

    const result = await uploadImages(files, project.id);
    if (result.success && result.images) {
      // Extract URLs from uploaded images
      const uploadedUrls = result.images.map(img => img.url);

      // Update uploaded images in the project store
      const existingUrls = project.uploadedImageUrls || [];
      const allUrls = [...existingUrls, ...uploadedUrls];
      setUploadedImageUrls(allUrls);

      // Select the first uploaded image
      const firstUploadedUrl = uploadedUrls[0];
      setSelectedUploadedImage(firstUploadedUrl);
      setMode('iterate');
    }
  };

  // Handler to start generating from scratch
  const handleStartGeneration = () => {
    setMode('generate');
    setSelectedUploadedImage(null);
    clearState();
    setUpscaledImage(null);
    setFeedback('');
    setGenerationError(null);
  };

  // Generate from scratch (no reference image)
  const handleGenerateFromScratch = async () => {
    if (!project?.characterDescription || !project.id) return;

    // Build prompt with feedback if provided
    let prompt = project.characterDescription;
    if (feedback.trim()) {
      prompt += `. ${feedback.trim()}`;
    }

    // Add automotive/product photography context
    prompt += GENERATION_PROMPTS.automotiveContext;

    // Build reference image URLs array
    const referenceImageUrls = selectedUploadedImage
      ? [selectedUploadedImage, ...(project.uploadedImageUrls?.filter(url => url !== selectedUploadedImage) || [])]
      : (project.uploadedImageUrls || []);

    console.log('[MainReferenceStage] Using reference images:', referenceImageUrls.length > 0 ? referenceImageUrls : 'none');

    await generateImage({
      prompt,
      projectId: project.id,
      sceneIndex: 0,
      referenceImageUrls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
      model: characterReferenceModel
    });
  };

  // Generate iteration based on selected reference image
  const handleGenerateIteration = async () => {
    if (!project?.characterDescription || !project.id || !selectedUploadedImage) return;

    // Build prompt with feedback if provided
    let prompt = project.characterDescription;
    if (feedback.trim()) {
      prompt += `. ${feedback.trim()}`;
    }

    // Add automotive/product photography context
    prompt += GENERATION_PROMPTS.automotiveContext;

    await generateImage({
      prompt,
      projectId: project.id,
      sceneIndex: 0,
      referenceImageUrls: [selectedUploadedImage, ...(project.uploadedImageUrls?.filter(url => url !== selectedUploadedImage) || [])],
      model: characterReferenceModel
    });
  };

  // Upscale and confirm
  const handleUpscaleAndConfirm = async () => {
    if (!generatedImage || !project?.id) return;

    const imageToUpscale = upscaledImage || generatedImage;
    const result = await upscaleImage([imageToUpscale], project.id);

    if (result.success && result.upscaledImages?.[0]) {
      const finalImage = result.upscaledImages[0];

      // Create CharacterReferenceImage object
      const promptUsed = mode === 'generate'
        ? (feedback.trim() ? feedback.trim() : project.characterDescription)
        : (project.characterDescription + (feedback ? `. ${feedback}` : ''));

      const characterImage = {
        id: finalImage.id || `main-ref-${Date.now()}`,
        url: finalImage.url,
        localPath: finalImage.localPath || '',
        prompt: promptUsed || '',
        replicateId: '',
        createdAt: new Date().toISOString(),
        angleType: 'front' as AngleType,
        generationModel: characterReferenceModel,
        isUpscaled: true,
        originalPrompt: project.characterDescription || '',
      };

      // Store in project store
      setMainReferenceImage(characterImage);
      setUpscaledImage(finalImage.url);
      setIsComplete(true);
    }
  };

  // Handler to use the selected uploaded image directly (skip iteration)
  const handleUseSelectedImageDirectly = async () => {
    if (!selectedUploadedImage || !project?.id) return;

    const result = await upscaleImage([selectedUploadedImage], project.id);
    if (result.success && result.upscaledImages?.[0]) {
      const finalImage = result.upscaledImages[0];

      // Create CharacterReferenceImage object
      const characterImage = {
        id: finalImage.id || `main-ref-${Date.now()}`,
        url: finalImage.url,
        localPath: finalImage.localPath || '',
        prompt: project.characterDescription || '',
        replicateId: '',
        createdAt: new Date().toISOString(),
        angleType: 'front' as AngleType,
        generationModel: characterReferenceModel,
        isUpscaled: true,
        originalPrompt: project.characterDescription || '',
      };

      // Store in project store
      setMainReferenceImage(characterImage);
      setUpscaledImage(finalImage.url);
      setIsComplete(true);
    }
  };

  const handleContinue = () => {
    setCharacterValidationStage('angle-selection');
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
  }, [router, project?.id]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 cinematic-gradient relative overflow-hidden">
      {/* Large Background Text */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <h1 className="text-[20vw] md:text-[18vw] font-light text-white/10 tracking-tighter select-none whitespace-nowrap leading-none">
          Generate
        </h1>
      </div>

      <div className="relative z-10 w-full max-w-5xl mx-auto">
        <ProgressIndicator currentStage="main-reference" totalStages={5} />

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Generate Main Reference
          </h1>
          <p className="text-white/60">
            {mode === 'select'
              ? 'Upload a reference image, generate one, or select from existing'
              : mode === 'generate'
              ? 'Generate a new reference image from your character description'
              : 'Iterate on your selected reference or use it directly'
            }
          </p>
        </div>

        <div className="rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl p-8 space-y-6">

          {/* Mode 1: Select from uploaded reference images OR upload new OR generate */}
          {mode === 'select' && (
            <>
              {/* Action Buttons for Upload and Generate */}
              <div className="flex gap-4 mb-6">
                <label className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleFileUpload(e.target.files)}
                    className="hidden"
                    disabled={uploadState.isProcessing}
                  />
                  <button
                    type="button"
                    disabled={uploadState.isProcessing}
                    onClick={(e) => {
                      e.preventDefault();
                      const input = e.currentTarget.parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
                      input?.click();
                    }}
                    className="w-full px-6 py-4 rounded-xl border-2 border-white/40 bg-white/5 text-white text-base font-semibold hover:bg-white/10 hover:border-white/60 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                  >
                    {uploadState.isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5" />
                        Upload Reference Image
                      </>
                    )}
                  </button>
                </label>

                <button
                  onClick={handleStartGeneration}
                  disabled={uploadState.isProcessing || isGenerating}
                  className="flex-1 px-6 py-4 rounded-xl border-2 border-white/40 bg-white/5 text-white text-base font-semibold hover:bg-white/10 hover:border-white/60 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                >
                  <Edit className="w-5 h-5" />
                  Generate New Reference
                </button>
              </div>

              {/* Show existing uploaded images if available */}
              {project?.uploadedImageUrls && project.uploadedImageUrls.length > 0 && (
                <div className="space-y-4">
                  <div className="border-t border-white/20 pt-4">
                    <h2 className="text-lg font-semibold text-white mb-2">Or Choose from Existing</h2>
                    <p className="text-sm text-white/60 mb-4">
                      Select one of your uploaded reference images (backgrounds already removed)
                    </p>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                    {project.uploadedImageUrls.map((url, index) => (
                      <ImagePreview
                        key={index}
                        src={url}
                        alt={`Reference ${index + 1}`}
                        onClick={() => handleSelectUploadedImage(url)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* No images available - show helpful message */}
              {(!project?.uploadedImageUrls || project.uploadedImageUrls.length === 0) && !uploadState.isProcessing && (
                <div className="text-center py-12 border-t border-white/20">
                  <p className="text-white/60 mb-2">No reference images available yet</p>
                  <p className="text-white/40 text-sm">Upload an image or generate one to get started</p>
                </div>
              )}
            </>
          )}

          {/* Mode 2: Generate from scratch */}
          {mode === 'generate' && (
            <>
              {/* Show generated image if exists */}
              {(generatedImage || upscaledImage) && (
                <div className="text-center">
                  <h2 className="text-lg font-semibold text-white mb-4">
                    {upscaledImage ? 'Your Main Reference' : 'Generated Image'}
                  </h2>
                  <div className="relative max-w-md mx-auto">
                    <ImagePreview
                      src={upscaledImage || generatedImage!}
                      alt="Generated reference"
                      badge={upscaledImage ? 'Ready' : undefined}
                    />
                  </div>
                </div>
              )}

              {/* Show uploaded images for selection BEFORE generating (if no image generated yet) */}
              {!generatedImage && !upscaledImage && project?.uploadedImageUrls && project.uploadedImageUrls.length > 0 && (
                <div className="space-y-4">
                  <div className="border-t border-white/20 pt-4">
                    <h2 className="text-lg font-semibold text-white mb-2">Reference Images (Optional)</h2>
                    <p className="text-sm text-white/60 mb-4">
                      Select an image to use as the primary reference for generation, or leave unselected to generate without reference
                    </p>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                    {project.uploadedImageUrls.map((url, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          // Toggle selection
                          if (selectedUploadedImage === url) {
                            setSelectedUploadedImage(null);
                          } else {
                            setSelectedUploadedImage(url);
                          }
                        }}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 ${
                          selectedUploadedImage === url
                            ? 'border-white ring-2 ring-white/40'
                            : 'border-white/20'
                        } hover:border-white hover:scale-105 transition-all cursor-pointer group`}
                      >
                        <img
                          src={url}
                          alt={`Reference ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {selectedUploadedImage === url && (
                          <div className="absolute top-2 right-2 bg-white text-black text-xs px-2 py-1 rounded font-semibold">
                            Selected
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-white text-sm font-medium">
                            {selectedUploadedImage === url ? 'Deselect' : 'Select'}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                  {selectedUploadedImage && (
                    <p className="text-xs text-green-400">
                      ✓ This image will be used as the primary reference for generation
                    </p>
                  )}
                </div>
              )}

              {/* Generation controls */}
              {!isComplete && (
                <>
                  {/* Prompt/Feedback Input */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-white">
                      {generatedImage ? 'Refinement Feedback (Optional)' : 'Generation Prompt'}
                    </label>
                    <textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder={generatedImage
                        ? "E.g., more dramatic lighting, different angle, specific style preferences..."
                        : `Describe the reference you want to generate or leave empty to use: "${project?.characterDescription || 'default description'}"`
                      }
                      rows={4}
                      className="w-full rounded-lg border border-white/20 bg-white/[0.02] px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/40 focus:bg-white/[0.05] backdrop-blur-sm transition-all resize-none"
                    />
                    {!generatedImage && (
                      <p className="text-xs text-white/40">
                        Character description: {project?.characterDescription || 'Not set'}
                      </p>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-3">
                    {/* Generate button */}
                    {!generatedImage && (
                      <button
                        onClick={handleGenerateFromScratch}
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
                            Generate Reference Image
                          </>
                        )}
                      </button>
                    )}

                    {/* Upscale generated image */}
                    {generatedImage && !upscaledImage && (
                      <button
                        onClick={handleUpscaleAndConfirm}
                        disabled={upscaleState.isProcessing}
                        className="w-full px-6 py-3 rounded-full bg-white text-black text-base font-semibold hover:bg-white/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {upscaleState.isProcessing ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Upscaling...
                          </>
                        ) : (
                          <>
                            Upscale & Confirm
                          </>
                        )}
                      </button>
                    )}

                    {/* Regenerate with new feedback */}
                    {generatedImage && !upscaleState.isProcessing && (
                      <button
                        onClick={handleGenerateFromScratch}
                        disabled={isGenerating}
                        className="w-full px-4 py-2 rounded-lg border border-white/20 text-white text-sm hover:bg-white/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                        Regenerate with New Feedback
                      </button>
                    )}

                    {/* Back to selection */}
                    {!isGenerating && !upscaleState.isProcessing && (
                      <button
                        onClick={() => setMode('select')}
                        className="w-full px-4 py-2 rounded-lg border border-white/20 text-white text-sm hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
                      >
                        Back to Selection
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* Mode 3: Iterate or use selected image */}
          {mode === 'iterate' && selectedUploadedImage && (
            <>
              {/* Show selected image */}
              <div className="text-center">
                <h2 className="text-lg font-semibold text-white mb-4">
                  Selected Reference Image
                </h2>
                <div className="relative max-w-md mx-auto">
                  <ImagePreview
                    src={selectedUploadedImage}
                    alt="Selected reference"
                  />
                  <button
                    onClick={() => {
                      setMode('select');
                      setSelectedUploadedImage(null);
                      clearState();
                      setUpscaledImage(null);
                      setFeedback('');
                    }}
                    className="absolute top-2 right-2 bg-white/20 hover:bg-white/30 text-white text-xs px-3 py-1.5 rounded backdrop-blur-sm transition-colors"
                  >
                    Change
                  </button>
                </div>
              </div>

              {/* Show generated iteration if exists */}
              {(generatedImage || upscaledImage) && (
                <div className="text-center">
                  <h2 className="text-lg font-semibold text-white mb-4">
                    {upscaledImage ? 'Your Refined Reference' : 'Generated Iteration'}
                  </h2>
                  <div className="relative max-w-md mx-auto">
                    <ImagePreview
                      src={upscaledImage || generatedImage!}
                      alt="Generated iteration"
                      badge={upscaledImage ? 'Ready' : undefined}
                    />
                  </div>
                </div>
              )}

              {/* Iteration controls */}
              {!isComplete && (
                <>
                  {/* Feedback Input */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-white">
                      Refinement Feedback (Optional)
                    </label>
                    <textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="E.g., more dramatic lighting, different angle, specific style preferences..."
                      rows={3}
                      className="w-full rounded-lg border border-white/20 bg-white/[0.02] px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/40 focus:bg-white/[0.05] backdrop-blur-sm transition-all resize-none"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-3">
                    {/* Use selected image directly */}
                    {!generatedImage && (
                      <button
                        onClick={handleUseSelectedImageDirectly}
                        disabled={upscaleState.isProcessing}
                        className="w-full px-6 py-3 rounded-full bg-white text-black text-base font-semibold hover:bg-white/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {upscaleState.isProcessing ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            Use This Image
                          </>
                        )}
                      </button>
                    )}

                    {/* Generate iteration */}
                    {!generatedImage && !upscaleState.isProcessing && (
                      <button
                        onClick={handleGenerateIteration}
                        disabled={isGenerating}
                        className="w-full px-4 py-2 rounded-lg border border-white/20 text-white text-sm hover:bg-white/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Generating Iteration...
                          </>
                        ) : (
                          <>
                            Generate Refined Version
                          </>
                        )}
                      </button>
                    )}

                    {/* Upscale generated iteration */}
                    {generatedImage && !upscaledImage && (
                      <button
                        onClick={handleUpscaleAndConfirm}
                        disabled={upscaleState.isProcessing}
                        className="w-full px-6 py-3 rounded-full bg-white text-black text-base font-semibold hover:bg-white/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {upscaleState.isProcessing ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Upscaling...
                          </>
                        ) : (
                          <>
                            Upscale & Confirm
                          </>
                        )}
                      </button>
                    )}

                    {/* Regenerate with new feedback */}
                    {generatedImage && !upscaleState.isProcessing && (
                      <button
                        onClick={handleGenerateIteration}
                        disabled={isGenerating}
                        className="w-full px-4 py-2 rounded-lg border border-white/20 text-white text-sm hover:bg-white/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                        Regenerate with New Feedback
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* Complete State */}
          {isComplete && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-white">Reference Image Ready!</h3>
              <p className="text-white/60">Your main reference image has been processed and stored.</p>
            </div>
          )}

          {/* Action Buttons */}
          <ActionButtons
            onSkip={handleSkip}
            onContinue={isComplete ? handleContinue : undefined}
            continueText="Continue to Angles"
            showSkip={true}
          />

          {/* Error Display */}
          <ErrorDisplay
            error={generationError || uploadState.error || upscaleState.error || null}
            onDismiss={() => {
              setGenerationError(null);
              // Clear processing errors
            }}
          />
        </div>
      </div>
    </div>
  );
}
