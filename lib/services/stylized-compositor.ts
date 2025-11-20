/**
 * Stylized Compositor Service
 * Main orchestration service for car-background compositing with style matching
 */

import { CompositingRequest, CompositingResult, PRESET_STYLES } from '@/lib/types/stylized';
import { applyStyleAndColorMatch } from './style-color-processor';
import { compositeCarOnBackgroundFromUrls } from './image-compositor';
import { uploadBufferToS3, getS3Url } from '@/lib/storage/s3-uploader';

/**
 * Create a styled composite of car on background
 */
export async function createStyledComposite(
  request: CompositingRequest
): Promise<CompositingResult> {
  const logPrefix = '[StylizedCompositor]';
  console.log(`${logPrefix} ========================================`);
  console.log(`${logPrefix} Creating styled composite`);
  console.log(`${logPrefix} Car: ${request.carImageUrl}`);
  console.log(`${logPrefix} Background: ${request.backgroundImageUrl}`);
  console.log(`${logPrefix} Style: ${request.styleId}`);

  const resultId = `composite-${request.styleId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const projectId = `composite-${Date.now()}`;

  const style = PRESET_STYLES.find(s => s.id === request.styleId);
  if (!style) {
    throw new Error(`Style ${request.styleId} not found`);
  }

  const result: CompositingResult = {
    id: resultId,
    compositeImageUrl: '',
    processedCarImageUrl: '',
    styleId: request.styleId,
    styleName: style.name,
    status: 'processing',
    createdAt: new Date().toISOString(),
  };

  try {
    // Step 1: Apply color matching and style effects to car
    console.log(`${logPrefix} Step 1: Processing car (color match + style effects)...`);
    const processedCarUrl = await applyStyleAndColorMatch(
      request.carImageUrl,
      request.backgroundImageUrl,
      request.styleId,
      projectId
    );
    result.processedCarImageUrl = processedCarUrl;
    console.log(`${logPrefix} ✓ Car processed: ${processedCarUrl}`);

    // Step 2: Composite processed car onto background
    console.log(`${logPrefix} Step 2: Compositing car onto background...`);
    const compositeBuffer = await compositeCarOnBackgroundFromUrls(
      processedCarUrl,
      request.backgroundImageUrl,
      {
        carPosition: request.carPosition,
        carScale: request.carScale,
        blendMode: 'over', // Standard alpha blending
      }
    );
    console.log(`${logPrefix} ✓ Compositing complete`);

    // Step 3: Upload composite to S3
    console.log(`${logPrefix} Step 3: Uploading composite to S3...`);
    const compositeS3Key = `composites/${projectId}/composite-${resultId}.png`;
    await uploadBufferToS3(compositeBuffer, compositeS3Key, 'image/png', {
      'composite-id': resultId,
      'style-id': request.styleId,
      'style-name': style.name,
      'car-url': request.carImageUrl,
      'background-url': request.backgroundImageUrl,
    });
    const compositeUrl = getS3Url(compositeS3Key);
    result.compositeImageUrl = compositeUrl;
    console.log(`${logPrefix} ✓ Composite uploaded: ${compositeUrl}`);

    // Update result status
    result.status = 'completed';
    result.completedAt = new Date().toISOString();

    console.log(`${logPrefix} ========================================`);
    console.log(`${logPrefix} ✓ Composite creation complete`);
    console.log(`${logPrefix} Result ID: ${resultId}`);
    console.log(`${logPrefix} Composite URL: ${compositeUrl}`);
    console.log(`${logPrefix} ========================================`);

    return result;
  } catch (error: any) {
    console.error(`${logPrefix} ✗ Failed: ${error.message}`);
    result.status = 'failed';
    result.error = error.message;
    throw error;
  }
}

