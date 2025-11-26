/**
 * Video Generation API Route
 * POST /api/generate-video
 */

import { NextRequest, NextResponse } from 'next/server';
import { createVideoPredictionWithRetry, setRuntimeVideoModel } from '@/lib/video/generator';
import { validateRequest, createErrorResponse, parseRequestBody, checkEnvVars, commonRules } from '@/lib/api/middleware';

// ============================================================================
// Validation Rules
// ============================================================================

const VIDEO_GEN_RULES = [
  // imageUrl is conditionally required - validated in handler based on useReferenceMode
  {
    field: 'imageUrl',
    type: 'string' as const,
    required: false, // Changed from required: true to support reference-only mode
  },
  commonRules.prompt,
  commonRules.sceneIndex,
  commonRules.projectId,
  {
    field: 'seedFrame',
    type: 'string' as const,
    required: false,
    custom: (value: string) => {
      if (value && !value.startsWith('http://') && !value.startsWith('https://')) {
        return 'seedFrame must be a publicly accessible HTTP/HTTPS URL';
      }
      return null;
    },
  },
  {
    field: 'duration',
    type: 'number' as const,
    required: false,
    min: 1,
    max: 30,
  },
];

// ============================================================================
// API Route Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Check environment
    const envError = checkEnvVars(['REPLICATE_API_TOKEN']);
    if (envError) {
      return NextResponse.json(
        { success: false, error: envError },
        { status: 500 }
      );
    }

    // Parse request body
    const { body, error: parseError } = await parseRequestBody(request);
    if (parseError) return parseError;

    // Validate request
    const validationError = validateRequest(body, VIDEO_GEN_RULES);
    if (validationError) {
      return NextResponse.json(
        { success: false, error: validationError },
        { status: 400 }
      );
    }

    const { imageUrl, prompt, seedFrame, sceneIndex, projectId, duration, referenceImageUrls, modelParameters } = body;

    // Additional validation: imageUrl is required unless in reference-only mode
    const isReferenceMode = modelParameters?.useReferenceMode === true;
    const hasReferenceImages = referenceImageUrls && referenceImageUrls.length > 0;
    
    if (!isReferenceMode || !hasReferenceImages) {
      // Standard mode or frame mode: imageUrl is required
      if (!imageUrl || typeof imageUrl !== 'string' || imageUrl.trim() === '') {
        return NextResponse.json(
          { success: false, error: 'Missing required field: imageUrl (required unless in reference-only mode with reference images)' },
          { status: 400 }
        );
      }
      // Validate it's a proper URL
      if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
        return NextResponse.json(
          { success: false, error: 'imageUrl must be a valid HTTP/HTTPS URL' },
          { status: 400 }
        );
      }
    }

    // Handle runtime model override
    const runtimeVideoModel = request.headers.get('X-Model-Video');
    let selectedModel = runtimeVideoModel;

    // Override Gen-4 Aleph for Scene 0 (requires video input, not image)
    if (selectedModel && sceneIndex === 0 && selectedModel.includes('gen4-aleph')) {
      console.log('[API] Scene 0: Overriding Gen-4 Aleph to Gen-4 Turbo (Aleph requires video input)');
      selectedModel = 'runwayml/gen4-turbo';
    }

    if (selectedModel) {
      setRuntimeVideoModel(selectedModel);
      console.log(`[API] Using model: ${selectedModel}`);
    } else {
      console.log(`[API] Scene ${sceneIndex}: Using default model (Google Veo 3.1)`);
    }

    // Log request
    console.log('========================================');
    console.log('[API] Video Generation Request');
    console.log('========================================');
    console.log('Scene:', sceneIndex);
    console.log('Project:', projectId);
    console.log('Prompt:', prompt);
    console.log('Image URL:', imageUrl);
    console.log('Seed Frame:', seedFrame || 'none');
    console.log('Reference Images:', referenceImageUrls?.length || 0);
    console.log('Duration:', duration || 'default');
    console.log('========================================');

    // Create video prediction
    const predictionId = await createVideoPredictionWithRetry(
      imageUrl,
      prompt,
      seedFrame,
      duration,
      referenceImageUrls || [],
      modelParameters
    );

    return NextResponse.json({
      success: true,
      data: { predictionId },
    });
  } catch (error: any) {
    console.error('[API] Video generation error:', error);
    return createErrorResponse(error, 'Video generation failed');
  }
}
