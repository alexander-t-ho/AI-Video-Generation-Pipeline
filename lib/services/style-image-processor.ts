/**
 * Style Image Processor
 * Applies color grading and lighting effects to images based on directing styles
 * before video generation to ensure style-specific visual characteristics
 */

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { PRESET_STYLES, type PresetStyle } from '@/lib/types/stylized';
import { uploadBufferToS3, getS3Url } from '@/lib/storage/s3-uploader';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

interface StyleProcessingOptions {
  saturation?: number; // -100 to 100 (0 = no change)
  brightness?: number; // -100 to 100 (0 = no change)
  contrast?: number; // -100 to 100 (0 = no change)
  gamma?: number; // 0.1 to 3.0 (1.0 = no change)
  tint?: { r: number; g: number; b: number }; // RGB tint (0-255)
  temperature?: number; // -100 (cool/blue) to 100 (warm/orange)
  shadows?: number; // -100 to 100 (0 = no change)
  highlights?: number; // -100 to 100 (0 = no change)
}

/**
 * Get style-specific processing options
 */
function getStyleProcessingOptions(styleId: string): StyleProcessingOptions {
  const style = PRESET_STYLES.find(s => s.id === styleId);
  if (!style) {
    return {}; // No processing if style not found
  }

  switch (styleId) {
    case 'wes-anderson':
      // Pastel colors: reduce saturation, increase brightness slightly, warm tint
      return {
        saturation: -30, // Reduce saturation for pastel effect
        brightness: 10, // Slight brightness increase
        contrast: -15, // Softer contrast
        gamma: 1.1, // Slight gamma adjustment for softer look
        tint: { r: 255, g: 240, b: 230 }, // Warm pastel tint
        temperature: 20, // Slightly warm
        shadows: -20, // Lift shadows
        highlights: -10, // Soften highlights
      };

    case 'david-fincher':
      // Dark, desaturated, high contrast, cool tones
      return {
        saturation: -50, // Heavy desaturation
        brightness: -20, // Darker
        contrast: 40, // High contrast
        gamma: 0.9, // Darker gamma
        tint: { r: 200, g: 220, b: 240 }, // Cool blue tint
        temperature: -30, // Cool/blue
        shadows: -40, // Crush shadows
        highlights: 20, // Boost highlights slightly
      };

    case 'denis-villeneuve':
      // Muted, atmospheric, natural tones
      return {
        saturation: -25, // Slight desaturation
        brightness: -5, // Slightly darker
        contrast: 15, // Moderate contrast
        gamma: 0.95, // Slightly darker
        tint: { r: 240, g: 235, b: 220 }, // Earthy tint
        temperature: 10, // Slightly warm
        shadows: -15, // Moderate shadow lift
        highlights: -5, // Soft highlights
      };

    case 'spike-jonze':
      // Vibrant, saturated, playful
      return {
        saturation: 30, // Increase saturation
        brightness: 5, // Slight brightness
        contrast: 20, // Moderate contrast
        gamma: 1.05, // Slightly brighter
        tint: { r: 255, g: 250, b: 240 }, // Warm vibrant tint
        temperature: 15, // Warm
        shadows: -10, // Lift shadows slightly
        highlights: 5, // Boost highlights
      };

    case 'greta-gerwig':
      // Warm, natural, inviting
      return {
        saturation: 10, // Slight saturation increase
        brightness: 8, // Brighter
        contrast: -5, // Softer contrast
        gamma: 1.1, // Brighter gamma
        tint: { r: 255, g: 245, b: 230 }, // Warm golden tint
        temperature: 30, // Warm/orange
        shadows: -15, // Lift shadows
        highlights: -5, // Soft highlights
      };

    case 'christopher-nolan':
      // High contrast, dramatic, cool tones
      return {
        saturation: -10, // Slight desaturation
        brightness: -10, // Darker
        contrast: 50, // Very high contrast
        gamma: 0.85, // Darker gamma
        tint: { r: 220, g: 230, b: 250 }, // Cool blue tint
        temperature: -20, // Cool
        shadows: -50, // Heavy shadow crushing
        highlights: 30, // Boost highlights
      };

    default:
      return {};
  }
}

