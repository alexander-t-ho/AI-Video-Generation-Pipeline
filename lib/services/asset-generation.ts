/**
 * Asset Generation Service
 *
 * This module provides a service interface for generating multiple angle views
 * of brand/car assets. It orchestrates the generation pipeline for turnaround sheets.
 */

import { generateImage, pollImageStatus } from '../api-client';
import { buildAssetPrompt } from '../utils/prompt-utils';
import type { AngleType } from '@/lib/types';
import { ANGLE_DEFINITIONS } from '@/lib/constants';

// ============================================================================
// Type Definitions
// ============================================================================

export interface AssetAngleGenerationOptions {
  assetDescription: string;
  referenceImageUrl: string;
  selectedAngles: AngleType[];
  projectId: string;
  color?: string;
  onProgress?: (current: number, total: number, angle: AngleType) => void;
}

export interface GeneratedAssetAngle {
  angle: AngleType;
  url: string;
  angleLabel: string;
  metadata?: {
    prompt: string;
    predictionId: string;
  };
}

// ============================================================================
// Main Service Function
// ============================================================================

/**
 * Generates multiple angle views of an asset based on selected angles.
 * Generates angles sequentially to provide progress feedback.
 *
 * @param options Asset generation options
 * @returns Array of generated asset angles
 */
export async function generateAssetAngles(
  options: AssetAngleGenerationOptions
): Promise<GeneratedAssetAngle[]> {
  const {
    assetDescription,
    referenceImageUrl,
    selectedAngles,
    projectId,
    color,
    onProgress,
  } = options;

  const logPrefix = '[AssetGenerationService]';
  console.log(`${logPrefix} Starting asset angle generation`);
  console.log(`${logPrefix} Asset: ${assetDescription}`);
  console.log(`${logPrefix} Angles to generate: ${selectedAngles.length}`);
  console.log(`${logPrefix} Reference image: ${referenceImageUrl}`);

  const results: GeneratedAssetAngle[] = [];
  const total = selectedAngles.length;

  // Generate each angle sequentially
  for (let i = 0; i < selectedAngles.length; i++) {
    const angle = selectedAngles[i];
    const angleDefinition = ANGLE_DEFINITIONS[angle];

    console.log(`${logPrefix} Generating angle ${i + 1}/${total}: ${angle} (${angleDefinition.label})`);

    // Notify progress
    if (onProgress) {
      onProgress(i + 1, total, angle);
    }

    try {
      // Build angle-specific prompt
      // Each angle gets its own unique prompt based on ANGLE_DEFINITIONS
      const enhancedPrompt = `${assetDescription}${color ? ` in ${color} color` : ''}. ${angleDefinition.prompt}. Professional product photography, clean white background, high detail, 4K resolution, studio lighting.`;

      console.log(`${logPrefix} Generating ${angleDefinition.label} (${angle})`);
      console.log(`${logPrefix} Prompt: ${enhancedPrompt}`);

      // Generate the image using Gen-4 Image for better consistency
      const response = await generateImage({
        prompt: enhancedPrompt,
        projectId,
        sceneIndex: i,
        seedImage: referenceImageUrl,
        referenceImageUrls: [referenceImageUrl],
      }, {
        model: 'runwayml/gen4-image'
      });

      if (!response.success || !response.predictionId) {
        throw new Error(response.error || `Failed to start generation for ${angle}`);
      }

      console.log(`${logPrefix} Started generation for ${angle}, prediction ID: ${response.predictionId}`);

      // Poll for completion
      const status = await pollImageStatus(response.predictionId);

      if (!status.success || !status.image) {
        throw new Error(status.error || `Generation failed for ${angle}`);
      }

      console.log(`${logPrefix} Successfully generated ${angle}: ${status.image.url}`);

      // Add to results
      results.push({
        angle,
        url: status.image.url,
        angleLabel: angleDefinition.label,
        metadata: {
          prompt: enhancedPrompt,
          predictionId: response.predictionId,
        },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`${logPrefix} Failed to generate ${angle}:`, errorMessage);
      
      // Continue with other angles even if one fails
      // You could also choose to throw here to stop the entire process
      console.warn(`${logPrefix} Continuing with remaining angles...`);
    }
  }

  console.log(`${logPrefix} Completed generation: ${results.length}/${total} angles successful`);
  return results;
}

/**
 * Convenience function to generate a single angle
 */
export async function generateSingleAssetAngle(
  assetDescription: string,
  referenceImageUrl: string,
  angle: AngleType,
  projectId: string,
  color?: string
): Promise<GeneratedAssetAngle> {
  const results = await generateAssetAngles({
    assetDescription,
    referenceImageUrl,
    selectedAngles: [angle],
    projectId,
    color,
  });

  if (results.length === 0) {
    throw new Error(`Failed to generate ${angle} view`);
  }

  return results[0];
}

