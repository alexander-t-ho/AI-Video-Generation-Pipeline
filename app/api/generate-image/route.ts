/**
 * Image Generation API Route
 * 
 * POST /api/generate-image
 * 
 * Initiates image generation using Replicate Flux-dev model with IP-Adapter support.
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
// Prompt Adjustment for Reference Images
// ============================================================================

/**
 * Adjusts the prompt to be less specific about object details when a reference image is present.
 * This allows the reference image to define the object while the prompt focuses on scene composition.
 * 
 * Strategy:
 * - Replace specific object descriptions with generic references
 * - Keep scene composition, lighting, and background details
 * - Let the reference image define the object's appearance
 * 
 * @param originalPrompt The original prompt from the storyboard
 * @returns Adjusted prompt that prioritizes reference image
 */
function adjustPromptForReferenceImage(originalPrompt: string): string {
  // ACTION 3: Make prompts even more generic - extract only scene composition, lighting, and background
  // Remove ALL object-specific descriptions to let the reference image define the object
  
  let adjustedPrompt = originalPrompt;

  // Remove all color/material descriptions that might override the reference image
  adjustedPrompt = adjustedPrompt.replace(/\b(silver|black|red|blue|white|gray|grey|gold|metal|leather|wood|plastic|stainless steel|matte|glossy|shiny|dull)\s+/gi, '');
  
  // Remove all object type descriptions
  adjustedPrompt = adjustedPrompt.replace(/\b(modern|sleek|luxury|sports|vintage|classic|premium|high-end|budget|affordable)\s+/gi, '');
  
  // Replace specific object mentions with generic reference
  adjustedPrompt = adjustedPrompt.replace(/\b(car|vehicle|automobile|sedan|suv|coupe|convertible|sports car|luxury car|modern car|vintage car|classic car)\b/gi, 'the same object from the reference image');
  adjustedPrompt = adjustedPrompt.replace(/\b(watch|timepiece|wristwatch|clock)\b/gi, 'the same object from the reference image');
  adjustedPrompt = adjustedPrompt.replace(/\b(product|item|object|thing)\s+(with|featuring|showing|displaying)\s+[^,]+/gi, 'the same object from the reference image');
  
  // Remove object-specific features that might conflict with reference image
  adjustedPrompt = adjustedPrompt.replace(/\b(with|featuring|showing|displaying|including)\s+[^,]+(headlights|wheels|tires|doors|windows|buttons|dials|straps|bands|bezels)\b/gi, '');
  
  // Keep only scene composition words: location, lighting, background, atmosphere
  const sceneWords = [
    'at', 'in', 'on', 'with', 'during', 'sunset', 'sunrise', 'background', 'foreground', 
    'lighting', 'dramatic', 'soft', 'bright', 'dark', 'golden hour', 'blue hour',
    'mountain', 'beach', 'city', 'street', 'road', 'track', 'studio', 'outdoor', 'indoor',
    'positioned', 'placed', 'situated', 'located', 'standing', 'sitting', 'moving', 'stationary',
    'vibrant', 'muted', 'warm', 'cool', 'natural', 'artificial', 'ambient', 'direct',
    'blurred', 'sharp', 'focused', 'depth of field', 'bokeh', 'shallow', 'wide',
    'atmosphere', 'mood', 'feeling', 'emotion', 'energy', 'dynamic', 'static', 'calm', 'energetic'
  ];
  
  // Extract words that are scene-related
  const words = adjustedPrompt.split(/\s+/);
  const filteredWords = words.filter(word => {
    const lowerWord = word.toLowerCase().replace(/[.,!?;:]/g, '');
    return sceneWords.some(sceneWord => lowerWord.includes(sceneWord.toLowerCase())) ||
           lowerWord.includes('reference') ||
           lowerWord.includes('same') ||
           lowerWord.includes('object') ||
           lowerWord.length <= 3; // Keep short words (prepositions, articles)
  });
  
  // Build new prompt with reference image emphasis
  adjustedPrompt = `The same object from the reference image, ${filteredWords.join(' ')}`;
  
  // Clean up duplicate phrases and extra spaces
  adjustedPrompt = adjustedPrompt.replace(/\bthe same\s+the same\b/gi, 'the same');
  adjustedPrompt = adjustedPrompt.replace(/\bthe same\s+object\s+from\s+the\s+reference\s+image\s+the\s+same\s+object\s+from\s+the\s+reference\s+image\b/gi, 'the same object from the reference image');
  adjustedPrompt = adjustedPrompt.replace(/\s+/g, ' '); // Multiple spaces to single space
  adjustedPrompt = adjustedPrompt.replace(/,\s*,/g, ','); // Multiple commas to single comma
  
  return adjustedPrompt.trim();
}

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
    let prompt = body.prompt.trim();
    const projectId = body.projectId.trim();
    const sceneIndex = body.sceneIndex;
    let seedImage = body.seedImage?.trim();
    let referenceImageUrls = body.referenceImageUrls || [];
    const seedFrame = body.seedFrame?.trim(); // Seed frame for IP-Adapter (scenes 1-4)

    // ACTION 1: Verify and convert reference image URLs to publicly accessible URLs
    // Replicate requires HTTP/HTTPS URLs, not local file paths
    const ngrokUrl = process.env.NGROK_URL || 'http://localhost:3000';
    referenceImageUrls = referenceImageUrls.map(url => {
      // If it's already a public URL, use it as-is
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }
      // If it's a local path, convert to serveable URL
      if (url.startsWith('/tmp') || url.startsWith('./') || !url.startsWith('/api')) {
        const publicUrl = `${ngrokUrl}/api/serve-image?path=${encodeURIComponent(url)}`;
        console.log(`[Image Generation API] Converted local path to public URL: ${url.substring(0, 50)}... -> ${publicUrl.substring(0, 80)}...`);
        return publicUrl;
      }
      // If it's already a relative API path, make it absolute
      if (url.startsWith('/api/')) {
        return `${ngrokUrl}${url}`;
      }
      return url;
    });

    // Log URL verification
    const allUrlsPublic = referenceImageUrls.every(url => 
      url.startsWith('http://') || url.startsWith('https://')
    );
    console.log('[Image Generation API] Reference image URLs:', referenceImageUrls.map(url => url.substring(0, 80) + '...'));
    console.log('[Image Generation API] Are all URLs public?', allUrlsPublic);
    if (!allUrlsPublic) {
      console.warn('[Image Generation API] WARNING: Some reference image URLs are not publicly accessible!');
    }

    // OPTION 3: Adjust prompt strategy - make prompts less specific about object details
    // When a reference image is present, modify the prompt to let the reference image define the object
    // This reduces prompt influence and increases reference image influence
    if (referenceImageUrls.length > 0) {
      prompt = adjustPromptForReferenceImage(prompt);
      console.log(`[Image Generation API] Scene ${sceneIndex}: Adjusted prompt to prioritize reference image`);
      console.log(`[Image Generation API] Original prompt: ${body.prompt.substring(0, 100)}...`);
      console.log(`[Image Generation API] Adjusted prompt: ${prompt.substring(0, 100)}...`);
    }

    // ACTION 2: Use IP-Adapter ONLY (remove seed image usage)
    // Using both seed image and IP-Adapter can cause conflicts
    // IP-Adapter with scale 1.0 should be sufficient for object consistency
    // Don't set seedImage - use IP-Adapter only for better control
    if (!seedImage && referenceImageUrls.length > 0) {
      // DON'T set seedImage - use IP-Adapter only
      // seedImage = referenceImageUrls[0]; // REMOVED
      console.log(`[Image Generation API] Scene ${sceneIndex}: Using reference image via IP-Adapter ONLY (no seed image)`);
    }

    console.log('[Image Generation API] Request received:', {
      prompt: prompt.substring(0, 50) + '...',
      projectId,
      sceneIndex,
      hasSeedImage: !!seedImage,
      seedImageUrl: seedImage ? seedImage.substring(0, 80) + '...' : 'none',
      referenceImageCount: referenceImageUrls.length,
      referenceImageUrls: referenceImageUrls.map(url => url.substring(0, 80) + '...'),
      hasSeedFrame: !!seedFrame,
      seedFrameUrl: seedFrame ? seedFrame.substring(0, 80) + '...' : 'none',
      strategy: 'IP-Adapter ONLY (no seed image) - reference image via IP-Adapter with scale 1.0',
      allUrlsPublic,
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

    // Build IP-Adapter images array: reference image (primary) + seed frame (for continuity in scenes 1-4)
    // IP-Adapter scale: 1.0 for maximum reference image influence (let reference image define the object)
    const ipAdapterScale = 1.0;
    const ipAdapterImages: string[] = [];
    
    // Always include reference images for object consistency (primary driver)
    if (referenceImageUrls.length > 0) {
      ipAdapterImages.push(...referenceImageUrls);
    }
    
    // For Scenes 1-4: Add seed frame for visual continuity (secondary)
    if (sceneIndex > 0 && seedFrame) {
      ipAdapterImages.push(seedFrame);
      console.log(`[Image Generation API] Scene ${sceneIndex}: Using seed frame via IP-Adapter for visual continuity`);
    }
    
    const useIpAdapter = ipAdapterImages.length > 0;
    
    const predictionId = await createImagePredictionWithRetry(
      prompt,
      seedImage, // Reference image as seed (PRIMARY driver for object consistency)
      useIpAdapter ? ipAdapterImages : undefined, // Reference image + seed frame via IP-Adapter
      useIpAdapter ? ipAdapterScale : undefined
    );

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

