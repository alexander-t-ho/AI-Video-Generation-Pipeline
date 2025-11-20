/**
 * Color Matcher Service
 * Analyzes background images and matches car colors to background
 */

import sharp from 'sharp';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

interface ColorStatistics {
  averageRgb: { r: number; g: number; b: number };
  dominantHue: number; // 0-360
  averageSaturation: number; // 0-100
  averageBrightness: number; // 0-100
  averageContrast: number; // 0-100
  colorTemperature: number; // -100 (cool) to 100 (warm)
}

interface ColorMatchAdjustments {
  hueShift: number; // Degrees to shift hue
  saturationAdjustment: number; // Percentage change (-100 to 100)
  brightnessAdjustment: number; // Percentage change (-100 to 100)
  contrastAdjustment: number; // Percentage change (-100 to 100)
  temperatureAdjustment: number; // -100 (cool) to 100 (warm)
}

/**
 * Download image from URL (S3, HTTP, or base64)
 */
async function downloadImage(imageUrl: string): Promise<Buffer> {
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
 * Convert RGB to HSL
 */
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: h * 360,
    s: s * 100,
    l: l * 100,
  };
}

/**
 * Calculate color temperature (warm/cool) from RGB
 * Returns -100 (cool/blue) to 100 (warm/orange)
 */
function calculateColorTemperature(r: number, g: number, b: number): number {
  // Calculate warm/cool balance
  // Warm colors have more red/yellow, cool colors have more blue
  const warmness = (r + g) / 2 - b;
  // Normalize to -100 to 100 range
  return Math.max(-100, Math.min(100, (warmness / 255) * 200));
}

/**
 * Analyze color statistics from an image
 */
export async function analyzeImageColors(imageUrl: string): Promise<ColorStatistics> {
  const logPrefix = '[ColorMatcher]';
  console.log(`${logPrefix} Analyzing colors for: ${imageUrl}`);

  const imageBuffer = await downloadImage(imageUrl);
  const image = sharp(imageBuffer);

  // Resize to smaller size for faster processing (keep aspect ratio)
  const resized = await image
    .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = resized;
  const { width, height, channels } = info;

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let totalSaturation = 0;
  let totalBrightness = 0;
  let pixelCount = 0;

  // Sample pixels (every 4th pixel for performance)
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      totalR += r;
      totalG += g;
      totalB += b;

      const hsl = rgbToHsl(r, g, b);
      totalSaturation += hsl.s;
      totalBrightness += hsl.l;

      pixelCount++;
    }
  }

  const averageR = totalR / pixelCount;
  const averageG = totalG / pixelCount;
  const averageB = totalB / pixelCount;

  const averageHsl = rgbToHsl(averageR, averageG, averageB);
  const averageSaturation = totalSaturation / pixelCount;
  const averageBrightness = totalBrightness / pixelCount;

  // Calculate contrast (standard deviation of brightness)
  let brightnessVariance = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const hsl = rgbToHsl(r, g, b);
      brightnessVariance += Math.pow(hsl.l - averageBrightness, 2);
    }
  }
  const averageContrast = Math.sqrt(brightnessVariance / pixelCount);

  const colorTemperature = calculateColorTemperature(averageR, averageG, averageB);

  const stats: ColorStatistics = {
    averageRgb: { r: averageR, g: averageG, b: averageB },
    dominantHue: averageHsl.h,
    averageSaturation,
    averageBrightness,
    averageContrast,
    colorTemperature,
  };

  console.log(`${logPrefix} Color statistics:`, {
    hue: stats.dominantHue.toFixed(1),
    saturation: stats.averageSaturation.toFixed(1),
    brightness: stats.averageBrightness.toFixed(1),
    contrast: stats.averageContrast.toFixed(1),
    temperature: stats.colorTemperature.toFixed(1),
  });

  return stats;
}

/**
 * Calculate color matching adjustments to match car to background
 */
