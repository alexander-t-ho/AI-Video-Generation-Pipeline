/**
 * Image Compositor Service
 * Composites car image onto background image
 */

import sharp from 'sharp';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

interface CompositingOptions {
  carPosition?: { x: number; y: number }; // Position offset (for future use)
  carScale?: number; // Scale factor (for future use)
  blendMode?: 'over' | 'overlay' | 'screen' | 'multiply'; // Blending mode
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
 * Composite car image onto background image
 */
export async function compositeCarOnBackground(
  carImageBuffer: Buffer,
  backgroundImageBuffer: Buffer,
  options: CompositingOptions = {}
): Promise<Buffer> {
  const logPrefix = '[ImageCompositor]';
  console.log(`${logPrefix} Compositing car onto background`);

  // Get background dimensions
  const backgroundMetadata = await sharp(backgroundImageBuffer).metadata();
  const bgWidth = backgroundMetadata.width || 1920;
  const bgHeight = backgroundMetadata.height || 1080;

  console.log(`${logPrefix} Background dimensions: ${bgWidth}x${bgHeight}`);

  // Get car dimensions
  const carMetadata = await sharp(carImageBuffer).metadata();
  const carWidth = carMetadata.width || 0;
  const carHeight = carMetadata.height || 0;

  console.log(`${logPrefix} Car dimensions: ${carWidth}x${carHeight}`);

  // Calculate car scale to fit nicely in background (max 60% of background width)
  const maxCarWidth = bgWidth * 0.6;
  const maxCarHeight = bgHeight * 0.6;
  
  let scale = 1;
  if (carWidth > maxCarWidth) {
    scale = maxCarWidth / carWidth;
  }
  if (carHeight * scale > maxCarHeight) {
    scale = maxCarHeight / carHeight;
  }

  // Apply user-specified scale if provided (for future use)
  if (options.carScale && options.carScale > 0 && options.carScale <= 1) {
    scale = options.carScale;
  }

  const scaledCarWidth = Math.round(carWidth * scale);
  const scaledCarHeight = Math.round(carHeight * scale);

  console.log(`${logPrefix} Scaling car to: ${scaledCarWidth}x${scaledCarHeight} (scale: ${scale.toFixed(2)})`);

  // Resize car image
  const resizedCar = await sharp(carImageBuffer)
    .resize(scaledCarWidth, scaledCarHeight, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();

  // Calculate position (center by default, or use provided position)
  let left = Math.round((bgWidth - scaledCarWidth) / 2);
  let top = Math.round((bgHeight - scaledCarHeight) / 2);

  if (options.carPosition) {
    left = Math.max(0, Math.min(bgWidth - scaledCarWidth, options.carPosition.x));
    top = Math.max(0, Math.min(bgHeight - scaledCarHeight, options.carPosition.y));
  }

  console.log(`${logPrefix} Positioning car at: (${left}, ${top})`);

  // Composite car onto background
  const blendMode = options.blendMode || 'over';
  const composite = await sharp(backgroundImageBuffer)
    .composite([
      {
        input: resizedCar,
        left,
        top,
        blend: blendMode,
      },
    ])
    .png()
    .toBuffer();

  console.log(`${logPrefix} ✓ Compositing complete`);

  return composite;
}

/**
 * Composite car image onto background from URLs
 */
export async function compositeCarOnBackgroundFromUrls(
  carImageUrl: string,
  backgroundImageUrl: string,
  options: CompositingOptions = {}
): Promise<Buffer> {
  const logPrefix = '[ImageCompositor]';
  console.log(`${logPrefix} Downloading images...`);

  const [carBuffer, backgroundBuffer] = await Promise.all([
    downloadImage(carImageUrl),
    downloadImage(backgroundImageUrl),
  ]);

  return compositeCarOnBackground(carBuffer, backgroundBuffer, options);
}

