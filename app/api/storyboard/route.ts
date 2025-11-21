/**
 * Storyboard Generation API Route
 * 
 * POST /api/storyboard
 * 
 * Generates a 5-scene storyboard from a user prompt using OpenAI GPT-4o via OpenRouter.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateStoryboard, createErrorResponse, setRuntimeTextModel } from '@/lib/ai/storyboard-generator';
import { StoryboardRequest, StoryboardResponse } from '@/lib/types';

// ============================================================================
// Request Validation
// ============================================================================

/**
 * Validates the storyboard request
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

  if (body.targetDuration !== undefined) {
    if (typeof body.targetDuration !== 'number') {
      return 'targetDuration must be a number';
    }
    if (body.targetDuration < 10 || body.targetDuration > 60) {
      return 'targetDuration must be between 10 and 60 seconds';
    }
  }

  return null;
}

// ============================================================================
// API Route Handler
// ============================================================================

/**
 * POST /api/storyboard
 * 
 * Generates a 5-scene storyboard from a user prompt.
 * 
 * Request Body:
 * {
 *   prompt: string;           // Required: User's product/ad description
 *   targetDuration?: number;  // Optional: Target video duration (15, 30, or 60)
 * }
 * 
 * Response:
 * {
 *   success: true;
 *   scenes: Scene[];
 * }
 * 
 * Error Responses:
 * - 400: Invalid request
 * - 500: Generation failed
 * - 503: Rate limit or service unavailable
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Check for runtime model override in headers
    const runtimeTextModel = request.headers.get('X-Model-Text');
    if (runtimeTextModel) {
      setRuntimeTextModel(runtimeTextModel);
      console.log(`[Storyboard API] Using runtime model: ${runtimeTextModel}`);
    }

    // Parse request body
    let body: StoryboardRequest;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('[Storyboard API] Failed to parse request body:', parseError);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid JSON in request body',
          code: 'INVALID_REQUEST',
        } as StoryboardResponse,
        { status: 400 }
      );
    }

    // Validate request
    const validationError = validateRequest(body);
    if (validationError) {
      console.error('[Storyboard API] Validation error:', validationError);
      return NextResponse.json(
        {
          success: false,
          error: validationError,
          code: 'INVALID_REQUEST',
        } as StoryboardResponse,
        { status: 400 }
      );
    }

    // Extract parameters
    const prompt = body.prompt.trim();
    const targetDuration = body.targetDuration || 15;
    const referenceImageUrls = body.referenceImageUrls || [];

    console.log('[Storyboard API] Request received:', {
      prompt: prompt.substring(0, 50) + '...',
      targetDuration,
      referenceImageCount: referenceImageUrls.length,
    });

    // Check for API key (either OpenAI or OpenRouter)
    if (!process.env.OPENAI_API_KEY && !process.env.OPENROUTER_API_KEY) {
      console.error('[Storyboard API] No API key configured (need OPENAI_API_KEY or OPENROUTER_API_KEY)');
      return NextResponse.json(
        {
          success: false,
          error: 'No API key configured',
          code: 'GENERATION_FAILED',
        } as StoryboardResponse,
        { status: 500 }
      );
    }
    console.log('[Storyboard API] Using', process.env.OPENAI_API_KEY ? 'OpenAI' : 'OpenRouter');

    // Generate storyboard
    const scenes = await generateStoryboard(prompt, targetDuration, referenceImageUrls);

    const duration = Date.now() - startTime;
    console.log(`[Storyboard API] Successfully generated storyboard in ${duration}ms`);

    // Return success response
    const response: StoryboardResponse = {
      success: true,
      scenes,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Storyboard API] Error after ${duration}ms:`, error);

    // Create error response
    const errorResponse = createErrorResponse(error);

    // Determine HTTP status code
    let statusCode = 500;
    if (errorResponse.code === 'INVALID_REQUEST') {
      statusCode = 400;
    } else if (errorResponse.code === 'AUTHENTICATION_FAILED') {
      statusCode = 401; // Authentication errors should return 401
    } else if (errorResponse.code === 'RATE_LIMIT') {
      statusCode = 503;
    } else if (errorResponse.retryable) {
      statusCode = 503; // Service unavailable for retryable errors
    }

    return NextResponse.json(errorResponse, { status: statusCode });
  }
}

// ============================================================================
// Health Check (Optional)
// ============================================================================

/**
 * GET /api/storyboard
 * 
 * Health check endpoint to verify the API is working.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'storyboard-generation',
      model: 'openai/gpt-4o',
      provider: 'openrouter',
    },
    { status: 200 }
  );
}

