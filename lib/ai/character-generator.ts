/**
 * Character Generator - Style-Aware Character Generation with Turnaround Support
 * 
 * This module handles character generation with style-aware prompts
 * and comprehensive turnaround coverage for video consistency
 */

import { v4 as uuidv4 } from 'uuid';
import { createImagePredictionWithRetry, pollReplicateStatus } from './image-generator';
import { uploadToS3, getS3Url } from '../storage/s3-uploader';
import fs from 'fs';
import path from 'path';

interface CharacterVariation {
  id: string;
  url: string;
  type: 'turnaround' | 'closeup' | 'full-body' | 'detail';
  angle: number;
  scale: 'full' | 'medium' | 'close';
}

/**
 * Generates multiple character variations with turnaround coverage
 * @param description Character description with style preferences
 * @param projectId Project ID for file organization
 * @param count Number of variations to generate (1-10)
 * @param generateTurnaround Whether to generate proper turnaround coverage
 * @param referenceImages Array of reference image URLs to base generation on
 * @param feedback Optional user feedback for refinement
 * @param ipAdapterScale Optional IP-Adapter scale for reference image influence (0-1)
 * @returns Array of generated character images with metadata
 */
export async function generateCharacterVariation(
  description: string,
  projectId: string,
  count: number = 5,
  generateTurnaround: boolean = false,
  referenceImages: string[] = [],
  feedback?: string,
  ipAdapterScale?: number
): Promise<CharacterVariation[]> {
  if (!description || typeof description !== 'string') {
    throw new Error('Description is required and must be a string');
  }

  if (!projectId || typeof projectId !== 'string') {
    throw new Error('Project ID is required and must be a string');
  }

  if (count < 1 || count > 10) {
    throw new Error('Count must be between 1 and 10');
  }

  const logPrefix = '[CharacterGenerator]';
  console.log(`${logPrefix} Generating ${count} character variation(s)`);
  console.log(`${logPrefix} Description: ${description}`);
  console.log(`${logPrefix} Project ID: ${projectId}`);
  console.log(`${logPrefix} Turnaround mode: ${generateTurnaround}`);

  const results: CharacterVariation[] = [];

  // Define variation configurations based on mode
  const variations = generateTurnaround 
    ? getTurnaroundVariations(count)
    : getStandardVariations(count);

  // Generate variations sequentially to avoid overwhelming the API
  for (let i = 0; i < count; i++) {
    console.log(`${logPrefix} Generating variation ${i + 1}/${count}`);

    try {
      const variation = variations[i % variations.length];
      
      // Build variation-specific prompt
      const variationPrompt = buildVariationPrompt(description, variation);

      // Create prediction with reference images and IP-Adapter
      const predictionId = await createImagePredictionWithRetry(
        variationPrompt,
        undefined, // seedImage (not used for character generation)
        referenceImages.length > 0 ? referenceImages : undefined,
        ipAdapterScale
      );
      console.log(`${logPrefix} Prediction created for variation ${i + 1}: ${predictionId}`);

      // Poll for completion
      const imageUrl = await pollReplicateStatus(predictionId);
      console.log(`${logPrefix} Variation ${i + 1} completed`);

      // Download and upload to S3
      const savedImage = await downloadAndUploadCharacterImage(imageUrl, projectId);
      console.log(`${logPrefix} Variation ${i + 1} saved to S3: ${savedImage.url.substring(0, 60)}...`);

      results.push({
        id: savedImage.id,
        url: savedImage.url,
        type: variation.type,
        angle: variation.angle,
        scale: variation.scale,
      });
    } catch (error) {
      console.error(`${logPrefix} Failed to generate variation ${i + 1}:`, error);
      // Continue with other variations even if one fails
    }
  }

  if (results.length === 0) {
    throw new Error('Failed to generate any character variations');
  }

  console.log(`${logPrefix} Successfully generated ${results.length}/${count} variation(s)`);
  return results;
}

/**
 * Gets turnaround variation configurations for comprehensive coverage
 */
function getTurnaroundVariations(count: number) {
  // Optimized for 10 variations: proper turnaround + scales
  const configurations = [
    // Full body turnaround (angles)
    { type: 'full-body' as const, angle: 0, scale: 'full' as const, view: 'front view, straight-on' },
    { type: 'turnaround' as const, angle: 45, scale: 'full' as const, view: 'three-quarter front view' },
    { type: 'turnaround' as const, angle: 90, scale: 'full' as const, view: 'side profile, lateral view' },
    { type: 'turnaround' as const, angle: 135, scale: 'full' as const, view: 'three-quarter back view' },
    { type: 'turnaround' as const, angle: 180, scale: 'full' as const, view: 'back view' },
    
    // Different scales for detail
    { type: 'closeup' as const, angle: 0, scale: 'close' as const, view: 'close-up shot, detailed features' },
    { type: 'detail' as const, angle: 0, scale: 'medium' as const, view: 'medium shot, upper body' },
    
    // Action/dynamic poses
    { type: 'full-body' as const, angle: 315, scale: 'full' as const, view: 'dynamic angle from above' },
    { type: 'full-body' as const, angle: 270, scale: 'full' as const, view: 'opposite side profile' },
    { type: 'detail' as const, angle: 45, scale: 'close' as const, view: 'detail shot, key features' },
  ];

  return configurations.slice(0, count);
}

/**
 * Gets standard variation configurations for simpler use cases
 */
