import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';
import path from 'path';
import fs from 'fs/promises';
import https from 'https';
import http from 'http';
import { getVideoDuration } from '@/lib/video/editor';

/**
 * GET /api/generate-video/[predictionId]
 * Checks video generation status (client should poll this endpoint)
 * 
 * Query Parameters (optional):
 * - projectId: string - If provided, downloads video when complete
 * - sceneIndex: number - If provided, downloads video when complete
 * 
 * Response:
 * {
 *   success: boolean;
 *   data?: {
 *     status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
 *     output?: string;  // Video URL from Replicate (when succeeded)
 *     video?: {
 *       localPath: string;
 *       duration?: number;  // Video duration in seconds (when succeeded)
 *     };
 *   };
 *   error?: string;
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { predictionId: string } }
) {
  try {
    const { predictionId } = params;

    if (!predictionId || typeof predictionId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'predictionId is required' },
        { status: 400 }
      );
    }

    // Check for required environment variables
    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json(
        { success: false, error: 'REPLICATE_API_TOKEN environment variable is not set.' },
        { status: 500 }
      );
    }

    // Get optional query parameters for downloading video
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');
    const sceneIndex = searchParams.get('sceneIndex');

    // Check prediction status (don't poll, just get current status)
    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    const prediction = await replicate.predictions.get(predictionId);

    const status = prediction.status as 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';

    // If not succeeded, return current status
    if (status !== 'succeeded') {
      if (status === 'failed' || status === 'canceled') {
        // Extract detailed error message from Replicate
        const errorDetails = (prediction as any).error;
        let errorMessage = `Video generation ${status}`;
        
        if (errorDetails) {
          if (typeof errorDetails === 'string') {
            errorMessage = errorDetails;
          } else if (errorDetails.detail) {
            errorMessage = errorDetails.detail;
          } else if (errorDetails.message) {
            errorMessage = errorDetails.message;
          }
        }
        
        console.error('[API] Video generation failed:', {
          predictionId,
          status,
          error: errorDetails,
        });
        
        return NextResponse.json({
          success: false,
          error: errorMessage,
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          status,
        },
      });
    }

    // Status is succeeded - extract video URL
    let videoUrl: string;
    if (typeof prediction.output === 'string') {
      videoUrl = prediction.output;
    } else if (Array.isArray(prediction.output) && prediction.output.length > 0) {
      videoUrl = prediction.output[0];
    } else {
      return NextResponse.json({
        success: false,
        error: 'Prediction succeeded but no output URL found',
      });
    }

    // If projectId and sceneIndex are provided, download and save the video
    if (projectId && sceneIndex !== null) {
      try {
        const sceneIndexNum = parseInt(sceneIndex, 10);
        if (isNaN(sceneIndexNum) || sceneIndexNum < 0 || sceneIndexNum > 4) {
          return NextResponse.json(
            { success: false, error: 'Invalid sceneIndex' },
            { status: 400 }
          );
        }

        // Download video using the generateVideo utility's download function
        // We'll need to extract the download logic or call it directly
        const projectRoot = process.cwd();
        const outputDir = path.join(projectRoot, 'video testing');
        await fs.mkdir(outputDir, { recursive: true });

        const timestamp = Date.now();
        const outputPath = path.join(outputDir, `scene-${sceneIndexNum}-${timestamp}.mp4`);

        // Download video from Replicate URL
        const fsSync = require('fs');

        await new Promise<void>((resolve, reject) => {
          const protocol = videoUrl.startsWith('https') ? https : http;
          const fileStream = fsSync.createWriteStream(outputPath);

          protocol.get(videoUrl, (response: any) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
              // Handle redirect
              return protocol.get(response.headers.location, (redirectResponse: any) => {
                redirectResponse.pipe(fileStream);
                fileStream.on('finish', () => {
                  fileStream.close();
                  resolve();
                });
              }).on('error', reject);
            }

            response.pipe(fileStream);
            fileStream.on('finish', () => {
              fileStream.close();
              resolve();
            });
          }).on('error', (err: Error) => {
            fsSync.unlink(outputPath, () => {});
            reject(err);
          });
        });

        // Verify file was created
        await fs.access(outputPath);
        // Return absolute path for consistency with other file paths in the system
        const absolutePath = outputPath;

        // Extract video duration
        let duration: number | undefined;
        try {
          duration = await getVideoDuration(absolutePath);
          console.log(`[API] Video duration: ${duration}s`);
        } catch (durationError) {
          console.warn(`[API] Failed to extract video duration:`, durationError);
          // Continue without duration - it's not critical
        }

        return NextResponse.json({
          success: true,
          data: {
            status: 'succeeded',
            output: videoUrl,
            video: {
              localPath: absolutePath,
              duration,
            },
          },
        });
      } catch (downloadError: any) {
        console.error('[API] Video download error:', downloadError);
        // Return status succeeded with Replicate URL even if download failed
        // Client can use the Replicate URL directly
        return NextResponse.json({
          success: true,
          data: {
            status: 'succeeded',
            output: videoUrl, // Replicate URL - client can use this
            error: `Video download failed: ${downloadError.message}. Using Replicate URL instead.`,
          },
        });
      }
    }

    // Return status with video URL but no local download
    return NextResponse.json({
      success: true,
      data: {
        status: 'succeeded',
        output: videoUrl,
      },
    });
  } catch (error: any) {
    console.error('[API] Video status polling error:', error);

    // Check if it's a timeout or still processing
    if (error.message?.includes('timeout') || error.message?.includes('polling')) {
      return NextResponse.json({
        success: true,
        data: {
          status: 'processing',
        },
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to get video generation status',
      },
      { status: 500 }
    );
  }
}

