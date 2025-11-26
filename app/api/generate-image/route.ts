/**
 * Image Generation API Route
 * POST /api/generate-image
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createImagePredictionWithRetry,
  getUserFriendlyErrorMessage,
  getErrorCode,
  isRetryableError,
  setRuntimeImageModel,
} from '@/lib/ai/image-generator';
import { ImageGenerationRequest, ImageGenerationResponse } from '@/lib/types';
import { validateRequest, createErrorResponse, parseRequestBody, checkEnvVars, commonRules } from '@/lib/api/middleware';
import { convertUrlsToPublic, formatUrlForLogging } from '@/lib/api/url-converter';

// ============================================================================
// Validation Rules
// ============================================================================

const IMAGE_GEN_RULES = [
  commonRules.prompt,
  commonRules.projectId,
  commonRules.sceneIndex,
  {
    field: 'seedImage',
    type: 'string' as const,
    required: false,
  },
];

// ============================================================================
// API Route Handler
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Check environment
    const envError = checkEnvVars(['REPLICATE_API_TOKEN']);
    if (envError) {
      return NextResponse.json(
        { success: false, error: envError, code: 'PREDICTION_FAILED' } as ImageGenerationResponse,
        { status: 500 }
      );
    }

    // Parse request body
    const { body, error: parseError } = await parseRequestBody<ImageGenerationRequest>(request);
    if (parseError) return parseError;

    // Log request
    console.log('========================================');
    console.log('[API] Image Generation Request');
    console.log('========================================');
    console.log('Scene:', body.sceneIndex);
    console.log('Project:', body.projectId);
    console.log('Prompt:', body.prompt?.substring(0, 100) + (body.prompt?.length > 100 ? '...' : ''));
    console.log('Seed Image:', body.seedImage ? formatUrlForLogging(body.seedImage) : 'none');
    console.log('Reference Images:', body.referenceImageUrls?.length || 0);
    console.log('========================================');

    // Validate request
    const validationError = validateRequest(body, IMAGE_GEN_RULES);
    if (validationError) {
      return NextResponse.json(
        { success: false, error: validationError, code: 'INVALID_REQUEST' } as ImageGenerationResponse,
        { status: 400 }
      );
    }

    // Handle runtime model override
    const runtimeT2IModel = request.headers.get('X-Model-T2I');
    const runtimeI2IModel = request.headers.get('X-Model-I2I');
    const hasReferenceImages = body.referenceImageUrls && body.referenceImageUrls.length > 0;
    const selectedModel = hasReferenceImages ? runtimeI2IModel : runtimeT2IModel;

    if (selectedModel) {
      setRuntimeImageModel(selectedModel);
      console.log(`[API] Using runtime model: ${selectedModel} (${hasReferenceImages ? 'I2I' : 'T2I'})`);
    } else if (hasReferenceImages) {
      console.log(`[API] Scene ${body.sceneIndex}: Using Nano Banana Pro (default) with ${body.referenceImageUrls?.length} reference image(s)`);
    }

    // Convert URLs to public format in parallel
    const urlsToConvert = [
      ...(body.referenceImageUrls || []),
      ...(body.seedImage ? [body.seedImage] : []),
      ...(body.seedFrame ? [body.seedFrame] : []),
    ];

    const convertedUrls = await convertUrlsToPublic(urlsToConvert, body.projectId);

    // Split converted URLs back
    const refImageCount = body.referenceImageUrls?.length || 0;
    const referenceImageUrls = convertedUrls.slice(0, refImageCount);
    let currentIndex = refImageCount;
    const seedImage = body.seedImage ? convertedUrls[currentIndex++] : undefined;
    const seedFrameUrl = body.seedFrame ? convertedUrls[currentIndex++] : undefined;

    // Log URL conversion
    console.log('========================================');
    console.log('[API] URL Conversion');
    console.log('========================================');
    console.log('Seed Image:', seedImage ? formatUrlForLogging(seedImage) : 'none');
    console.log('Reference Images:', referenceImageUrls.length);
    referenceImageUrls.forEach((url, idx) => {
      console.log(`  [${idx}]: ${formatUrlForLogging(url)}`);
    });
    console.log('Seed Frame:', seedFrameUrl ? formatUrlForLogging(seedFrameUrl) : 'none');
    console.log('========================================');

    // Build IP-Adapter images array
    const ipAdapterScale = 1.0;
    const ipAdapterImages: string[] = [];
    const isLastFrameMode = body.sceneIndex > 0 && seedFrameUrl && referenceImageUrls.length === 0;

    if (isLastFrameMode && seedFrameUrl) {
      ipAdapterImages.push(seedFrameUrl);
      console.log(`[API] Scene ${body.sceneIndex}: Last frame mode - using seed frame as reference`);
    } else {
      if (referenceImageUrls.length > 0) {
        ipAdapterImages.push(...referenceImageUrls);
      }
      if (body.sceneIndex > 0 && seedFrameUrl) {
        ipAdapterImages.push(seedFrameUrl);
        console.log(`[API] Scene ${body.sceneIndex}: Using seed frame for visual continuity`);
      }
    }

    const useIpAdapter = ipAdapterImages.length > 0;

    // Create prediction
    const predictionId = await createImagePredictionWithRetry(
      body.prompt,
      seedImage,
      useIpAdapter ? ipAdapterImages : undefined,
      useIpAdapter ? ipAdapterScale : undefined
    );

    const duration = Date.now() - startTime;
    console.log(`[API] Prediction created in ${duration}ms: ${predictionId}`);

    return NextResponse.json(
      {
        success: true,
        predictionId,
        status: 'starting',
      } as ImageGenerationResponse,
      { status: 200 }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[API] Error after ${duration}ms:`, error);

    const userFriendlyMessage = getUserFriendlyErrorMessage(error);
    const code = getErrorCode(error);
    const retryable = isRetryableError(error);

    let statusCode = 500;
    if (code === 'INVALID_REQUEST') statusCode = 400;
    else if (code === 'RATE_LIMIT') statusCode = 503;
    else if (code === 'AUTHENTICATION_FAILED') statusCode = 500;
    else if (retryable) statusCode = 503;

    return NextResponse.json(
      {
        success: false,
        error: userFriendlyMessage,
        code,
        retryable,
      } as ImageGenerationResponse,
      { status: statusCode }
    );
  }
}

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
