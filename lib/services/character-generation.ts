/**
 * Character Generation Service
 *
 * This module provides a unified service interface for character generation,
 * supporting both batch turnaround generation and single iteration refinement.
 * It orchestrates the entire generation pipeline using optimized utilities.
 */

import { generateCharacterVariation } from '../ai/character-generator';
import { adjustPromptForCharacterReference } from '../utils/prompt-optimizer';
import { convertUrlsInParallel } from '../utils/url-converter';
import { setRuntimeImageModel } from '../ai/image-generator';

// ============================================================================
// Type Definitions
// ============================================================================

export interface CharacterGenerationOptions {
  description: string;
  projectId: string;
  count?: number;
  mode: 'batch' | 'single';
  generateTurnaround?: boolean;
  referenceImages?: string[];
  feedback?: string;
  selectedReferenceImage?: string;
  model?: string;
  ipAdapterScale?: number;
}

export interface CharacterVariation {
  id: string;
  url: string;
  type: 'turnaround' | 'closeup' | 'full-body' | 'detail';
  angle: number;
  scale: 'full' | 'medium' | 'close';
  metadata?: {
    prompt: string;
    model: string;
    replicateId: string;
  };
}

// ============================================================================
// Main Service Function
// ============================================================================

/**
 * Generates character variations using a unified service interface.
 * Supports both batch generation (turnaround sheets) and single iterations.
 *
 * @param options Character generation options
 * @returns Array of generated character variations
 */
export async function generateCharacterVariations(
  options: CharacterGenerationOptions
): Promise<CharacterVariation[]> {
  const {
    description,
    projectId,
    count = 5,
    mode,
    generateTurnaround = false,
    referenceImages = [],
    feedback,
    selectedReferenceImage,
    model,
    ipAdapterScale,
  } = options;

  const logPrefix = '[CharacterGenerationService]';
  console.log(`${logPrefix} Starting ${mode} character generation`);
  console.log(`${logPrefix} Description: ${description}`);
  console.log(`${logPrefix} Count: ${count}`);
  console.log(`${logPrefix} Mode: ${mode}`);
  console.log(`${logPrefix} Turnaround: ${generateTurnaround}`);
  console.log(`${logPrefix} Reference images: ${referenceImages.length}`);

  // Set runtime model if provided
  if (model) {
    setRuntimeImageModel(model);
    console.log(`${logPrefix} Using model: ${model}`);
  }

  // Convert reference image URLs in parallel for optimal performance
  const convertedRefs = await convertUrlsInParallel(referenceImages, projectId);

  // Build optimized prompt based on mode and reference images
  const hasReferenceImages = convertedRefs.length > 0;
  let optimizedDescription = description;

  if (mode === 'single' && feedback) {
    // For single iterations, incorporate user feedback
    optimizedDescription = adjustPromptForCharacterReference(
      description,
      hasReferenceImages,
      feedback
    );
    console.log(`${logPrefix} Incorporated feedback into prompt`);
  } else if (mode === 'batch' && hasReferenceImages) {
    // For batch generation with references, optimize for consistency
    optimizedDescription = adjustPromptForCharacterReference(
      description,
      true // Always true for batch mode to prioritize references
    );
    console.log(`${logPrefix} Optimized prompt for batch generation with references`);
  }

  // Determine generation parameters based on mode
  const generationCount = mode === 'batch' ? count : 1;
  const shouldGenerateTurnaround = mode === 'batch' && generateTurnaround;

  console.log(`${logPrefix} Final generation parameters:`);
  console.log(`${logPrefix}   - Count: ${generationCount}`);
  console.log(`${logPrefix}   - Generate Turnaround: ${shouldGenerateTurnaround}`);
  console.log(`${logPrefix}   - Reference Images: ${convertedRefs.length}`);

  // Call the core character generator with optimized parameters
  const variations = await generateCharacterVariation(
    optimizedDescription,
    projectId,
    generationCount,
    shouldGenerateTurnaround,
    convertedRefs
  );

  console.log(`${logPrefix} Generated ${variations.length} character variation(s)`);
  return variations;
}

// ============================================================================
// Convenience Functions for Common Use Cases
// ============================================================================

/**
 * Generates a batch of character variations for turnaround sheets
 * @param description Character description
 * @param projectId Project ID
 * @param options Additional options
 * @returns Array of character variations
 */
export async function generateCharacterBatch(
  description: string,
  projectId: string,
  options: Partial<Omit<CharacterGenerationOptions, 'mode' | 'description' | 'projectId'>> = {}
): Promise<CharacterVariation[]> {
  return generateCharacterVariations({
    description,
    projectId,
    mode: 'batch',
    count: 5,
    generateTurnaround: false,
    ...options,
  });
}

/**
 * Generates a single character iteration with feedback
 * @param description Character description
 * @param projectId Project ID
 * @param feedback User feedback for refinement
 * @param options Additional options
 * @returns Single character variation
 */
export async function generateCharacterIteration(
  description: string,
  projectId: string,
  feedback?: string,
  options: Partial<Omit<CharacterGenerationOptions, 'mode' | 'description' | 'projectId' | 'feedback'>> = {}
): Promise<CharacterVariation> {
  const variations = await generateCharacterVariations({
    description,
    projectId,
    mode: 'single',
    count: 1,
    feedback,
    ...options,
  });

  return variations[0];
}




