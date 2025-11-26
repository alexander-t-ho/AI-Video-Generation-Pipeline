/**
 * Image Generation Status API Route
 * 
 * GET /api/generate-image/[predictionId]
 * 
 * Polls the status of an image generation prediction.
 * When status is 'succeeded', downloads and saves the image if projectId and sceneIndex are provided.
 */

import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';
import {
  pollReplicateStatus,
  downloadAndSaveImageWithRetry,
  isRetryableError,
  getUserFriendlyErrorMessage,
  getErrorCode,
} from '@/lib/ai/image-generator';
import { ImageStatusResponse } from '@/lib/types';

// ============================================================================
// Types
// ============================================================================

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
  created_at?: string;
  completed_at?: string;
}

// ============================================================================
// Replicate Client Helper
// ============================================================================

/**
 * Creates and configures a Replicate client
 * @returns Configured Replicate client instance
 */
function createReplicateClient(): Replicate {
  const apiToken = process.env.REPLICATE_API_TOKEN;

  if (!apiToken) {
    throw new Error('REPLICATE_API_TOKEN environment variable is not set');
  }

  return new Replicate({
    auth: apiToken,
  });
}

// ============================================================================
// API Route Handler
// ============================================================================

/**
 * GET /api/generate-image/[predictionId]
 * 
 * Polls the status of an image generation prediction.
 * 
 * URL Parameters:
 * - predictionId: The prediction ID returned from POST request
 * 
 * Query Parameters (optional, required for auto-download):
 * - projectId: Project ID for file organization (required if auto-download)
 * - sceneIndex: Scene index 0-4 (required if auto-download)
 * - prompt: Original prompt used (optional, for GeneratedImage object)
 * 
 * Response:
 * {
 *   success: true;
 *   status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
 *   image?: GeneratedImage;  // Only present when status === 'succeeded' and downloaded
 *   error?: string;           // Only present when status === 'failed'
 * }
 * 
 * Error Responses:
 * - 404: Prediction not found
 * - 500: Polling error
 * - 503: Service unavailable (retryable)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { predictionId: string } }
) {
  const startTime = Date.now();

  try {
    const predictionId = params.predictionId;

    if (!predictionId || typeof predictionId !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing or invalid predictionId',
          code: 'INVALID_REQUEST',
        } as ImageStatusResponse,
        { status: 400 }
      );
    }

    // Get optional query parameters for auto-download
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');
    const sceneIndexParam = searchParams.get('sceneIndex');
    const prompt = searchParams.get('prompt') || '';

    const sceneIndex = sceneIndexParam ? parseInt(sceneIndexParam, 10) : undefined;

    console.log('[Image Status API] Request received:', {
      predictionId,
      projectId: projectId || 'not provided',
      sceneIndex: sceneIndex !== undefined ? sceneIndex : 'not provided',
    });

    // Check for API key
    if (!process.env.REPLICATE_API_TOKEN) {
      console.error('[Image Status API] REPLICATE_API_TOKEN not configured');
      return NextResponse.json(
        {
          success: false,
          error: 'Replicate API token not configured',
          code: 'POLLING_FAILED',
        } as ImageStatusResponse,
        { status: 500 }
      );
    }

    const replicate = createReplicateClient();

    // Get prediction status
    let prediction: ReplicatePrediction;
    try {
      prediction = (await replicate.predictions.get(predictionId)) as ReplicatePrediction;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Check if prediction not found
      if (errorMessage.includes('404') || errorMessage.includes('not found')) {
        return NextResponse.json(
          {
            success: false,
            status: 'failed',
            error: 'Prediction not found. Please check the prediction ID and try again.',
            code: 'NOT_FOUND' as const,
            retryable: false,
          } as ImageStatusResponse,
          { status: 404 }
        );
      }

      throw error;
    }

    const duration = Date.now() - startTime;
    console.log(
      `[Image Status API] Status retrieved in ${duration}ms: ${prediction.status}`
    );

    // Handle different statuses
    if (prediction.status === 'succeeded') {
      // Extract output URL
      let imageUrl: string;

      if (typeof prediction.output === 'string') {
        imageUrl = prediction.output;
      } else if (Array.isArray(prediction.output) && prediction.output.length > 0) {
        imageUrl = prediction.output[0];
      } else {
        return NextResponse.json(
          {
            success: false,
            error: 'Prediction succeeded but no output URL found',
            code: 'POLLING_FAILED',
          } as ImageStatusResponse,
          { status: 500 }
        );
      }

      // If projectId and sceneIndex are provided, download and save automatically
      if (projectId && sceneIndex !== undefined) {
        try {
          console.log('[Image Status API] Auto-downloading image...');
          const generatedImage = await downloadAndSaveImageWithRetry(
            imageUrl,
            projectId,
            sceneIndex
          );

          // Set prompt and replicateId
          generatedImage.prompt = prompt || '';
          generatedImage.replicateId = predictionId;

          return NextResponse.json(
            {
              success: true,
              status: 'succeeded',
              image: generatedImage,
            } as ImageStatusResponse,
            { status: 200 }
          );
        } catch (downloadError) {
          console.error('[Image Status API] Failed to download image:', downloadError);
          // Return status succeeded WITH the raw Replicate URL so client can still display it
          const { v4: uuidv4 } = require('uuid');
          return NextResponse.json(
            {
              success: true,
              status: 'succeeded',
              image: {
                id: uuidv4(),
                url: imageUrl,
                // Don't set localPath for remote URLs - formatImageUrl will handle it correctly
                prompt: prompt || '',
                replicateId: predictionId,
                createdAt: new Date().toISOString(),
              },
            } as ImageStatusResponse,
            { status: 200 }
          );
        }
      } else {
        // Status succeeded but no auto-download - return the raw Replicate URL
        const { v4: uuidv4 } = require('uuid');
        return NextResponse.json(
          {
            success: true,
            status: 'succeeded',
            image: {
              id: uuidv4(),
              url: imageUrl,
              // Don't set localPath for remote URLs - formatImageUrl will handle it correctly
              prompt: prompt || '',
              replicateId: predictionId,
              createdAt: new Date().toISOString(),
            },
          } as ImageStatusResponse,
          { status: 200 }
        );
      }
    }

    if (prediction.status === 'failed') {
      const errorMessage = prediction.error || 'Image generation failed';
      const duration = Date.now() - startTime;
      console.error(`[Image Status API] Prediction failed after ${duration}ms:`, {
        predictionId,
        error: errorMessage,
        projectId: projectId || 'not provided',
        sceneIndex: sceneIndex !== undefined ? sceneIndex : 'not provided',
      });
      
      return NextResponse.json(
        {
          success: false,
          status: 'failed',
          error: getUserFriendlyErrorMessage(new Error(errorMessage)),
          code: getErrorCode(new Error(errorMessage)),
          retryable: isRetryableError(new Error(errorMessage)),
        } as ImageStatusResponse,
        { status: 200 } // 200 because the API call succeeded, just the prediction failed
      );
    }

    if (prediction.status === 'canceled') {
      return NextResponse.json(
        {
          success: false,
          status: 'canceled',
          error: 'Image generation was canceled',
          code: 'PREDICTION_FAILED' as const,
          retryable: false,
        } as ImageStatusResponse,
        { status: 200 }
      );
    }

    // Status is 'starting' or 'processing'
    return NextResponse.json(
      {
        success: true,
        status: prediction.status,
      } as ImageStatusResponse,
      { status: 200 }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Image Status API] Error after ${duration}ms:`, error);

    // Use enhanced error handling
    const userFriendlyMessage = getUserFriendlyErrorMessage(error);
    const code = getErrorCode(error);
    const retryable = isRetryableError(error);

    // Determine HTTP status code
    let statusCode = 500;
    if (retryable) {
      statusCode = 503; // Service unavailable for retryable errors
    }

    const errorResponse: ImageStatusResponse = {
      success: false,
      status: 'failed',
      error: userFriendlyMessage,
      code,
      retryable,
    };

    return NextResponse.json(errorResponse, { status: statusCode });
  }
}

