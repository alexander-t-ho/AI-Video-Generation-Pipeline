/**
 * API Route: Clean Edges
 * POST /api/clean-edges
 *
 * Cleans up edges of background-removed images using Replicate's RMBG model
 */

import { NextRequest, NextResponse } from 'next/server';
import { cleanupImageEdges } from '@/lib/ai/edge-cleanup';
import { getStorageService } from '@/lib/storage/storage-service';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

interface CleanEdgesRequest {
  imageUrl?: string;
  imageUrls?: string[];
  projectId: string;
  iterations?: number;
}

interface ProcessedImage {
  id: string;
  url: string;
  s3Key?: string;
}

interface CleanEdgesResponse {
  success: boolean;
  processedImage?: ProcessedImage;
  processedImages?: ProcessedImage[];
  error?: string;
}

/**
 * Downloads an image from a URL to a temporary local path
 */
async function downloadImageToTemp(imageUrl: string, projectId: string): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }

  const imageBuffer = Buffer.from(await response.arrayBuffer());

  // Create temp directory
  const tempDir = path.join('/tmp', 'edge-cleanup', projectId);
  await fs.mkdir(tempDir, { recursive: true });

  // Save to temp file
  const filename = `temp-${uuidv4()}.png`;
  const tempPath = path.join(tempDir, filename);
  await fs.writeFile(tempPath, imageBuffer);

  return tempPath;
}

/**
 * POST /api/clean-edges
 *
 * Cleans edges of one or more images
 */
export async function POST(req: NextRequest): Promise<NextResponse<CleanEdgesResponse>> {
  const startTime = Date.now();

  try {
    const body: CleanEdgesRequest = await req.json();

    // Validate request
    if (!body.projectId) {
      return NextResponse.json(
        {
          success: false,
          error: 'projectId is required',
        },
        { status: 400 }
      );
    }

    if (!body.imageUrls || !Array.isArray(body.imageUrls) || body.imageUrls.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'imageUrls array is required and must not be empty',
        },
        { status: 400 }
      );
    }

    const iterations = Math.max(1, Math.min(3, body.iterations || 1)); // Clamp between 1-3
    console.log(`[CleanEdges API] Processing ${body.imageUrls.length} image(s) with ${iterations} iteration(s)`);

    const storageService = getStorageService();
    const processedImages: ProcessedImage[] = [];

    // Process each image
    for (let i = 0; i < body.imageUrls.length; i++) {
      const imageUrl = body.imageUrls[i];
      console.log(`[CleanEdges API] Processing image ${i + 1}/${body.imageUrls.length}: ${imageUrl.substring(0, 50)}...`);

      try {
        // Download image to temp location
        const tempPath = await downloadImageToTemp(imageUrl, body.projectId);
        console.log(`[CleanEdges API] Downloaded to temp: ${tempPath}`);

        // Clean up edges
        const cleanedPath = await cleanupImageEdges(tempPath);
        console.log(`[CleanEdges API] Edge cleanup completed: ${cleanedPath}`);

        // Read the cleaned image
        const cleanedBuffer = await fs.readFile(cleanedPath);

        // Upload to S3
        const stored = await storageService.storeFile(
          cleanedBuffer,
          {
            projectId: body.projectId,
            category: 'processed',
            mimeType: 'image/png',
            customFilename: `edge-cleaned-${uuidv4()}.png`
          },
          {
            keepLocal: false
          }
        );

        // Get a pre-signed URL if we have an S3 key
        let accessibleUrl = stored.url;
        if (stored.s3Key) {
          accessibleUrl = await storageService.getPreSignedUrl(stored.s3Key, 3600);
          console.log(`[CleanEdges API] Generated pre-signed URL for cleaned image ${i + 1}`);
        }

        processedImages.push({
          id: uuidv4(),
          url: accessibleUrl,
          s3Key: stored.s3Key,
        });

        // Clean up temp files
        try {
          await fs.unlink(tempPath);
          await fs.unlink(cleanedPath);
        } catch (cleanupError) {
          console.warn('[CleanEdges API] Failed to clean up temp files:', cleanupError);
        }

      } catch (error) {
        console.error(`[CleanEdges API] Failed to process image ${i + 1}:`, error);
        // Continue with other images even if one fails
      }
    }

    if (processedImages.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to process any images',
        },
        { status: 500 }
      );
    }

    const duration = Date.now() - startTime;
    console.log(`[CleanEdges API] Successfully processed ${processedImages.length}/${body.imageUrls.length} image(s) in ${duration}ms`);

    return NextResponse.json({
      success: true,
      processedImages,
    });

  } catch (error) {
    console.error('[CleanEdges API] Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
