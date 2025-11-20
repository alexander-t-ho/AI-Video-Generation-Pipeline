/**
 * Style-Aware Color Processor
 * Combines color matching to background with director style effects
 */

import { matchCarToBackground } from './color-matcher';
import { processImageForStyle, downloadImage } from './style-image-processor';
import { uploadBufferToS3, getS3Url } from '@/lib/storage/s3-uploader';

/**
 * Apply both color matching to background and director style effects to car image
 * 
 * @param carImageUrl - URL of the car image
 * @param backgroundImageUrl - URL of the background image
 * @param styleId - Director style ID
 * @param projectId - Project ID for S3 storage
 * @returns URL of the processed car image
 */
export async function applyStyleAndColorMatch(
  carImageUrl: string,
  backgroundImageUrl: string,
  styleId: string,
  projectId: string
): Promise<string> {
  const logPrefix = '[StyleColorProcessor]';
  console.log(`${logPrefix} Applying style and color match`);
  console.log(`${logPrefix} Car: ${carImageUrl}`);
  console.log(`${logPrefix} Background: ${backgroundImageUrl}`);
  console.log(`${logPrefix} Style: ${styleId}`);

  try {
    // Step 1: Match car colors to background
    console.log(`${logPrefix} Step 1: Matching car colors to background...`);
    const colorMatchedBuffer = await matchCarToBackground(carImageUrl, backgroundImageUrl);
    console.log(`${logPrefix} ✓ Color matching complete`);

    // Step 2: Apply director style effects to the color-matched car
    // We need to upload the color-matched image temporarily to apply style effects
    // (since processImageForStyle expects a URL)
    const tempS3Key = `temp/${projectId}/color-matched-${Date.now()}.png`;
    await uploadBufferToS3(colorMatchedBuffer, tempS3Key, 'image/png', {
      'processing-type': 'color-match',
      'original-car-url': carImageUrl,
      'background-url': backgroundImageUrl,
    });
    const colorMatchedUrl = getS3Url(tempS3Key);
    console.log(`${logPrefix} Color-matched image uploaded: ${colorMatchedUrl}`);

    // Step 3: Apply style effects to the color-matched car
    console.log(`${logPrefix} Step 2: Applying director style effects...`);
    const finalProcessedUrl = await processImageForStyle(colorMatchedUrl, styleId, projectId);
    console.log(`${logPrefix} ✓ Style effects applied`);

    console.log(`${logPrefix} ✓ Complete: ${finalProcessedUrl}`);
    return finalProcessedUrl;
  } catch (error: any) {
    console.error(`${logPrefix} ✗ Failed: ${error.message}`);
    throw new Error(`Failed to apply style and color match: ${error.message}`);
  }
}

/**
 * Apply style and color match, returning the processed buffer directly
 * (useful when you don't need to upload to S3 immediately)
 */
export async function applyStyleAndColorMatchToBuffer(
  carImageUrl: string,
  backgroundImageUrl: string,
  styleId: string
): Promise<Buffer> {
  const logPrefix = '[StyleColorProcessor]';
  console.log(`${logPrefix} Applying style and color match (buffer mode)`);

  try {
    // Step 1: Match car colors to background
    const colorMatchedBuffer = await matchCarToBackground(carImageUrl, backgroundImageUrl);

    // Step 2: Apply style effects directly to buffer
    // We need to use the style-image-processor's internal functions
    // For now, let's import and use the style processing logic directly
    const { PRESET_STYLES } = await import('@/lib/types/stylized');
    const style = PRESET_STYLES.find(s => s.id === styleId);
    
    if (!style) {
      console.warn(`${logPrefix} Style ${styleId} not found, skipping style effects`);
      return colorMatchedBuffer;
    }

    // Import style processing options
    // We'll need to duplicate some logic from style-image-processor
    // or refactor it to export the processing function
    // For now, let's use a simpler approach: upload temp, process, download
    const tempProjectId = `temp-style-${Date.now()}`;
    const processedUrl = await applyStyleAndColorMatch(
      carImageUrl,
      backgroundImageUrl,
      styleId,
      tempProjectId
    );

    // Download the processed image
    const processedBuffer = await downloadImage(processedUrl);
    return processedBuffer;
  } catch (error: any) {
    console.error(`${logPrefix} ✗ Failed: ${error.message}`);
    throw error;
  }
}

