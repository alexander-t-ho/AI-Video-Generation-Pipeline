import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import Replicate from 'replicate';
import { uploadToS3, getS3Url } from '@/lib/storage/s3-uploader';

export const dynamic = 'force-dynamic';

const NANA_BANANA_PRO_MODEL = 'google/nano-banana'; // Replicate model ID (display name: Nana Banana Pro)
const MAX_POLL_ATTEMPTS = 120; // 4 minutes (120 * 2s)
const POLL_INTERVAL = 2000; // 2 seconds

/**
 * POST /api/nana-banana-pro-test/generate
 * Generates/edits images using Google Nana Banana Pro (Gemini 2.5 Flash Image) model
 *
 * Request Body (FormData):
 * - image0, image1, ...: File (at least one required)
 * - imageCount: string (number of images)
 * - prompt: string (required)
 *
 * Response:
 * {
 *   success: boolean;
 *   imageUrl?: string;
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
    const aspectRatio = (formData.get('aspectRatio') as string) || 'match_input_image';
    const outputFormat = (formData.get('outputFormat') as string) || 'jpg';

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

    console.log('[Nana Banana Pro Test] ========================================');
    console.log('[Nana Banana Pro Test] Request received');
    console.log('[Nana Banana Pro Test] Timestamp:', timestamp);
    console.log('[Nana Banana Pro Test] Model:', NANA_BANANA_PRO_MODEL);
    console.log('[Nana Banana Pro Test] Number of images:', imageFiles.length);
    imageFiles.forEach((file, i) => {
      console.log(`[Nana Banana Pro Test] Image ${i + 1}:`, file.name, '-', file.size, 'bytes');
    });
    console.log('[Nana Banana Pro Test] Prompt:', prompt);
    console.log('[Nana Banana Pro Test] Aspect Ratio:', aspectRatio);
    console.log('[Nana Banana Pro Test] Output Format:', outputFormat);
    console.log('[Nana Banana Pro Test] ========================================');

    // Create uploads directory
    const uploadsDir = join(process.cwd(), 'tmp', 'nana-banana-pro-test');
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
      console.log(`[Nana Banana Pro Test] Image ${i + 1} saved to:`, filePath);

      // Upload to S3 to get a public URL
      let imageUrl: string;
      try {
        console.log(`[Nana Banana Pro Test] Uploading image ${i + 1} to S3...`);
        const s3Key = await uploadToS3(filePath, `nana-banana-pro-test/${fileName}`);
        imageUrl = getS3Url(s3Key);
        console.log(`[Nana Banana Pro Test] Image ${i + 1} uploaded to S3:`, imageUrl);
      } catch (s3Error: any) {
        console.error(`[Nana Banana Pro Test] S3 upload failed for image ${i + 1}:`, s3Error?.message || s3Error);
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        imageUrl = `${baseUrl}/api/images/${encodeURIComponent(filePath)}`;
        console.warn(`[Nana Banana Pro Test] Using fallback local URL for image ${i + 1}:`, imageUrl);
      }

      imageUrls.push(imageUrl);
    }

    // Initialize Replicate client
    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    console.log('[Nana Banana Pro Test] Creating prediction with Nana Banana Pro...');
    console.log('[Nana Banana Pro Test] Input image URLs:', imageUrls);

    // Build input based on number of images
    // Nana Banana Pro accepts multiple images via the 'image_input' parameter (array of URIs)
    const input: Record<string, unknown> = {
      prompt: prompt.trim(),
      aspect_ratio: aspectRatio,
      output_format: outputFormat,
    };

    // Pass images as image_input array (the model expects an array of URIs)
    input.image_input = imageUrls;

    console.log('[Nana Banana Pro Test] Input parameters:', {
      prompt: prompt.trim(),
      aspect_ratio: aspectRatio,
      output_format: outputFormat,
      image_count: imageUrls.length,
    });

    // Create prediction with Nana Banana Pro
    const prediction = await replicate.predictions.create({
      model: NANA_BANANA_PRO_MODEL,
      input,
    });

    console.log('[Nana Banana Pro Test] Prediction created:', prediction.id);
    console.log('[Nana Banana Pro Test] Initial status:', prediction.status);

    // Poll for completion
    let completed = false;
    let attempts = 0;
    let result = prediction;

    console.log('[Nana Banana Pro Test] Starting polling for completion...');
    console.log(`[Nana Banana Pro Test] Max attempts: ${MAX_POLL_ATTEMPTS} (${(MAX_POLL_ATTEMPTS * POLL_INTERVAL) / 1000 / 60} minutes)`);

    while (!completed && attempts < MAX_POLL_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

      result = await replicate.predictions.get(prediction.id);
      attempts++;

      const elapsedSeconds = (attempts * POLL_INTERVAL) / 1000;
      console.log(`[Nana Banana Pro Test] Polling attempt ${attempts}/${MAX_POLL_ATTEMPTS} (${elapsedSeconds.toFixed(1)}s) - Status: ${result.status}`);

      if (result.status === 'succeeded') {
        completed = true;
        console.log('[Nana Banana Pro Test] Image generation succeeded!');
      } else if (result.status === 'failed') {
        const errorMessage = result.error || 'Unknown error';
        console.error('[Nana Banana Pro Test] Image generation failed:', errorMessage);
        throw new Error(`Image generation failed: ${errorMessage}`);
      } else if (result.status === 'canceled') {
        console.error('[Nana Banana Pro Test] Image generation was canceled');
        throw new Error('Image generation was canceled');
      }
    }

    if (!completed) {
      const timeoutMinutes = (MAX_POLL_ATTEMPTS * POLL_INTERVAL) / 1000 / 60;
      console.error(`[Nana Banana Pro Test] Image generation timed out after ${timeoutMinutes} minutes`);
      throw new Error(`Image generation timed out after ${timeoutMinutes} minutes`);
    }

    // Extract image URL from output
    let outputImageUrl: string | null = null;

    if (result.output) {
      if (typeof result.output === 'string') {
        outputImageUrl = result.output;
      } else if (Array.isArray(result.output) && result.output.length > 0) {
        outputImageUrl = result.output[0];
      } else if (typeof result.output === 'object' && 'url' in result.output) {
        outputImageUrl = (result.output as { url: string }).url;
      } else if (typeof result.output === 'object' && result.output !== null) {
        const outputStr = JSON.stringify(result.output);
        const urlMatch = outputStr.match(/https?:\/\/[^\s"']+/);
        if (urlMatch) {
          outputImageUrl = urlMatch[0];
        }
      }
    }

    if (!outputImageUrl) {
      console.error('[Nana Banana Pro Test] No image URL found in prediction output');
      console.error('[Nana Banana Pro Test] Output type:', typeof result.output);
      console.error('[Nana Banana Pro Test] Output value:', JSON.stringify(result.output, null, 2));
      throw new Error('No image URL in prediction output');
    }

    console.log('[Nana Banana Pro Test] Image URL extracted:', outputImageUrl);
    console.log('[Nana Banana Pro Test] ========================================');
    console.log('[Nana Banana Pro Test] Generation complete!');
    console.log('[Nana Banana Pro Test] ========================================');

    return NextResponse.json({
      success: true,
      imageUrl: outputImageUrl,
      predictionId: prediction.id,
      prompt: prompt.trim(),
      inputImageCount: imageFiles.length,
    });
  } catch (error: any) {
    console.error('[Nana Banana Pro Test] ========================================');
    console.error('[Nana Banana Pro Test] Error occurred');
    console.error('[Nana Banana Pro Test] ========================================');
    console.error('[Nana Banana Pro Test] Error message:', error?.message || error);
    if (error?.stack) {
      console.error('[Nana Banana Pro Test] Stack trace:', error.stack);
    }
    console.error('[Nana Banana Pro Test] ========================================');

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate image',
      },
      { status: 500 }
    );
  }
}
