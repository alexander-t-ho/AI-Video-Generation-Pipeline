'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useProjectStore } from '@/lib/state/project-store';
import { X, RefreshCw, Check, Loader2, Upload } from 'lucide-react';

interface CharacterImage {
  id: string;
  url: string;
  selected: boolean;
  isUploaded?: boolean;
  type?: 'turnaround' | 'closeup' | 'full-body' | 'detail';
  angle?: number; // 0-360 degrees
  scale?: 'full' | 'medium' | 'close';
  dominantColors?: string[];
}

interface FeedbackState {
  styleValue: number; // 0 = Cartoon, 100 = Realistic
  detailedValue: number; // 0 = Simplified, 100 = Detailed
  colorfulValue: number; // 0 = Muted, 100 = Colorful
  qualityValue: number; // 0 = Sketch, 100 = High Detail
  textFeedback: string;
}

export default function CharacterValidationScreen() {
  const router = useRouter();
  const { 
    project, 
    setCharacterReferences, 
    hasUploadedImages,
    setUploadedImageUrls,
    setCharacterDescription,
  } = useProjectStore();

  const [characterImages, setCharacterImages] = useState<CharacterImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isProcessingUploads, setIsProcessingUploads] = useState(false);
  const [additionalImages, setAdditionalImages] = useState<File[]>([]);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(true); // Show confirmation first
  const [editingDescription, setEditingDescription] = useState(false);
  const [tempDescription, setTempDescription] = useState(''); // Editing buffer for clean description
  const [cleanDescription, setCleanDescription] = useState<string>(''); // Extracted clean description for display
  const [isExtractingDescription, setIsExtractingDescription] = useState(false);
  const [hasAttemptedExtraction, setHasAttemptedExtraction] = useState(false); // Prevent infinite loops
  const [feedback, setFeedback] = useState<FeedbackState>({
    styleValue: 50,
    detailedValue: 50,
    colorfulValue: 50,
    qualityValue: 75,
    textFeedback: '',
  });
  const [showFeedbackPanel, setShowFeedbackPanel] = useState(false);

  const handleSkip = useCallback(() => {
    // Skip character validation and go directly to workspace
    if (!project?.id) {
      console.error('Cannot skip: Project ID is missing');
      // Try to get project from store state
      const storeProject = useProjectStore.getState().project;
      if (storeProject?.id) {
        router.push(`/workspace?projectId=${storeProject.id}`);
      } else {
        // No project available, redirect to home
        router.push('/');
      }
      return;
    }
    router.push(`/workspace?projectId=${project.id}`);
  }, [router, project?.id]);

  const processUploadedImages = useCallback(async () => {
    if (!project?.uploadedImageUrls) return;

    setIsProcessingUploads(true);
    setGenerationError(null);

    try {
      // Remove background from uploaded images
      const response = await fetch('/api/remove-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrls: project.uploadedImageUrls,
          projectId: project.id,
        }),
      });

      const data = await response.json();

      if (data.success && data.processedImages) {
        setCharacterImages(
          data.processedImages.map((img: { id: string; url: string }, index: number) => ({
            id: img.id,
            url: img.url,
            selected: index === 0, // Auto-select first one
            isUploaded: true,
          }))
        );
        // Auto-select first image
        if (data.processedImages.length > 0) {
          setSelectedImageId(data.processedImages[0].id);
        }
      } else {
        throw new Error(data.error || 'Failed to process uploaded images');
      }
    } catch (error) {
      console.error('Error processing uploaded images:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setGenerationError(`Failed to process images: ${errorMessage}`);
      
      // Use original uploaded images as fallback
      if (project?.uploadedImageUrls) {
        setCharacterImages(
          project.uploadedImageUrls.map((url, index) => ({
            id: `uploaded-${index}`,
            url,
            selected: index === 0,
            isUploaded: true,
          }))
        );
        if (project.uploadedImageUrls.length > 0) {
          setSelectedImageId('uploaded-0');
        }
      }
    } finally {
      setIsProcessingUploads(false);
    }
  }, [project?.uploadedImageUrls, project?.id]);

  const generateCharacterVariations = useCallback(async () => {
    if (!project?.characterDescription) return;

    setIsGenerating(true);
    setGenerationError(null);

    try {
      // Build style-aware prompt based on feedback
      const stylePrompt = buildStylePrompt(project.characterDescription, feedback);

      // Generate 5 character variations based on reference photos
      // Images are NOT upscaled yet - upscaling happens after user selection
      const response = await fetch('/api/generate-character-variations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: stylePrompt,
          projectId: project.id,
          count: 5, // Generate 5 variations for user selection
          referenceImages: project.uploadedImageUrls || [], // Base on user's reference photos
        }),
      });

      const data = await response.json();

      if (!data.success || !data.images) {
        throw new Error(data.error || 'Failed to generate character variations');
      }

      // Extract URLs from generated images
      const generatedUrls = data.images.map((img: any) => img.url);
      
      // Step 1: Remove backgrounds from all generated images
      const bgRemovalResponse = await fetch('/api/remove-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrls: generatedUrls,
          projectId: project.id,
        }),
      });

      const bgRemovalData = await bgRemovalResponse.json();

      if (bgRemovalData.success && bgRemovalData.processedImages) {
        // Use processed images (background removed, NOT upscaled yet)
        // Upscaling will happen in background after user confirms selection
        setCharacterImages(
          bgRemovalData.processedImages.map((img: { id: string; url: string }, index: number) => {
            const originalMetadata = data.images[index];
            return {
              id: img.id,
              url: img.url,
              selected: false, // User will select which ones they want
              isUploaded: false,
              type: originalMetadata?.type || 'turnaround',
              angle: originalMetadata?.angle || 0,
              scale: originalMetadata?.scale || 'full',
            };
          })
        );
      } else {
        // Fallback: use original generated images without background removal
        console.warn('[CharacterValidation] Background removal failed, using original images');
        setCharacterImages(
          data.images.map((img: any, index: number) => ({
            id: img.id,
            url: img.url,
            selected: false, // User will select which ones they want
            isUploaded: false,
            type: img.type || 'turnaround',
            angle: img.angle || 0,
            scale: img.scale || 'full',
          }))
        );
      }
    } catch (error) {
      console.error('Error generating character variations:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setGenerationError(`Failed to generate characters: ${errorMessage}`);
    } finally {
      setIsGenerating(false);
    }
  }, [project?.characterDescription, project?.id, feedback]);

  // Initialize on mount - wait for user confirmation before generation
  useEffect(() => {
    // Don't auto-start generation - wait for user confirmation
    // Just show the confirmation screen with description and reference images
  }, []);

  // Check if project exists on mount
  useEffect(() => {
    if (!project) {
      console.warn('CharacterValidationScreen: No project found, redirecting to home');
      router.push('/');
      return;
    }
  }, [project, router]);

  // Extract clean character description from full prompt on mount (Issue #1 fix: runs once)
  useEffect(() => {
    const extractCleanDescription = async () => {
      // Only run once to prevent infinite loops
      if (!project?.characterDescription || hasAttemptedExtraction) {
        // If no character description, set fallback
        if (!project?.characterDescription && !hasAttemptedExtraction) {
          setHasAttemptedExtraction(true);
          setCleanDescription('Character from your video prompt');
          setTempDescription('Character from your video prompt');
        }
        return;
      }
      
      setHasAttemptedExtraction(true);
      setIsExtractingDescription(true);
      
      try {
        const response = await fetch('/api/extract-character-description', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullPrompt: project.characterDescription }),
        });

        const data = await response.json();
        if (data.success && data.characterDescription) {
          setCleanDescription(data.characterDescription);
          setTempDescription(data.characterDescription); // Initialize edit buffer with clean description (Issue #9 fix)
        } else {
          // Fallback: use first sentence instead of full prompt (Issue #6 fix)
          const firstSentence = project.characterDescription.split(/[.!?]/)[0].trim();
          const fallback = firstSentence || 'Character from your video prompt';
          setCleanDescription(fallback);
          setTempDescription(fallback);
        }
      } catch (error) {
        console.error('Failed to extract clean description:', error);
        // Fallback: use first sentence instead of full prompt (Issue #6 fix)
        const firstSentence = project.characterDescription.split(/[.!?]/)[0].trim();
        const fallback = firstSentence || 'Character from your video prompt';
        setCleanDescription(fallback);
        setTempDescription(fallback);
      } finally {
        setIsExtractingDescription(false);
      }
    };

    extractCleanDescription();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  const handleEditDescription = () => {
    setEditingDescription(true);
    // tempDescription is already set to cleanDescription from extraction
  };

  const handleSaveDescription = () => {
    // Issue #2 fix: When saving edited description, update both clean and full descriptions
    // and re-extract to stay in sync
    setCleanDescription(tempDescription);
    setCharacterDescription(tempDescription); // Update the full description in store
    setEditingDescription(false);
    
    // Reset extraction flag so it can re-extract if needed
    setHasAttemptedExtraction(false);
  };

  const handleCancelEdit = () => {
    // Reset to the current clean description
    setTempDescription(cleanDescription);
    setEditingDescription(false);
  };

  const handleConfirmGeneration = () => {
    // User confirmed - start generation
    if (!project?.id) {
      console.error('Cannot start generation: Project ID is missing');
      // Try to get project from store state
      const storeProject = useProjectStore.getState().project;
      if (storeProject?.id) {
        // Still navigate to workspace even without generation
        router.push(`/workspace?projectId=${storeProject.id}`);
      } else {
        // No project available, redirect to home
        router.push('/');
      }
      return;
    }
    
    setShowConfirmation(false);
    
    if (hasUploadedImages && project?.uploadedImageUrls && project.uploadedImageUrls.length > 0) {
      // Process uploaded images - remove background
      processUploadedImages();
    } else if (project?.characterDescription) {
      // Generate character variations
      generateCharacterVariations();
    } else {
      // No validation needed
      handleSkip();
    }
  };

  const buildStylePrompt = (description: string, feedback: FeedbackState): string => {
    const parts: string[] = [description];

    // Style (Cartoon vs Realistic)
    if (feedback.styleValue < 40) {
      parts.push('cartoon style, animated, stylized');
    } else if (feedback.styleValue > 60) {
      parts.push('photorealistic, hyper-realistic, detailed photography');
    }

    // Detail level
    if (feedback.detailedValue < 40) {
      parts.push('simplified, clean, minimal details');
    } else if (feedback.detailedValue > 60) {
      parts.push('highly detailed, intricate, complex');
    }

    // Color
    if (feedback.colorfulValue < 40) {
      parts.push('muted colors, desaturated, subtle tones');
    } else if (feedback.colorfulValue > 60) {
      parts.push('vibrant colors, saturated, bold palette');
    }

    // Quality
    if (feedback.qualityValue < 40) {
      parts.push('sketch-like, loose, artistic');
    } else if (feedback.qualityValue > 60) {
      parts.push('high quality, crisp, professional');
    }

    // Text feedback
    if (feedback.textFeedback.trim()) {
      parts.push(feedback.textFeedback.trim());
    }

    // Background removal instruction
    parts.push('isolated subject, clean background, white or transparent background');

    return parts.join(', ');
  };

  const handleImageSelect = (imageId: string) => {
    // Toggle selection (allow multiple selections)
    setCharacterImages((prev) =>
      prev.map((img) => ({
        ...img,
        selected: img.id === imageId ? !img.selected : img.selected,
      }))
    );
    
    // Track selected IDs for convenience
    const newSelected = characterImages.find(img => img.id === imageId);
    if (newSelected?.selected) {
      // Deselecting
      setSelectedImageId(null);
    } else {
      // Selecting
      setSelectedImageId(imageId);
    }
  };

  const handleRegenerate = () => {
    generateCharacterVariations();
  };

  const handleUploadAdditional = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(file => 
      file.type.startsWith('image/')
    );
    
    const availableSlots = 3 - characterImages.length;
    const newImages = files.slice(0, availableSlots);
    setAdditionalImages((prev) => [...prev, ...newImages].slice(0, availableSlots));
  };

  const removeAdditionalImage = (index: number) => {
    setAdditionalImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConfirm = async () => {
    // Get all selected images
    const selectedImages = characterImages.filter((img) => img.selected);

    if (selectedImages.length === 0) {
      alert('Please select at least one character variation');
      return;
    }

    if (!project?.id) {
      console.error('[CharacterValidation] No project ID available');
      alert('Error: Project not found. Please try again.');
      return;
    }

    // Process and upload any additional reference images
    const additionalImageUrls: string[] = [];

    if (additionalImages.length > 0) {
      try {
        const formData = new FormData();
        additionalImages.forEach((file) => {
          formData.append('images', file);
        });
        formData.append('projectId', project.id);

        const uploadResponse = await fetch('/api/upload-images', {
          method: 'POST',
          body: formData,
        });

        const uploadData = await uploadResponse.json();
        if (uploadData.success && uploadData.urls) {
          additionalImageUrls.push(...uploadData.urls);
        }
      } catch (error) {
        console.error('Error uploading additional images:', error);
      }
    }

    // Get URLs of selected images (not upscaled yet)
    const selectedImageUrls = selectedImages.map(img => img.url);
    
    // Set character references in store (non-upscaled for now)
    const allReferences = [...selectedImageUrls, ...additionalImageUrls];
    setCharacterReferences(allReferences);

    // Ensure project is in store before navigating
    // The project should already be in store from StartingScreen, but verify
    const currentProject = useProjectStore.getState().project;
    if (!currentProject || currentProject.id !== project.id) {
      console.error('[CharacterValidation] Project not in store, cannot navigate to workspace');
      alert('Error: Project state lost. Please try creating a new project.');
      return;
    }

    // Wait a moment to ensure store is updated, then navigate
    await new Promise(resolve => setTimeout(resolve, 100));

    // Navigate to workspace
    router.push(`/workspace?projectId=${project.id}`);

    // Upscale selected images in the background (non-blocking)
    console.log(`[CharacterValidation] Upscaling ${selectedImages.length} selected images in background...`);
    upscaleInBackground(selectedImageUrls);
  };

  // Background upscaling function (doesn't block navigation)
  const upscaleInBackground = async (imageUrls: string[]) => {
    try {
      const response = await fetch('/api/upscale-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrls,
          projectId: project?.id,
        }),
      });

      const data = await response.json();
      if (data.success && data.upscaledImages) {
        console.log(`[CharacterValidation] Successfully upscaled ${data.upscaledImages.length} images in background`);
        // TODO: Update project store with upscaled versions when needed
      } else {
        console.warn('[CharacterValidation] Background upscaling failed, continuing with non-upscaled images');
      }
    } catch (error) {
      console.error('[CharacterValidation] Background upscaling error:', error);
      // Fail silently - user has already proceeded with non-upscaled images
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 cinematic-gradient relative overflow-hidden">
      {/* Large Background Text - Monologue style */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <h1 className="text-[20vw] md:text-[18vw] font-light text-white/10 tracking-tighter select-none whitespace-nowrap leading-none">
          {showConfirmation ? 'Confirm' : 'Validate'}
        </h1>
      </div>

      <div className="relative z-10 w-full max-w-6xl mx-auto">
        {/* Issue #3 fix: Show loading state while extracting description */}
        {showConfirmation && isExtractingDescription ? (
          <div className="text-center">
            <div className="rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl p-12">
              <Loader2 className="w-12 h-12 text-white/60 animate-spin mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-white mb-2">Preparing Character Setup</h2>
              <p className="text-white/60">Analyzing your character description...</p>
            </div>
          </div>
        ) : showConfirmation ? (
          /* Confirmation Screen - Show after extraction completes */
          <>
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-white mb-2">
                Review Character Setup
              </h1>
              <p className="text-white/60">
                Review your character description and reference images before generation
              </p>
            </div>

            <div className="rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl p-8 space-y-6">
              {/* Character Description Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">Character Description</h2>
                  {!editingDescription && (
                    <button
                      onClick={handleEditDescription}
                      className="text-sm text-white/60 hover:text-white transition-colors"
                    >
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

              {/* Reference Images Section */}
              {project?.uploadedImageUrls && project.uploadedImageUrls.length > 0 && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold text-white">Reference Images</h2>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                    {project.uploadedImageUrls.map((url, index) => (
                      <div
                        key={index}
                        className="relative aspect-square rounded-lg overflow-hidden border-2 border-white/20"
                      >
                        <img
                          src={url}
                          alt={`Reference ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-white/60">
                    {project.uploadedImageUrls.length} reference image(s) will be used to generate character variations
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-white/20">
                <button
                  onClick={handleSkip}
                  className="px-6 py-3 rounded-full border border-white/20 text-white text-base font-medium hover:bg-white/10 transition-colors"
                >
                  Skip This Step
                </button>

                <button
                  onClick={handleConfirmGeneration}
                  className="px-8 py-3 rounded-full bg-white text-black text-base font-semibold hover:bg-white/90 transition-colors"
                >
                  Start Generation
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Generation/Selection Screen - Show after confirmation */
          <>
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            {hasUploadedImages ? 'Review Your Character' : 'Validate Your Character'}
          </h1>
          <p className="text-white/60">
            {hasUploadedImages 
              ? 'Review the character extracted from your images and add more if needed'
              : 'Select the character variation that best matches your vision, or regenerate with feedback'
            }
          </p>
        </div>

        {/* Main Card */}
        <div className="rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl p-8 space-y-6">
          {/* Character Description */}
          {project?.characterDescription && !hasUploadedImages && (
            <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/20">
              <p className="text-sm font-medium text-white/80">
                Character Description:
              </p>
              <p className="text-sm text-white/60 mt-1">
                {project.characterDescription}
              </p>
            </div>
          )}

          {/* Character Variations Grid */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                {hasUploadedImages ? 'Processed Images' : 'Generated Variations'}
              </h2>
              {characterImages.length > 0 && (
                <p className="text-sm text-white/60">
                  {characterImages.filter(img => img.selected).length} of {characterImages.length} selected
                </p>
              )}
            </div>

            {(isGenerating || isProcessingUploads) ? (
              <div className="grid grid-cols-5 gap-4">
                {/* 5 loading placeholders */}
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square bg-white/5 rounded-lg flex flex-col items-center justify-center border border-white/10 p-2"
                  >
                    <Loader2 className="w-6 h-6 text-white/40 animate-spin mb-2" />
                    <span className="text-[10px] text-white/30 text-center">
                      {i < 5 ? 'Generating' : 'Processing'}
                    </span>
                  </div>
                ))}
              </div>
            ) : characterImages.length > 0 ? (
              <div className="grid grid-cols-5 gap-4">
                {characterImages.map((image) => (
                  <button
                    key={image.id}
                    onClick={() => handleImageSelect(image.id)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                      image.selected
                        ? 'border-white ring-4 ring-white/20'
                        : 'border-white/20 hover:border-white/40'
                    }`}
                  >
                    <img
                      src={image.url}
                      alt="Character variation"
                      className="w-full h-full object-cover"
                    />
                    {image.selected && (
                      <div className="absolute top-2 right-2 w-6 h-6 bg-white rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-black" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center border-2 border-dashed border-white/20 rounded-lg bg-white/5">
                <p className="text-white/40 mb-3">No character variations generated yet</p>
                {generationError && (
                  <p className="text-sm text-white/30 mb-4">
                    Generation failed. You can try regenerating or skip this step.
                  </p>
                )}
                <button
                  onClick={handleSkip}
                  className="mt-2 px-6 py-2 rounded-full border border-white/20 text-white/70 text-sm hover:bg-white/10 hover:text-white transition-colors"
                >
                  Skip to Workspace
                </button>
              </div>
            )}
          </div>

          {/* Feedback Controls - Only show for generated variations */}
          {!hasUploadedImages && (
            <div className="mb-8 p-6 bg-white/5 rounded-lg border border-white/20">
            <h3 className="text-md font-semibold text-white mb-4">
              Adjust Style Preferences
            </h3>

            <div className="space-y-4">
              {/* Text Feedback */}
              <div>
                <label className="text-sm text-white/70 mb-2 block">
                  Additional Feedback
                </label>
                <textarea
                  value={feedback.textFeedback}
                  onChange={(e) => setFeedback({ ...feedback, textFeedback: e.target.value })}
                  placeholder="Describe any specific changes you'd like to see..."
                  rows={3}
                  className="w-full rounded-lg border border-white/20 bg-white/[0.02] px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/40 focus:bg-white/[0.05] backdrop-blur-sm transition-all resize-none"
                />
              </div>
            </div>

            {/* Regenerate Button */}
            <button
              onClick={handleRegenerate}
              disabled={isGenerating}
              className="mt-4 w-full px-4 py-2 rounded-full bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
              {isGenerating ? 'Generating...' : 'Regenerate with Feedback'}
            </button>
          </div>
          )}

          {/* Upload Additional References */}
          <div className="mb-8">
            <h3 className="text-md font-semibold text-white mb-4">
              Add Additional Reference Images{characterImages.length < 3 && ' (Optional)'}
            </h3>
            <p className="text-sm text-white/60 mb-3">
              Upload up to {3 - characterImages.length} additional reference images
            </p>
            
            <input
              type="file"
              id="additional-upload"
              accept="image/*"
              multiple
              onChange={handleUploadAdditional}
              className="hidden"
              disabled={characterImages.length >= 3}
            />
            
            <button
              type="button"
              onClick={() => document.getElementById('additional-upload')?.click()}
              disabled={characterImages.length >= 3}
              className="px-4 py-2 rounded-lg border-2 border-dashed border-white/20 text-sm text-white/70 hover:border-white/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Upload Images
            </button>
            
            {additionalImages.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {additionalImages.map((file, index) => (
                  <div
                    key={index}
                    className="relative w-20 h-20 rounded-lg overflow-hidden border-2 border-white/20"
                  >
                    <img
                      src={URL.createObjectURL(file)}
                      alt={`Additional ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => removeAdditionalImage(index)}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Button - No Skip */}
          <div className="flex items-center justify-between">
            {/* Skip Button - Left aligned */}
            <button
              onClick={handleSkip}
              disabled={isGenerating || isProcessingUploads}
              className="px-6 py-3 rounded-full border border-white/20 text-white text-base font-medium hover:bg-white/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Skip This Step
            </button>

            {/* Main Action Button - Right aligned */}
            <button
              onClick={handleConfirm}
              disabled={characterImages.filter(img => img.selected).length === 0}
              className="px-8 py-3 rounded-full bg-white text-black text-base font-semibold hover:bg-white/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {characterImages.filter(img => img.selected).length > 1 
                ? `Use ${characterImages.filter(img => img.selected).length} Characters` 
                : 'Use This Character'}
            </button>
          </div>

          {/* Error Display */}
          {generationError && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg backdrop-blur-sm animate-shake">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-sm text-red-400 font-medium">Generation Error</p>
                  <p className="text-sm text-red-300 mt-1">{generationError}</p>
                </div>
                <button
                  onClick={() => setGenerationError(null)}
                  className="text-red-400 hover:text-red-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-red-300/70 mt-2">
                You can skip this step or try regenerating.
              </p>
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
}