/**
 * Download image from URL (S3 or HTTP)
 */
export async function downloadImage(imageUrl: string): Promise<Buffer> {
  // If it's a base64 data URL, decode it
  if (imageUrl.startsWith('data:')) {
    const base64Data = imageUrl.split(',')[1];
    return Buffer.from(base64Data, 'base64');
  }

  // If it's an S3 URL, download using AWS SDK
  if (imageUrl.includes('s3.amazonaws.com') || imageUrl.includes('s3.')) {
    const urlMatch = imageUrl.match(/https?:\/\/([^/]+)\.s3[^/]*\.amazonaws\.com\/(.+)$/);
    if (urlMatch && urlMatch[1] && urlMatch[2]) {
      const bucket = urlMatch[1];
      const s3Key = decodeURIComponent(urlMatch[2]);

      const s3Client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      });

      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: s3Key,
      });

      const response = await s3Client.send(command);
      if (!response.Body) {
        throw new Error('S3 response body is empty');
      }

      const arrayBuffer = await response.Body.transformToByteArray();
      return Buffer.from(arrayBuffer);
    }
  }

  // Otherwise, fetch from HTTP/HTTPS
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Apply color grading and lighting effects to an image
 */
async function applyStyleEffects(
  imageBuffer: Buffer,
  options: StyleProcessingOptions
): Promise<Buffer> {
  // Get image metadata to determine dimensions for overlay
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 1920;
  const height = metadata.height || 1080;

  let pipeline = sharp(imageBuffer);
  const composites: any[] = [];

  // Build modulate options (saturation, brightness, hue)
  const modulateOptions: { saturation?: number; brightness?: number; hue?: number } = {};

  // Apply saturation (-100 to 100 -> 0 to 2, where 1 = no change)
  if (options.saturation !== undefined && options.saturation !== 0) {
    modulateOptions.saturation = 1 + (options.saturation / 100);
  }

  // Apply brightness (-100 to 100 -> 0 to 2, where 1 = no change)
  if (options.brightness !== undefined && options.brightness !== 0) {
    modulateOptions.brightness = 1 + (options.brightness / 100);
  }

  // Apply modulation if any options are set
  if (Object.keys(modulateOptions).length > 0) {
    pipeline = pipeline.modulate(modulateOptions);
  }

  // Apply gamma correction
  if (options.gamma !== undefined && options.gamma !== 1.0) {
    pipeline = pipeline.gamma(options.gamma);
  }

  // Apply contrast using linear adjustment
  // Linear: output = input * multiplier + offset
  // For contrast: multiplier controls the slope (higher = more contrast)
  if (options.contrast !== undefined && options.contrast !== 0) {
    const contrastMultiplier = 1 + (options.contrast / 100); // 0.5 to 2.0
    const offset = 128 * (1 - contrastMultiplier); // Adjust offset to keep midtones
    pipeline = pipeline.linear(contrastMultiplier, offset);
  }

  // Apply temperature (warm/cool) using color overlay
  // Temperature: positive = warm (more red/yellow), negative = cool (more blue)
  if (options.temperature !== undefined && options.temperature !== 0) {
    const temp = options.temperature / 100; // Normalize to -1 to 1
    const tempAlpha = Math.abs(temp) * 0.2; // 0-20% opacity based on temperature strength
    
    if (temp > 0) {
      // Warm: orange/yellow tint
      const warmTint = await sharp({
        create: {
          width,
          height,
          channels: 4,
          background: { r: 255, g: 220, b: 180, alpha: tempAlpha },
        },
      }).png().toBuffer();
      
      composites.push({ input: warmTint, blend: 'overlay' });
    } else {
      // Cool: blue tint
      const coolTint = await sharp({
        create: {
          width,
          height,
          channels: 4,
          background: { r: 180, g: 200, b: 255, alpha: tempAlpha },
        },
      }).png().toBuffer();
      
      composites.push({ input: coolTint, blend: 'overlay' });
    }
  }

  // Apply custom tint overlay
  if (options.tint) {
    const { r, g, b } = options.tint;
    const tintAlpha = 0.12; // 12% opacity for subtle effect
    
    const tintOverlay = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r, g, b, alpha: tintAlpha },
      },
    }).png().toBuffer();
    
    composites.push({ input: tintOverlay, blend: 'overlay' });
  }

  // Apply composite overlays if any
  if (composites.length > 0) {
    pipeline = pipeline.composite(composites);
  }

  // Apply shadows/highlights using curves approximation
  // Shadows: positive = lift (brighten), negative = crush (darken)
  if (options.shadows !== undefined && options.shadows !== 0) {
    const shadowAdjust = options.shadows / 100; // -1 to 1
    // Lift shadows by brightening dark areas
    if (shadowAdjust > 0) {
      // Brighten shadows (lift)
      pipeline = pipeline.linear(1, shadowAdjust * 30);
    } else {
      // Darken shadows (crush)
      pipeline = pipeline.linear(1 + Math.abs(shadowAdjust) * 0.3, shadowAdjust * 40);
    }
  }

  // Highlights: positive = boost, negative = reduce
  if (options.highlights !== undefined && options.highlights !== 0) {
    const highlightAdjust = options.highlights / 100;
    // Adjust highlights (simplified - affects overall brightness curve)
    if (highlightAdjust > 0) {
      // Boost highlights
      pipeline = pipeline.linear(1 - highlightAdjust * 0.2, highlightAdjust * 20);
    } else {
      // Reduce highlights
      pipeline = pipeline.linear(1 + Math.abs(highlightAdjust) * 0.2, highlightAdjust * 15);
    }
  }

  return await pipeline.png().toBuffer();
}