export async function calculateColorMatchAdjustments(
  carImageUrl: string,
  backgroundImageUrl: string
): Promise<ColorMatchAdjustments> {
  const logPrefix = '[ColorMatcher]';
  console.log(`${logPrefix} Calculating color match adjustments`);

  const [carStats, backgroundStats] = await Promise.all([
    analyzeImageColors(carImageUrl),
    analyzeImageColors(backgroundImageUrl),
  ]);

  // Calculate hue shift (shortest path around color wheel)
  let hueShift = backgroundStats.dominantHue - carStats.dominantHue;
  if (hueShift > 180) {
    hueShift -= 360;
  } else if (hueShift < -180) {
    hueShift += 360;
  }

  // Calculate saturation adjustment (percentage change)
  const saturationDiff = backgroundStats.averageSaturation - carStats.averageSaturation;
  const saturationAdjustment = (saturationDiff / carStats.averageSaturation) * 100;

  // Calculate brightness adjustment (percentage change)
  const brightnessDiff = backgroundStats.averageBrightness - carStats.averageBrightness;
  const brightnessAdjustment = (brightnessDiff / carStats.averageBrightness) * 100;

  // Calculate contrast adjustment (percentage change)
  const contrastDiff = backgroundStats.averageContrast - carStats.averageContrast;
  const contrastAdjustment = (contrastDiff / carStats.averageContrast) * 100;

  // Calculate temperature adjustment
  const temperatureAdjustment = backgroundStats.colorTemperature - carStats.colorTemperature;

  const adjustments: ColorMatchAdjustments = {
    hueShift: Math.max(-180, Math.min(180, hueShift)),
    saturationAdjustment: Math.max(-100, Math.min(100, saturationAdjustment)),
    brightnessAdjustment: Math.max(-100, Math.min(100, brightnessAdjustment)),
    contrastAdjustment: Math.max(-100, Math.min(100, contrastAdjustment)),
    temperatureAdjustment: Math.max(-100, Math.min(100, temperatureAdjustment)),
  };

  console.log(`${logPrefix} Color match adjustments:`, adjustments);

  return adjustments;
}

/**
 * Apply color matching adjustments to car image
 */
export async function matchCarToBackground(
  carImageUrl: string,
  backgroundImageUrl: string
): Promise<Buffer> {
  const logPrefix = '[ColorMatcher]';
  console.log(`${logPrefix} Matching car colors to background`);

  const adjustments = await calculateColorMatchAdjustments(carImageUrl, backgroundImageUrl);
  const carBuffer = await downloadImage(carImageUrl);

  const metadata = await sharp(carBuffer).metadata();
  const width = metadata.width || 1920;
  const height = metadata.height || 1080;

  let pipeline = sharp(carBuffer);
  const composites: any[] = [];

  // Apply hue shift using modulate
  if (Math.abs(adjustments.hueShift) > 1) {
    // Convert hue shift to hue rotation (0-360)
    const hueRotation = (adjustments.hueShift + 360) % 360;
    pipeline = pipeline.modulate({
      hue: hueRotation,
    });
    console.log(`${logPrefix} Applied hue shift: ${adjustments.hueShift.toFixed(1)}°`);
  }

  // Apply saturation adjustment
  if (Math.abs(adjustments.saturationAdjustment) > 1) {
    const saturationMultiplier = 1 + (adjustments.saturationAdjustment / 100);
    pipeline = pipeline.modulate({
      saturation: saturationMultiplier,
    });
    console.log(`${logPrefix} Applied saturation adjustment: ${adjustments.saturationAdjustment.toFixed(1)}%`);
  }

  // Apply brightness adjustment
  if (Math.abs(adjustments.brightnessAdjustment) > 1) {
    const brightnessMultiplier = 1 + (adjustments.brightnessAdjustment / 100);
    pipeline = pipeline.modulate({
      brightness: brightnessMultiplier,
    });
    console.log(`${logPrefix} Applied brightness adjustment: ${adjustments.brightnessAdjustment.toFixed(1)}%`);
  }

  // Apply contrast adjustment
  if (Math.abs(adjustments.contrastAdjustment) > 1) {
    const contrastMultiplier = 1 + (adjustments.contrastAdjustment / 100);
    const offset = 128 * (1 - contrastMultiplier);
    pipeline = pipeline.linear(contrastMultiplier, offset);
    console.log(`${logPrefix} Applied contrast adjustment: ${adjustments.contrastAdjustment.toFixed(1)}%`);
  }

  // Apply temperature adjustment
  if (Math.abs(adjustments.temperatureAdjustment) > 5) {
    const temp = adjustments.temperatureAdjustment / 100;
    const tempAlpha = Math.abs(temp) * 0.15; // 0-15% opacity

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
    console.log(`${logPrefix} Applied temperature adjustment: ${adjustments.temperatureAdjustment.toFixed(1)}`);
  }

  // Apply composite overlays if any
  if (composites.length > 0) {
    pipeline = pipeline.composite(composites);
  }

  const processedBuffer = await pipeline.png().toBuffer();
  console.log(`${logPrefix} ✓ Color matching complete`);

  return processedBuffer;
}

