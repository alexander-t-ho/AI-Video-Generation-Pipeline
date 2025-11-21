import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import Replicate from 'replicate';
import { uploadToS3, getS3Url } from '@/lib/storage/s3-uploader';

export const dynamic = 'force-dynamic';

const VEO_MODEL = 'google/veo-3.1-fast';
const MAX_POLL_ATTEMPTS = 180; // 6 minutes (180 * 2s)
const POLL_INTERVAL = 2000; // 2 seconds

/**
 * POST /api/veo-test/generate
 * Generates a video using Google Veo 3.1 Fast model
 * 
 * Request Body (FormData):
 * - image: File (required) - primary input image
 * - images: File[] (optional) - additional reference images
 * - prompt: string (required)
 * - negativePrompt: string (optional) - negative prompt
 * 
 * Response:
 * {
 *   success: boolean;
 *   videoUrl?: string;
 *   predictionId?: string;
 *   prompt?: string;
 *   negativePrompt?: string;
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
    const imageFile = formData.get('image') as File;
    const images = formData.getAll('images') as File[];
    const prompt = formData.get('prompt') as string;
    const negativePrompt = formData.get('negativePrompt') as string | null;

    // Validate required fields
    if (!imageFile) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required field: image file',
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

    // Filter out empty files from images array
    const additionalImages = images.filter((file) => file && file.size > 0);

    console.log('[Veo Test] ========================================');
    console.log('[Veo Test] Request received');
    console.log('[Veo Test] Timestamp:', timestamp);
    console.log('[Veo Test] Model:', VEO_MODEL);
    console.log('[Veo Test] Primary Image:', imageFile.name);
    console.log('[Veo Test] Primary Image Size:', imageFile.size, 'bytes');
    console.log('[Veo Test] Additional Images:', additionalImages.length);
    if (additionalImages.length > 0) {
      additionalImages.forEach((img, idx) => {
        console.log(`[Veo Test]   [${idx + 1}] ${img.name} (${img.size} bytes)`);
      });
    }
    console.log('[Veo Test] Prompt:', prompt);
    if (negativePrompt && negativePrompt.trim().length > 0) {
      console.log('[Veo Test] Negative Prompt:', negativePrompt);
    }
    console.log('[Veo Test] ========================================');

    // Prepare uploads directory
    const uploadsDir = join(process.cwd(), 'tmp', 'veo-test');
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    const fileTimestamp = Date.now();

    // Helper function to upload a single image
    const uploadImageToS3 = async (file: File, index: number = 0): Promise<string> => {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const fileName = index === 0 
        ? `${fileTimestamp}-${file.name}`
        : `${fileTimestamp}-${index}-${file.name}`;
      const filePath = join(uploadsDir, fileName);

      await writeFile(filePath, buffer);
      console.log(`[Veo Test] Image ${index === 0 ? '(primary)' : `#${index}`} saved to:`, filePath);

      try {
        console.log(`[Veo Test] Uploading image ${index === 0 ? '(primary)' : `#${index}`} to S3...`);
        const s3Key = await uploadToS3(filePath, `veo-test/${fileName}`);
        const imageUrl = getS3Url(s3Key);
        console.log(`[Veo Test] ✓ Image ${index === 0 ? '(primary)' : `#${index}`} uploaded to S3:`, imageUrl);
        return imageUrl;
      } catch (s3Error: any) {
        console.error(`[Veo Test] ✗ S3 upload failed for image ${index === 0 ? '(primary)' : `#${index}`}:`, s3Error?.message || s3Error);
        // Fallback to local URL if S3 fails (may not work for Replicate if not publicly accessible)
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const imageUrl = `${baseUrl}/api/images/${encodeURIComponent(filePath)}`;
        console.warn(`[Veo Test] Using fallback local URL for image ${index === 0 ? '(primary)' : `#${index}`} (may not be accessible by Replicate):`, imageUrl);
        return imageUrl;
      }
    };

    // Upload primary image
    const imageUrl = await uploadImageToS3(imageFile, 0);

    // Upload additional reference images
    const referenceImageUrls: string[] = [];
    if (additionalImages.length > 0) {
      console.log('[Veo Test] Uploading additional reference images...');
      for (let i = 0; i < additionalImages.length; i++) {
        const refUrl = await uploadImageToS3(additionalImages[i], i + 1);
        referenceImageUrls.push(refUrl);
      }
      console.log(`[Veo Test] ✓ Uploaded ${referenceImageUrls.length} reference image(s)`);
    }

    // Initialize Replicate client
    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    console.log('[Veo Test] Creating prediction with Veo 3.1 Fast...');
    console.log('[Veo Test] Primary image URL:', imageUrl);
    if (referenceImageUrls.length > 0) {
      console.log('[Veo Test] Reference image URLs:', referenceImageUrls);
    }

    // Build input parameters
    const input: any = {
      image: imageUrl,
      prompt: prompt.trim(),
      duration: 6, // 6 seconds (valid options: 4, 6, or 8)
      aspect_ratio: '16:9',
    };

    // Add negative prompt if provided
    if (negativePrompt && negativePrompt.trim().length > 0) {
      input.negative_prompt = negativePrompt.trim();
      console.log('[Veo Test] Negative prompt:', negativePrompt.trim());
    }

    // Add reference images if provided (Veo may support this for consistency)
    if (referenceImageUrls.length > 0) {
      input.reference_images = referenceImageUrls;
      console.log(`[Veo Test] Using ${referenceImageUrls.length} reference image(s) for consistency`);
    }

    // Create prediction with Veo 3.1 Fast
    const prediction = await replicate.predictions.create({
      model: VEO_MODEL,
      input,
    });

    console.log('[Veo Test] ✓ Prediction created:', prediction.id);
    console.log('[Veo Test] Initial status:', prediction.status);

    // Poll for completion
    let completed = false;
    let attempts = 0;
    let result = prediction;

    console.log('[Veo Test] Starting polling for completion...');
    console.log(`[Veo Test] Max attempts: ${MAX_POLL_ATTEMPTS} (${(MAX_POLL_ATTEMPTS * POLL_INTERVAL) / 1000 / 60} minutes)`);

    while (!completed && attempts < MAX_POLL_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

      result = await replicate.predictions.get(prediction.id);
      attempts++;

      const elapsedSeconds = (attempts * POLL_INTERVAL) / 1000;
      console.log(`[Veo Test] Polling attempt ${attempts}/${MAX_POLL_ATTEMPTS} (${elapsedSeconds.toFixed(1)}s) - Status: ${result.status}`);

      if (result.status === 'succeeded') {
        completed = true;
        console.log('[Veo Test] ✓ Video generation succeeded!');
      } else if (result.status === 'failed') {
        const errorMessage = result.error || 'Unknown error';
        console.error('[Veo Test] ✗ Video generation failed:', errorMessage);
        throw new Error(`Video generation failed: ${errorMessage}`);
      } else if (result.status === 'canceled') {
        console.error('[Veo Test] ✗ Video generation was canceled');
        throw new Error('Video generation was canceled');
      }
    }

    if (!completed) {
      const timeoutMinutes = (MAX_POLL_ATTEMPTS * POLL_INTERVAL) / 1000 / 60;
      console.error(`[Veo Test] ✗ Video generation timed out after ${timeoutMinutes} minutes`);
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
        videoUrl = result.output.url;
      } else if (typeof result.output === 'object' && result.output !== null) {
        // Try to find URL in nested object
        const outputStr = JSON.stringify(result.output);
        const urlMatch = outputStr.match(/https?:\/\/[^\s"']+/);
        if (urlMatch) {
          videoUrl = urlMatch[0];
        }
      }
    }

    if (!videoUrl) {
      console.error('[Veo Test] ✗ No video URL found in prediction output');
      console.error('[Veo Test] Output type:', typeof result.output);
      console.error('[Veo Test] Output value:', JSON.stringify(result.output, null, 2));
      throw new Error('No video URL in prediction output');
    }

    console.log('[Veo Test] ✓ Video URL extracted:', videoUrl);
    console.log('[Veo Test] ========================================');
    console.log('[Veo Test] Generation complete!');
    console.log('[Veo Test] ========================================');

    return NextResponse.json({
      success: true,
      videoUrl,
      predictionId: prediction.id,
      prompt: prompt.trim(),
      negativePrompt: negativePrompt?.trim() || undefined,
    });
  } catch (error: any) {
    console.error('[Veo Test] ========================================');
    console.error('[Veo Test] ✗ Error occurred');
    console.error('[Veo Test] ========================================');
    console.error('[Veo Test] Error message:', error?.message || error);
    if (error?.stack) {
      console.error('[Veo Test] Stack trace:', error.stack);
    }
    console.error('[Veo Test] ========================================');

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate video',
      },
      { status: 500 }
    );
  }
}