/**
 * Process an image with style-specific color grading and lighting
 * 
 * @param imageUrl - URL of the input image (S3, HTTP, or base64)
 * @param styleId - Style ID to apply
 * @param projectId - Project ID for S3 storage
 * @returns URL of the processed image
 */
export async function processImageForStyle(
  imageUrl: string,
  styleId: string,
  projectId: string
): Promise<string> {
  const logPrefix = '[StyleImageProcessor]';
  console.log(`${logPrefix} Processing image for style: ${styleId}`);

  try {
    // Get style-specific processing options
    const options = getStyleProcessingOptions(styleId);
    
    if (Object.keys(options).length === 0) {
      console.log(`${logPrefix} No processing options for style ${styleId}, returning original image`);
      return imageUrl;
    }

    console.log(`${logPrefix} Processing options:`, options);

    // Download the image
    console.log(`${logPrefix} Downloading image...`);
    const imageBuffer = await downloadImage(imageUrl);

    // Apply style effects
    console.log(`${logPrefix} Applying style effects...`);
    const processedBuffer = await applyStyleEffects(imageBuffer, options);

    // Save processed image temporarily
    const tempDir = path.join(process.cwd(), 'temp', projectId);
    await fs.mkdir(tempDir, { recursive: true });
    const tempPath = path.join(tempDir, `style-${styleId}-${Date.now()}.png`);
    await fs.writeFile(tempPath, processedBuffer);

    // Upload to S3
    console.log(`${logPrefix} Uploading processed image to S3...`);
    const s3Key = `temp/${projectId}/style-processed-${styleId}-${Date.now()}.png`;
    await uploadBufferToS3(processedBuffer, s3Key, 'image/png', {
      'style-id': styleId,
      'processing-type': 'style-color-grading',
      'original-url': imageUrl,
    });

    const processedUrl = getS3Url(s3Key);
    console.log(`${logPrefix} ✓ Processed image uploaded: ${processedUrl}`);

    // Clean up temp file
    try {
      await fs.unlink(tempPath);
    } catch (error) {
      // Ignore cleanup errors
    }

    return processedUrl;
  } catch (error: any) {
    console.error(`${logPrefix} ✗ Failed to process image:`, error.message);
    // Return original image URL if processing fails
    console.warn(`${logPrefix} Returning original image URL due to processing failure`);
    return imageUrl;
  }
}

