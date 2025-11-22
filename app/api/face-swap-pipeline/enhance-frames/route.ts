import { NextRequest, NextResponse } from 'next/server';
import { upscaleFrame, batchUpscaleFrames } from '@/lib/services/face-swap-pipeline/frame-upscaler';
import { interpolateFrames } from '@/lib/services/face-swap-pipeline/frame-interpolator';
import { analyzeImageColors, applyColorMatching } from '@/lib/services/color-matcher';
import { uploadBufferToS3, getS3Url } from '@/lib/storage/s3-uploader';
import { downloadImage } from '@/lib/services/style-image-processor';
import sharp from 'sharp';

export const dynamic = 'force-dynamic';

/**
 * POST /api/face-swap-pipeline/enhance-frames
 * Enhance frames (upscale, color match, interpolate)
 * 
 * Request Body (JSON):
 * {
 *   frameUrls: string[] - Array of frame URLs
 *   enhancementType: 'upscale' | 'color-match' | 'interpolate'
 *   options?: {
 *     scale?: number - For upscaling
 *     model?: 'real-esrgan' | 'realesrgan' - For upscaling
 *   }
 * }
 * 
 * Response:
 * {
 *   success: boolean;
 *   enhancedFrames?: string[];
 *   error?: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json(
        {
          success: false,
          error: 'REPLICATE_API_TOKEN environment variable is not set.',
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { frameUrls, enhancementType, options = {} } = body;

    if (!frameUrls || !Array.isArray(frameUrls) || frameUrls.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing or invalid field: frameUrls (must be non-empty array)',
        },
        { status: 400 }
      );
    }

    if (!enhancementType || !['upscale', 'color-match', 'interpolate'].includes(enhancementType)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing or invalid enhancementType (must be: upscale, color-match, or interpolate)',
        },
        { status: 400 }
      );
    }

    console.log('[EnhanceFrames API] ========================================');
    console.log('[EnhanceFrames API] Enhancing', frameUrls.length, 'frames');
    console.log('[EnhanceFrames API] Type:', enhancementType);

    let enhancedFrames: string[] = [];

    if (enhancementType === 'upscale') {
      // Upscale frames
      const model = (options.model || 'real-esrgan') as 'real-esrgan' | 'realesrgan';
      const scale = options.scale || 2;
      enhancedFrames = await batchUpscaleFrames(frameUrls, model, scale);
    } else if (enhancementType === 'color-match') {
      // Color match frames for consistency
      // Analyze first frame as reference
      const referenceColors = await analyzeImageColors(frameUrls[0]);
      console.log('[EnhanceFrames API] Reference colors:', referenceColors);

      // Process each frame
      for (let i = 0; i < frameUrls.length; i++) {
        try {
          const frameBuffer = await downloadImage(frameUrls[i]);
          const matchedBuffer = await applyColorMatching(frameBuffer, {
            tintColor: referenceColors.averageRgb,
            brightnessAdjust: (referenceColors.averageBrightness - 0.5) * 50,
          });

          // Upload matched frame
          const projectId = `color-match-${Date.now()}`;
          const s3Key = `face-swap-pipeline/${projectId}/color-matched-${i}.png`;
          await uploadBufferToS3(matchedBuffer, s3Key, 'image/png');
          const matchedUrl = getS3Url(s3Key);
          enhancedFrames.push(matchedUrl);
        } catch (error: any) {
          console.error(`[EnhanceFrames API] Failed to color-match frame ${i + 1}:`, error.message);
          enhancedFrames.push(frameUrls[i]); // Use original as fallback
        }
      }
    } else if (enhancementType === 'interpolate') {
      // Interpolate frames (generate intermediate frames)
      // For now, return original frames (interpolation not fully implemented)
      console.warn('[EnhanceFrames API] Frame interpolation not fully implemented');
      enhancedFrames = frameUrls;
    }

    console.log('[EnhanceFrames API] ✓ Enhanced', enhancedFrames.length, 'frames');
    console.log('[EnhanceFrames API] ========================================');

    return NextResponse.json({
      success: true,
      enhancedFrames,
    });
  } catch (error: any) {
    console.error('[EnhanceFrames API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to enhance frames',
      },
      { status: 500 }
    );
  }
}