function getStandardVariations(count: number) {
  const configurations = [
    { type: 'full-body' as const, angle: 0, scale: 'full' as const, view: 'front view, centered' },
    { type: 'turnaround' as const, angle: 45, scale: 'full' as const, view: 'three-quarter view' },
    { type: 'turnaround' as const, angle: 90, scale: 'full' as const, view: 'side profile' },
    { type: 'closeup' as const, angle: 0, scale: 'close' as const, view: 'close-up detail' },
    { type: 'full-body' as const, angle: 315, scale: 'full' as const, view: 'dynamic angle' },
  ];

  return configurations.slice(0, count);
}

/**
 * Builds variation-specific prompt with angle, scale, and technical instructions
 */
function buildVariationPrompt(baseDescription: string, variation: any): string {
  const parts: string[] = [baseDescription];
  
  // Add view/angle instruction
  parts.push(variation.view);
  
  // Add scale-specific instructions
  if (variation.scale === 'full') {
    parts.push('full body visible, complete figure, showing proportions');
  } else if (variation.scale === 'medium') {
    parts.push('medium shot, upper portion, detailed view');
  } else if (variation.scale === 'close') {
    parts.push('close-up, focusing on key features and details, high detail');
  }
  
  // Add type-specific instructions
  if (variation.type === 'turnaround') {
    parts.push('character turnaround style, model sheet, reference sheet');
  } else if (variation.type === 'closeup') {
    parts.push('hero shot, featured prominently, high quality detail');
  } else if (variation.type === 'detail') {
    parts.push('detail reference, clear features, texture visible');
  }
  
  // Add technical requirements for clean extraction
  parts.push('isolated subject on clean white background');
  parts.push('no shadows, even studio lighting');
  parts.push('clear edges for easy extraction');
  parts.push('consistent proportions, professional reference quality');
  
  return parts.join(', ');
}

/**
 * Downloads character image from Replicate and uploads to S3
 * @param imageUrl Replicate output URL
 * @param projectId Project ID for organization
 * @returns Object with id and S3 URL
 */
async function downloadAndUploadCharacterImage(imageUrl: string, projectId: string): Promise<{ id: string; url: string }> {
  const logPrefix = '[CharacterGenerator:Download]';
  console.log(`${logPrefix} Downloading image from Replicate`);
  
  // Download image
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  // Generate unique ID and filename
  const imageId = uuidv4();
  const filename = `character-${imageId}.png`;
  
  // Create temp file
  const tempDir = path.join(process.cwd(), 'tmp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const tempPath = path.join(tempDir, filename);
  fs.writeFileSync(tempPath, buffer);
  
  try {
    // Upload to S3
    console.log(`${logPrefix} Uploading to S3`);
    const s3Key = await uploadToS3(tempPath, projectId, {
      metadata: {
        'content-type': 'image/png',
        'upload-type': 'character-generation',
      },
    });
    
    // Clean up temp file
    fs.unlinkSync(tempPath);
    
    // Get S3 URL
    const s3Url = getS3Url(s3Key);
    console.log(`${logPrefix} Uploaded successfully: ${s3Url.substring(0, 60)}...`);
    
    return {
      id: imageId,
      url: s3Url,
    };
  } catch (error) {
    // Clean up temp file on error
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    throw error;
  }
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use buildVariationPrompt instead
 */
function addVariationSeed(prompt: string, index: number): string {
  const variations = [
    'front view, centered composition, straight-on angle, full body visible',
    'three-quarter view, dynamic angle, hero perspective, showing depth',
    'side profile, clear silhouette, lateral view, clean outline',
    'slightly from above, powerful stance, commanding presence',
    'close-up detail shot, focus on key features and textures',
  ];

  const seed = variations[index % variations.length];
  
  // Add instructions for clean background removal
  const backgroundInstruction = 'isolated subject on clean white background, no shadows, clear edges for easy extraction';
  
  return `${prompt}, ${seed}, ${backgroundInstruction}`;
}

/**
 * Detects style keywords in description and returns style type
 * @param description Character description
 * @returns Style type: 'cartoon', 'realistic', or 'default'
 */
export function detectStyleType(description: string): 'cartoon' | 'realistic' | 'default' {
  const lowerDescription = description.toLowerCase();

  // Cartoon keywords
  const cartoonKeywords = [
    'cartoon', 'animated', 'stylized', 'illustrated', 'comic', 'anime',
    'cel-shaded', 'toon', '2d', 'hand-drawn', 'pixar', 'disney',
  ];

  // Realistic keywords
  const realisticKeywords = [
    'realistic', 'photorealistic', 'hyper-realistic', 'real-life', 'photograph',
    'photo', 'cinematic', '3d render', 'hyperrealism', 'lifelike',
  ];

  const hasCartoon = cartoonKeywords.some(keyword => lowerDescription.includes(keyword));
  const hasRealistic = realisticKeywords.some(keyword => lowerDescription.includes(keyword));

  if (hasCartoon && !hasRealistic) {
    return 'cartoon';
  } else if (hasRealistic && !hasCartoon) {
    return 'realistic';
  } else {
    return 'default';
  }
}

/**
 * Enhances prompt with style-specific instructions
 * @param basePrompt Base character prompt
 * @param styleType Style type detected or specified
 * @returns Enhanced prompt
 */
export function enhancePromptWithStyle(basePrompt: string, styleType: 'cartoon' | 'realistic' | 'default'): string {
  const styleInstructions: Record<string, string> = {
    cartoon: 'cartoon style, vibrant colors, clean lines, animated character design, stylized proportions, cel-shaded',
    realistic: 'photorealistic, hyper-realistic details, studio lighting, professional photography, lifelike textures, cinematic quality',
    default: 'high quality, professional, clean composition, balanced style',
  };

  const instruction = styleInstructions[styleType];
  return `${basePrompt}, ${instruction}`;
}

