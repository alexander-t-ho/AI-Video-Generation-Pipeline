/**
 * Frame Interpolation Service
 * Generates intermediate frames for smooth transitions
 */

import Replicate from 'replicate';

const logPrefix = '[FrameInterpolator]';

// Frame interpolation models (if available on Replicate)
// Note: Google Research Frame Interpolation may not be directly available
// This is a placeholder for when/if it becomes available

const MAX_POLL_ATTEMPTS = 120;
const POLL_INTERVAL = 2000;

/**
 * Interpolate frames between two frames using simple blending
 * @param frame1Url - URL of first frame
 * @param frame2Url - URL of second frame
 * @returns URL of interpolated frame (middle frame)
 */
export async function interpolateFrames(
  frame1Url: string,
  frame2Url: string
): Promise<string> {
  console.log(`${logPrefix} Interpolating between frames`);
  console.log(`${logPrefix} Frame 1: ${frame1Url}`);
  console.log(`${logPrefix} Frame 2: ${frame2Url}`);

  try {
    const sharp = await import('sharp');
    const { downloadImage } = await import('@/lib/services/style-image-processor');
    const { uploadBufferToS3, getS3Url } = await import('@/lib/storage/s3-uploader');

    // Download both frames
    const [frame1Buffer, frame2Buffer] = await Promise.all([
      downloadImage(frame1Url),
      downloadImage(frame2Url),
    ]);

    // Get dimensions
    const metadata1 = await sharp.default(frame1Buffer).metadata();
    const metadata2 = await sharp.default(frame2Buffer).metadata();
    
    const width = Math.max(metadata1.width || 1920, metadata2.width || 1920);
    const height = Math.max(metadata1.height || 1080, metadata2.height || 1080);

    // Resize both frames to same dimensions
    const resized1 = await sharp.default(frame1Buffer)
      .resize(width, height, { fit: 'contain' })
      .toBuffer();
    
    const resized2 = await sharp.default(frame2Buffer)
      .resize(width, height, { fit: 'contain' })
      .toBuffer();

    // Blend frames (50/50 mix for middle frame)
    // Apply opacity to second frame before compositing
    const resized2WithOpacity = await sharp.default(resized2)
      .composite([
        {
          input: Buffer.from([255, 255, 255, Math.round(255 * 0.5)]), // White with 50% opacity
          raw: { width: 1, height: 1, channels: 4 },
          tile: true,
          blend: 'dest-in',
        },
      ])
      .toBuffer();

    const interpolatedBuffer = await sharp.default(resized1)
      .composite([
        {
          input: resized2WithOpacity,
          blend: 'over',
        },
      ])
      .png()
      .toBuffer();

    // Upload interpolated frame to S3
    const projectId = `frame-interpolation-${Date.now()}`;
    const s3Key = `face-swap-pipeline/${projectId}/interpolated.png`;
    await uploadBufferToS3(interpolatedBuffer, s3Key, 'image/png');
    const interpolatedUrl = getS3Url(s3Key);

    console.log(`${logPrefix} ✓ Frame interpolation complete: ${interpolatedUrl}`);
    return interpolatedUrl;
  } catch (error: any) {
    console.error(`${logPrefix} Frame interpolation failed:`, error.message);
    // Fallback: return first frame
    console.warn(`${logPrefix} Using first frame as fallback`);
    return frame1Url;
  }
}

/**
 * Generate multiple interpolated frames between two frames
 * @param frame1Url - URL of first frame
 * @param frame2Url - URL of second frame
 * @param count - Number of frames to generate between them
 * @returns Array of interpolated frame URLs
 */
export async function interpolateMultipleFrames(
  frame1Url: string,
  frame2Url: string,
  count: number = 1
): Promise<string[]> {
  console.log(`${logPrefix} Generating ${count} interpolated frames`);

  try {
    const sharp = await import('sharp');
    const { downloadImage } = await import('@/lib/services/style-image-processor');
    const { uploadBufferToS3, getS3Url } = await import('@/lib/storage/s3-uploader');

    // Download both frames
    const [frame1Buffer, frame2Buffer] = await Promise.all([
      downloadImage(frame1Url),
      downloadImage(frame2Url),
    ]);

    // Get dimensions
    const metadata1 = await sharp.default(frame1Buffer).metadata();
    const metadata2 = await sharp.default(frame2Buffer).metadata();
    
    const width = Math.max(metadata1.width || 1920, metadata2.width || 1920);
    const height = Math.max(metadata1.height || 1080, metadata2.height || 1080);

    // Resize both frames to same dimensions
    const resized1 = await sharp.default(frame1Buffer)
      .resize(width, height, { fit: 'contain' })
      .toBuffer();
    
    const resized2 = await sharp.default(frame2Buffer)
      .resize(width, height, { fit: 'contain' })
      .toBuffer();

    // Generate interpolated frames with different blend ratios
    const interpolatedUrls: string[] = [];
    const projectId = `frame-interpolation-${Date.now()}`;

    for (let i = 1; i <= count; i++) {
      const blendRatio = i / (count + 1); // Evenly spaced between 0 and 1
      const opacity = blendRatio;

      // Apply opacity to second frame before compositing
      const resized2WithOpacity = await sharp.default(resized2)
        .ensureAlpha()
        .composite([
          {
            input: {
              create: {
                width: width,
                height: height,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: opacity },
              },
            },
            blend: 'dest-in',
          },
        ])
        .toBuffer();

      const interpolatedBuffer = await sharp.default(resized1)
        .composite([
          {
            input: resized2WithOpacity,
            blend: 'over',
          },
        ])
        .png()
        .toBuffer();

      const s3Key = `face-swap-pipeline/${projectId}/interpolated-${i}.png`;
      await uploadBufferToS3(interpolatedBuffer, s3Key, 'image/png');
      const interpolatedUrl = getS3Url(s3Key);
      interpolatedUrls.push(interpolatedUrl);
    }

    console.log(`${logPrefix} ✓ Generated ${interpolatedUrls.length} interpolated frames`);
    return interpolatedUrls;
  } catch (error: any) {
    console.error(`${logPrefix} Frame interpolation failed:`, error.message);
    // Fallback: return array of first frame
    return Array(count).fill(frame1Url);
  }
}

