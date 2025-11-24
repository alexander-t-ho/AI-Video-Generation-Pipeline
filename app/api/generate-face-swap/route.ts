/**
 * Face Swap Generation API Route using Nano Banana Pro
 *
 * POST /api/generate-face-swap
 * Swaps the face of the person in Image 1 to the face of the person in Image 2
 */

import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

const NANO_BANANA_PRO_MODEL = 'zsxkib/nano-bananafaceswap:363e7f40d0dc9ae2b68e9ffff70c23d50a5c6c9c256e4c8c2d0fd9820cf44e63';

interface FaceSwapRequest {
  image1Url: string; // Face to swap (source face)
  image2Url: string; // Target image (destination to paste face on)
  projectId: string;
  sceneIndex: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: FaceSwapRequest = await request.json();

    if (!body.image1Url || !body.image2Url) {
      return NextResponse.json(
        { success: false, error: 'Both image1Url and image2Url are required' },
        { status: 400 }
      );
    }

    if (!body.projectId) {
      return NextResponse.json(
        { success: false, error: 'projectId is required' },
        { status: 400 }
      );
    }

    const replicateToken = process.env.REPLICATE_API_TOKEN;

    if (!replicateToken) {
      return NextResponse.json(
        { success: false, error: 'Replicate API token not configured' },
        { status: 500 }
      );
    }

    // Resolve image URLs to full URLs if they're local paths
    const resolveUrl = (url: string) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }
      // For local API paths, make them full URLs
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      if (url.startsWith('/api/')) {
        return `${baseUrl}${url}`;
      }
      // For local file paths, use the serve-image API
      return `${baseUrl}/api/serve-image?path=${encodeURIComponent(url)}`;
    };

    const image1FullUrl = resolveUrl(body.image1Url);
    const image2FullUrl = resolveUrl(body.image2Url);

    console.log('[FaceSwap] Starting face swap generation');
    console.log('[FaceSwap] Image 1 (source face):', image1FullUrl);
    console.log('[FaceSwap] Image 2 (target):', image2FullUrl);

    const replicate = new Replicate({
      auth: replicateToken,
    });

    // Run the Nano Banana Pro model
    // The model swaps the face from swap_image onto the target_image
    const output = await replicate.run(NANO_BANANA_PRO_MODEL, {
      input: {
        target_image: image2FullUrl,  // The image where face will be pasted
        swap_image: image1FullUrl,    // The face to use
      },
    });

    console.log('[FaceSwap] Replicate output:', output);

    if (!output) {
      return NextResponse.json(
        { success: false, error: 'No output from face swap model' },
        { status: 500 }
      );
    }

    // The output is typically a URL to the generated image
    const outputUrl = Array.isArray(output) ? output[0] : output;

    if (!outputUrl || typeof outputUrl !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid output from face swap model' },
        { status: 500 }
      );
    }

    // Download and save the image locally
    const imageId = uuidv4();
    const outputDir = path.join(process.cwd(), 'output', body.projectId, 'face-swaps');

    // Create directory if it doesn't exist
    await fs.promises.mkdir(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, `faceswap-${imageId}.png`);

    // Download the image
    const imageResponse = await fetch(outputUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to download face swap result');
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    await fs.promises.writeFile(outputPath, Buffer.from(imageBuffer));

    console.log('[FaceSwap] Saved face swap result to:', outputPath);

    // Create the generated image object
    const generatedImage = {
      id: imageId,
      url: `/api/serve-image?path=${encodeURIComponent(outputPath)}`,
      localPath: outputPath,
      prompt: 'Face swap: swap the face of the person in image 1 to the face of the person in image 2',
      replicateId: 'nano-banana-pro',
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      image: generatedImage,
    });
  } catch (error) {
    console.error('[FaceSwap] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
