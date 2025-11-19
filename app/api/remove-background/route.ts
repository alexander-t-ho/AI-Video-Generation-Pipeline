/**
 * API Route: Remove Background
 * POST /api/remove-background
 * 
 * Removes background from images using Replicate's RMBG model
 */

import { NextRequest, NextResponse } from 'next/server';
import { removeBackground, removeBackgrounds } from '@/lib/services/background-remover';
import { v4 as uuidv4 } from 'uuid';

interface RemoveBackgroundRequest {
  imageUrl?: string;
  imageUrls?: string[];
  s3Keys?: string[]; // Optional S3 keys for caching
  projectId?: string;
}

interface ProcessedImage {
  id: string;
  url: string;
}

interface RemoveBackgroundResponse {
  success: boolean;
  processedImage?: ProcessedImage;
  processedImages?: ProcessedImage[];
  error?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<RemoveBackgroundResponse>> {
  try {
    const body: RemoveBackgroundRequest = await req.json();

    // Validate request
    if (!body.imageUrls || !Array.isArray(body.imageUrls) || body.imageUrls.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'imageUrls array is required and must not be empty',
        },
        { status: 400 }
      );
    }

    // Validate s3Keys if provided
    if (body.s3Keys && body.s3Keys.length !== body.imageUrls.length) {
      return NextResponse.json(
        {
          success: false,
          error: 's3Keys array length must match imageUrls array length',
        },
        { status: 400 }
      );
    }

    // Process multiple images with optional S3 caching
    const processedUrls = await removeBackgrounds(body.imageUrls, body.s3Keys);
    const processedImages: ProcessedImage[] = processedUrls.map(url => ({
      id: uuidv4(),
      url,
    }));

    return NextResponse.json({
      success: true,
      processedImages,
    });
  } catch (error) {
    console.error('[API:RemoveBackground] Error:', error);

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

