import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import Replicate from 'replicate';
import { uploadToS3, getS3Url } from '@/lib/storage/s3-uploader';

export const dynamic = 'force-dynamic';

const SEEDANCE_MODEL = 'bytedance/seedance-1-pro-fast';
const MAX_POLL_ATTEMPTS = 180; // 6 minutes (180 * 2s)
const POLL_INTERVAL = 2000; // 2 seconds

/**
 * POST /api/seedance-test/generate
 * Generates a video using ByteDance Seedance 1 Pro Fast model
 *
 * Request Body (FormData):
 * - image0, image1, ...: File (at least one required)
 * - imageCount: string (number of images)
 * - prompt: string (required)
 *
 * Response:
 * {
 *   success: boolean;
 *   videoUrl?: string;
 *   predictionId?: string;
 *   prompt?: string;
 *   error?: string;
 * }
 */
export async function POST(request: NextRequest) {
  const timestamp = new Date().toISOString();

  try {
    // Check for required environment variables
    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json(
        {
          success: false,
          error: 'REPLICATE_API_TOKEN environment variable is not set.',
        },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const imageCount = parseInt(formData.get('imageCount') as string) || 0;
    const prompt = formData.get('prompt') as string;
    const durationParam = formData.get('duration') as string;
    const duration = durationParam ? parseInt(durationParam) : 5;

    // Collect all image files
    const imageFiles: File[] = [];
    for (let i = 0; i < imageCount; i++) {
      const imageFile = formData.get(`image${i}`) as File;
      if (imageFile) {
        imageFiles.push(imageFile);
      }
    }

    // Fallback: check for single 'image' field for backward compatibility
    if (imageFiles.length === 0) {
      const singleImage = formData.get('image') as File;
      if (singleImage) {
        imageFiles.push(singleImage);
      }
    }

    // Validate required fields
    if (imageFiles.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required field: at least one image file is required',
        },
        { status: 400 }
      );
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing or invalid required field: prompt',
        },
        { status: 400 }
      );
    }

    console.log('[Seedance Test] ========================================');
    console.log('[Seedance Test] Request received');
    console.log('[Seedance Test] Timestamp:', timestamp);
    console.log('[Seedance Test] Model:', SEEDANCE_MODEL);
    console.log('[Seedance Test] Number of images:', imageFiles.length);
    imageFiles.forEach((file, i) => {
      console.log(`[Seedance Test] Image ${i + 1}:`, file.name, '-', file.size, 'bytes');
    });
    console.log('[Seedance Test] Prompt:', prompt);
    console.log('[Seedance Test] Duration:', duration, 'seconds');
    console.log('[Seedance Test] ========================================');

    // Create uploads directory
    const uploadsDir = join(process.cwd(), 'tmp', 'seedance-test');
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    const fileTimestamp = Date.now();

    // Process all images and upload to S3
    const imageUrls: string[] = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const imageFile = imageFiles[i];
      const bytes = await imageFile.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const fileName = `${fileTimestamp}-${i}-${imageFile.name}`;
      const filePath = join(uploadsDir, fileName);

      await writeFile(filePath, buffer);
      console.log(`[Seedance Test] Image ${i + 1} saved to:`, filePath);

      // Upload to S3 to get a public URL
      let imageUrl: string;
      try {
        console.log(`[Seedance Test] Uploading image ${i + 1} to S3...`);
        const s3Key = await uploadToS3(filePath, `seedance-test/${fileName}`);
        imageUrl = getS3Url(s3Key);
        console.log(`[Seedance Test] Image ${i + 1} uploaded to S3:`, imageUrl);
      } catch (s3Error: any) {
        console.error(`[Seedance Test] S3 upload failed for image ${i + 1}:`, s3Error?.message || s3Error);
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        imageUrl = `${baseUrl}/api/images/${encodeURIComponent(filePath)}`;
        console.warn(`[Seedance Test] Using fallback local URL for image ${i + 1}:`, imageUrl);
      }

      imageUrls.push(imageUrl);
    }

    // Initialize Replicate client
    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    console.log('[Seedance Test] Creating prediction with Seedance 1 Pro Fast...');
    console.log('[Seedance Test] Input image URLs:', imageUrls);

    // Build input - Seedance uses the first image as the primary reference
    // Additional images can be passed as reference images if the model supports it
    const input: Record<string, unknown> = {
      prompt: prompt.trim(),
      duration: duration,
      aspect_ratio: '16:9',
    };

    // Pass the primary image (first one)
    input.image = imageUrls[0];

    // If there are additional reference images, pass them as well
    // The model may support additional reference images
    if (imageUrls.length > 1) {
      input.reference_images = imageUrls.slice(1);
    }

    // Create prediction with Seedance 1 Pro Fast
    const prediction = await replicate.predictions.create({
      model: SEEDANCE_MODEL,
      input,
    });

    console.log('[Seedance Test] Prediction created:', prediction.id);
    console.log('[Seedance Test] Initial status:', prediction.status);

    // Poll for completion
    let completed = false;
    let attempts = 0;
    let result = prediction;

    console.log('[Seedance Test] Starting polling for completion...');
    console.log(`[Seedance Test] Max attempts: ${MAX_POLL_ATTEMPTS} (${(MAX_POLL_ATTEMPTS * POLL_INTERVAL) / 1000 / 60} minutes)`);

    while (!completed && attempts < MAX_POLL_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

      result = await replicate.predictions.get(prediction.id);
      attempts++;

      const elapsedSeconds = (attempts * POLL_INTERVAL) / 1000;
      console.log(`[Seedance Test] Polling attempt ${attempts}/${MAX_POLL_ATTEMPTS} (${elapsedSeconds.toFixed(1)}s) - Status: ${result.status}`);

      if (result.status === 'succeeded') {
        completed = true;
        console.log('[Seedance Test] Video generation succeeded!');
      } else if (result.status === 'failed') {
        const errorMessage = result.error || 'Unknown error';
        console.error('[Seedance Test] Video generation failed:', errorMessage);
        throw new Error(`Video generation failed: ${errorMessage}`);
      } else if (result.status === 'canceled') {
        console.error('[Seedance Test] Video generation was canceled');
        throw new Error('Video generation was canceled');
      }
    }

    if (!completed) {
      const timeoutMinutes = (MAX_POLL_ATTEMPTS * POLL_INTERVAL) / 1000 / 60;
      console.error(`[Seedance Test] Video generation timed out after ${timeoutMinutes} minutes`);
      throw new Error(`Video generation timed out after ${timeoutMinutes} minutes`);
    }

    // Extract video URL from output
    let videoUrl: string | null = null;

    if (result.output) {
      if (typeof result.output === 'string') {
        videoUrl = result.output;
      } else if (Array.isArray(result.output) && result.output.length > 0) {
        videoUrl = result.output[0];
      } else if (typeof result.output === 'object' && 'url' in result.output) {
        videoUrl = (result.output as { url: string }).url;
      } else if (typeof result.output === 'object' && result.output !== null) {
        const outputStr = JSON.stringify(result.output);
        const urlMatch = outputStr.match(/https?:\/\/[^\s"']+/);
        if (urlMatch) {
          videoUrl = urlMatch[0];
        }
      }
    }

    if (!videoUrl) {
      console.error('[Seedance Test] No video URL found in prediction output');
      console.error('[Seedance Test] Output type:', typeof result.output);
      console.error('[Seedance Test] Output value:', JSON.stringify(result.output, null, 2));
      throw new Error('No video URL in prediction output');
    }

    console.log('[Seedance Test] Video URL extracted:', videoUrl);
    console.log('[Seedance Test] ========================================');
    console.log('[Seedance Test] Generation complete!');
    console.log('[Seedance Test] ========================================');

    return NextResponse.json({
      success: true,
      videoUrl,
      predictionId: prediction.id,
      prompt: prompt.trim(),
      inputImageCount: imageFiles.length,
    });
  } catch (error: any) {
    console.error('[Seedance Test] ========================================');
    console.error('[Seedance Test] Error occurred');
    console.error('[Seedance Test] ========================================');
    console.error('[Seedance Test] Error message:', error?.message || error);
    if (error?.stack) {
      console.error('[Seedance Test] Stack trace:', error.stack);
    }
    console.error('[Seedance Test] ========================================');

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate video',
      },
      { status: 500 }
    );
  }
}
