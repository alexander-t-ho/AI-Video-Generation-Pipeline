/**
 * Image Generation API Route
 * 
 * POST /api/generate-image
 * 
 * Initiates image generation using Replicate Flux-schnell model.
 * Returns immediately with a prediction ID for polling.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createImagePredictionWithRetry,
  getUserFriendlyErrorMessage,
  getErrorCode,
  isRetryableError,
} from '@/lib/ai/image-generator';
import { ImageGenerationRequest, ImageGenerationResponse } from '@/lib/types';

// ============================================================================
// Request Validation
// ============================================================================

/**
 * Validates the image generation request
 * @param body Request body
 * @returns Validation error message or null if valid
 */
function validateRequest(body: any): string | null {
  if (!body || typeof body !== 'object') {
    return 'Request body is required';
  }

  if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim() === '') {
    return 'Missing required field: prompt';
  }

  if (!body.projectId || typeof body.projectId !== 'string' || body.projectId.trim() === '') {
    return 'Missing required field: projectId';
  }

  if (typeof body.sceneIndex !== 'number') {
    return 'Missing or invalid field: sceneIndex (must be a number)';
  }

  if (body.sceneIndex < 0 || body.sceneIndex > 4) {
    return 'sceneIndex must be between 0 and 4';
  }

  if (body.seedImage !== undefined && typeof body.seedImage !== 'string') {
    return 'seedImage must be a string if provided';
  }

  return null;
}

// ============================================================================
// API Route Handler
// ============================================================================

/**
 * POST /api/generate-image
 * 
 * Creates an image generation prediction on Replicate.
 * Returns immediately with a prediction ID for polling.
 * 
 * Request Body:
 * {
 *   prompt: string;        // Required: Image generation prompt
 *   projectId: string;     // Required: Project ID for file organization
 *   sceneIndex: number;    // Required: Scene index (0-4)
 *   seedImage?: string;     // Optional: URL to seed image for image-to-image
 * }
 * 
 * Response:
 * {
 *   success: true;
 *   predictionId: string;
 *   status: 'starting' | 'processing';
 * }
 * 
 * Error Responses:
 * - 400: Invalid request
 * - 500: Prediction creation failed
 * - 503: Rate limit or service unavailable
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse request body
    let body: ImageGenerationRequest;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('[Image Generation API] Failed to parse request body:', parseError);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid JSON in request body',
          code: 'INVALID_REQUEST',
        } as ImageGenerationResponse,
        { status: 400 }
      );
    }

    // Validate request
    const validationError = validateRequest(body);
    if (validationError) {
      console.error('[Image Generation API] Validation error:', validationError);
      return NextResponse.json(
        {
          success: false,
          error: validationError,
          code: 'INVALID_REQUEST',
        } as ImageGenerationResponse,
        { status: 400 }
      );
    }

    // Extract parameters
    const prompt = body.prompt.trim();
    const projectId = body.projectId.trim();
    const sceneIndex = body.sceneIndex;
    const seedImage = body.seedImage?.trim();
    const referenceImageUrls = body.referenceImageUrls || [];

    console.log('[Image Generation API] Request received:', {
      prompt: prompt.substring(0, 50) + '...',
      projectId,
      sceneIndex,
      hasSeedImage: !!seedImage,
      referenceImageCount: referenceImageUrls.length,
    });

    // Check for API key
    if (!process.env.REPLICATE_API_TOKEN) {
      console.error('[Image Generation API] REPLICATE_API_TOKEN not configured');
      return NextResponse.json(
        {
          success: false,
          error: 'Replicate API token not configured',
          code: 'PREDICTION_FAILED',
        } as ImageGenerationResponse,
        { status: 500 }
      );
    }

    // Enhance prompt with reference images if provided
    // Note: Flux-schnell doesn't directly support reference images, so we incorporate them into the prompt
    let enhancedPrompt = prompt;
    if (referenceImageUrls.length > 0) {
      // Add detailed instructions to maintain product consistency across scenes
      enhancedPrompt = `${prompt}\n\nCRITICAL INSTRUCTIONS FOR PRODUCT CONSISTENCY:\n- The product (headphones) shown in the reference images must appear IDENTICALLY in this scene\n- Use the EXACT same product model, brand, design, colors, materials, textures, and visual details\n- The product's physical appearance, shape, size, and all design elements must match the reference images exactly\n- ONLY the following may vary: camera angle, composition, lighting, background, and scene context\n- The product itself must be visually identical to maintain brand consistency across all scenes\n- Pay special attention to matching: headphone design, color scheme, material finish, brand logos, button placement, and overall aesthetic`;
    }

    // Create prediction
    const predictionId = await createImagePredictionWithRetry(enhancedPrompt, seedImage);

    const duration = Date.now() - startTime;
    console.log(`[Image Generation API] Prediction created in ${duration}ms: ${predictionId}`);

    // Return success response
    const response: ImageGenerationResponse = {
      success: true,
      predictionId,
      status: 'starting', // Initial status
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Image Generation API] Error after ${duration}ms:`, error);

    // Use enhanced error handling
    const userFriendlyMessage = getUserFriendlyErrorMessage(error);
    const code = getErrorCode(error);
    const retryable = isRetryableError(error);

    // Determine HTTP status code
    let statusCode = 500;
    if (code === 'INVALID_REQUEST') {
      statusCode = 400;
    } else if (code === 'RATE_LIMIT') {
      statusCode = 503;
    } else if (code === 'AUTHENTICATION_FAILED') {
      statusCode = 500;
    } else if (retryable) {
      statusCode = 503; // Service unavailable for retryable errors
    }

    const errorResponse: ImageGenerationResponse = {
      success: false,
      error: userFriendlyMessage,
      code,
      retryable,
    };

    return NextResponse.json(errorResponse, { status: statusCode });
  }
}

// ============================================================================
// Health Check (Optional)
// ============================================================================

/**
 * GET /api/generate-image
 * 
 * Health check endpoint to verify the API is working.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'image-generation',
      model: 'black-forest-labs/flux-schnell',
      provider: 'replicate',
    },
    { status: 200 }
  );
}

