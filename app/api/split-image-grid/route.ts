/**
 * API Route: Split Image Grid
 * POST /api/split-image-grid
 * 
 * Splits a turnaround sheet image into individual angle images based on a grid layout
 */

import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { uploadToS3, getS3Url } from '@/lib/storage/s3-uploader';

export const dynamic = 'force-dynamic';

interface SplitImageRequest {
  imageUrl: string;      // URL or local path to turnaround sheet image
  frameCount: number;    // Number of angles in the turnaround
  projectId: string;     // Project ID for saving split images
}

/**
 * POST /api/split-image-grid
 * 
 * Splits a turnaround sheet into individual angle images
 * 
 * Request Body:
 * {
 *   imageUrl: string;      // Required: URL or local path to image
 *   frameCount: number;    // Required: Number of angles (determines grid size)
 *   projectId: string;     // Required: Project ID
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body: SplitImageRequest = await request.json();
    const { imageUrl, frameCount, projectId } = body;

    // Validate input
    if (!imageUrl) {
      return NextResponse.json(
        { success: false, error: 'imageUrl is required' },
        { status: 400 }
      );
    }

    if (!frameCount || frameCount < 1) {
      return NextResponse.json(
        { success: false, error: 'frameCount must be at least 1' },
        { status: 400 }
      );
    }

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'projectId is required' },
        { status: 400 }
      );
    }

    console.log(`[SplitImageGrid] Splitting image into ${frameCount} frames`);
    console.log(`[SplitImageGrid] Image URL received: ${imageUrl.substring(0, 100)}...`);

    // Determine if it's a local path or URL
    let imagePath: string;
    let needsCleanup = false;
    
    // Check if it's a URL that needs to be fetched
    const isHttpUrl = imageUrl.startsWith('http://') || imageUrl.startsWith('https://');
    const isApiPath = imageUrl.startsWith('/api/');
    const isLocalPath = imageUrl.startsWith('/tmp') || imageUrl.startsWith('./');
    
    if (isHttpUrl || isApiPath) {
      // Download image from URL or API route
      const fullUrl = isApiPath 
        ? `${request.nextUrl.origin}${imageUrl}`
        : imageUrl;
        
      console.log('[SplitImageGrid] Downloading image from:', fullUrl.substring(0, 100) + '...');
      const response = await fetch(fullUrl);
      if (!response.ok) {
        throw new Error(`Failed to download image (${response.status}): ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Validate buffer
      if (buffer.length === 0) {
        throw new Error('Downloaded image is empty');
      }
      
      // Save temporarily
      const tempPath = `/tmp/${uuidv4()}-turnaround.png`;
      await fs.writeFile(tempPath, buffer);
      console.log('[SplitImageGrid] Saved downloaded image to temp file:', tempPath);
      imagePath = tempPath;
      needsCleanup = true;
    } else if (isLocalPath) {
      // Use local path directly
      console.log('[SplitImageGrid] Using local path directly:', imageUrl.substring(0, 100) + '...');
      imagePath = imageUrl;
    } else {
      // Unknown format - try as local path but warn
      console.warn(`[SplitImageGrid] Unknown URL format, attempting as local path: ${imageUrl}`);
      imagePath = imageUrl;
    }

    // Load the image
    const image = sharp(imagePath);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('Could not read image dimensions');
    }

    console.log(`[SplitImageGrid] Image size: ${metadata.width}x${metadata.height}`);

    // Calculate grid layout
    // For 3 angles: 1 row x 3 cols (horizontal layout)
    // For 4 angles: 2 rows x 2 cols (square layout)
    // For 6 angles: 2 rows x 3 cols, etc.
    const cols = frameCount <= 3 ? frameCount : Math.ceil(Math.sqrt(frameCount));
    const rows = Math.ceil(frameCount / cols);

    console.log(`[SplitImageGrid] Grid layout: ${rows} rows x ${cols} cols`);

    // Calculate dimensions of each cell
    const cellWidth = Math.floor(metadata.width / cols);
    const cellHeight = Math.floor(metadata.height / rows);

    console.log(`[SplitImageGrid] Cell size: ${cellWidth}x${cellHeight}`);

    // Create output directory
    const outputDir = path.join('/tmp', 'projects', projectId, 'split-angles');
    await fs.mkdir(outputDir, { recursive: true });

    // Extract each frame
    const frames: Array<{ url: string; localPath: string; index: number }> = [];

    for (let i = 0; i < frameCount; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;

      const left = col * cellWidth;
      const top = row * cellHeight;

      console.log(`[SplitImageGrid] Extracting frame ${i + 1}/${frameCount} at position (${row}, ${col})`);

      // Extract this cell
      const outputPath = path.join(outputDir, `angle-${i}-${uuidv4()}.png`);
      
      await sharp(imagePath)
        .extract({
          left,
          top,
          width: cellWidth,
          height: cellHeight,
        })
        .toFile(outputPath);

      // Upload to S3
      try {
        const s3Key = await uploadToS3(outputPath, projectId, {
          contentType: 'image/png',
        });
        const s3Url = getS3Url(s3Key);
        console.log(`[SplitImageGrid] Uploaded frame ${i + 1} to S3: ${s3Url}`);

        frames.push({
          url: s3Url,
          localPath: outputPath,
          index: i,
        });

        // Clean up local file after upload
        await fs.unlink(outputPath);
      } catch (s3Error) {
        console.warn(`[SplitImageGrid] Failed to upload frame ${i + 1} to S3, using local path:`, s3Error);
        // Fallback to API route for serving
        const apiUrl = `/api/images/projects/${projectId}/split/angle-${i}-${uuidv4()}.png`;
        frames.push({
          url: apiUrl,
          localPath: outputPath,
          index: i,
        });
      }

      console.log(`[SplitImageGrid] Saved frame ${i + 1} to: ${outputPath}`);
    }

    // Clean up temp file if we downloaded it
    if (needsCleanup) {
      try {
        await fs.unlink(imagePath);
      } catch (err) {
        console.warn('[SplitImageGrid] Failed to clean up temp file:', err);
      }
    }

    console.log(`[SplitImageGrid] Successfully split image into ${frames.length} frames`);

    return NextResponse.json({
      success: true,
      frames,
      gridLayout: { rows, cols },
    });
  } catch (error) {
    console.error('[SplitImageGrid] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        error: `Failed to split image: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}

