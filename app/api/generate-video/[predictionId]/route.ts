import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';
import path from 'path';
import fs from 'fs/promises';
import https from 'https';
import http from 'http';

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
        const errorMessage = (prediction as any).error || `Video generation ${status}`;
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
    if (projectId && sceneIndex !== undefined) {
      try {
        const sceneIndexNum = parseInt(sceneIndex);
        if (isNaN(sceneIndexNum) || sceneIndexNum < 0 || sceneIndexNum > 4) {
          return NextResponse.json(
            { success: false, error: 'Invalid sceneIndex' },
            { status: 400 }
          );
        }

        // Download video using the generateVideo utility's download function
        // We'll need to extract the download logic or call it directly
        const projectRoot = process.cwd();
        const outputDir = path.join(projectRoot, 'test videos');
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
        const relativePath = path.relative(projectRoot, outputPath);

        return NextResponse.json({
          success: true,
          data: {
            status: 'succeeded',
            output: videoUrl,
            video: {
              localPath: relativePath,
            },
          },
        });
      } catch (downloadError: any) {
        console.error('[API] Video download error:', downloadError);
        // Return status succeeded but without local path
        return NextResponse.json({
          success: true,
          data: {
            status: 'succeeded',
            output: videoUrl,
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

