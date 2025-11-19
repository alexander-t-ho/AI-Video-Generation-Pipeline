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
  setRuntimeImageModel,
} from '@/lib/ai/image-generator';
import { ImageGenerationRequest, ImageGenerationResponse } from '@/lib/types';
import { uploadToS3, getS3Url } from '@/lib/storage/s3-uploader';
import { DEFAULT_RUNTIME_CONFIG, PromptAdjustmentMode } from '@/lib/config/model-runtime';
import { adjustPromptForReferenceImage } from '@/lib/utils/prompt-optimizer';
import path from 'path';

// ============================================================================
// Module-level Constants
// ============================================================================

const NGROK_URL = process.env.NGROK_URL || 'http://localhost:3000';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Gets MIME type from file extension
 * OPTIMIZATION: Centralized function instead of inline conditionals
 */
function getContentType(url: string): string {
  const ext = path.extname(url).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  return mimeTypes[ext] || 'image/png';
}

/**
 * Converts local paths to public URLs (S3 or ngrok)
 * OPTIMIZATION: Extracted from handler to avoid recreation on every request
 */
async function convertToPublicUrl(url: string, projectId: string): Promise<string> {
  // S3 URLs may not be publicly accessible (403 errors)
  // Download and convert to base64 data URL for Replicate
  if (url.includes('s3.amazonaws.com') || url.includes('s3.')) {
    try {
      console.log(`[Image Generation API] Downloading S3 image for base64 conversion: ${url.substring(0, 80)}...`);
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[Image Generation API] Failed to download S3 image (${response.status}), will try ngrok fallback`);
        // Fallback to ngrok URL if available
        return `${NGROK_URL}/api/serve-image?path=${encodeURIComponent(url)}`;
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Image = buffer.toString('base64');
      const mimeType = url.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const dataUrl = `data:${mimeType};base64,${base64Image}`;
      console.log(`[Image Generation API] Successfully converted S3 image to base64 (${(base64Image.length / 1024).toFixed(2)} KB)`);
      return dataUrl;
    } catch (error: any) {
      console.error(`[Image Generation API] Failed to convert S3 URL to base64:`, error.message);
      // Last resort: try ngrok URL
      return `${NGROK_URL}/api/serve-image?path=${encodeURIComponent(url)}`;
    }
  }
  
  // If it's already a public URL (external, non-S3), use it as-is
  if (url.startsWith('https://') || (url.startsWith('http://') && !url.includes('localhost'))) {
    return url;
  }
  
  // If it's a local path, try to upload to S3 first, then convert to base64
  if (url.startsWith('/tmp') || url.startsWith('./') || (!url.startsWith('/api') && !url.startsWith('http'))) {
    try {
      // Read file and convert to base64 directly
      const fs = await import('fs/promises');
      const fileBuffer = await fs.readFile(url);
      const base64Image = fileBuffer.toString('base64');
      const mimeType = url.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const dataUrl = `data:${mimeType};base64,${base64Image}`;
      console.log(`[Image Generation API] Converted local path to base64: ${url.substring(0, 50)}... (${(base64Image.length / 1024).toFixed(2)} KB)`);
      return dataUrl;
    } catch (localError: any) {
      console.warn(`[Image Generation API] Failed to read local file, trying S3 upload: ${localError.message}`);
      
      // Fallback: try S3 upload
      try {
        const s3Key = await uploadToS3(url, projectId, {
          contentType: getContentType(url),
        });
        const s3Url = getS3Url(s3Key);
        console.log(`[Image Generation API] Uploaded to S3: ${url.substring(0, 50)}... -> ${s3Url.substring(0, 80)}...`);
        
        // Now convert the S3 URL to base64 (recursive call)
        return convertToPublicUrl(s3Url, projectId);
      } catch (s3Error: any) {
        const publicUrl = `${NGROK_URL}/api/serve-image?path=${encodeURIComponent(url)}`;
        console.warn(`[Image Generation API] S3 upload failed, using fallback URL: ${s3Error.message}`);
        return publicUrl;
      }
    }
  }
  
  // If it's already a relative API path, make it absolute
  if (url.startsWith('/api/')) {
    const publicUrl = `${NGROK_URL}${url}`;
    if (publicUrl.includes('localhost')) {
      console.warn(`[Image Generation API] WARNING: Using localhost URL - Replicate may not be able to access it: ${publicUrl}`);
    }
    return publicUrl;
  }
  
  return url;
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
    // Check for runtime model override in headers
    const runtimeT2IModel = request.headers.get('X-Model-T2I');
    const runtimeI2IModel = request.headers.get('X-Model-I2I');

    // Use T2I or I2I model based on whether we have reference images
    // We'll check this after parsing the body

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

    // Extract scene index for scene-based model selection
    const sceneIndex = body.sceneIndex;

    // Scene-based model selection
    // Scene 0: Use Gen-4 Image for maximum consistency with reference image (matches video generation strategy)
    // Scenes 1-4: Use runtime override or default I2I model
    const hasReferenceImages = body.referenceImageUrls && body.referenceImageUrls.length > 0;
    let selectedModel = hasReferenceImages ? runtimeI2IModel : runtimeT2IModel;
    
    if (!selectedModel) {
      if (sceneIndex === 0 && hasReferenceImages) {
        // Scene 0 with reference images: Use Gen-4 Image for maximum object consistency
        selectedModel = 'runwayml/gen4-image';
        console.log('[Image Generation API] Scene 0: Using Gen-4 Image for maximum consistency with reference image');
      } else if (hasReferenceImages) {
        // Scenes 1-4 with reference images: Use default I2I model (FLUX Dev)
        selectedModel = null; // Will use default from config
        console.log(`[Image Generation API] Scene ${sceneIndex}: Using default I2I model (FLUX Dev with IP-Adapter)`);
      } else {
        // No reference images: Use T2I model
        selectedModel = runtimeT2IModel;
        console.log(`[Image Generation API] Scene ${sceneIndex}: Using T2I model (no reference images)`);
      }
    }

    if (selectedModel) {
      setRuntimeImageModel(selectedModel);
      console.log(`[Image Generation API] Using runtime model: ${selectedModel} (${hasReferenceImages ? 'I2I' : 'T2I'})`);
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

    // Extract and prepare parameters
    // sceneIndex already extracted above
    const projectId = body.projectId.trim();
    let prompt = body.prompt.trim();
    let referenceImageUrls = body.referenceImageUrls || [];
    const seedFrame = body.seedFrame?.trim();
    let seedImage = body.seedImage?.trim();

    // OPTIMIZATION: Convert ALL URLs in parallel (not sequential)
    const urlsToConvert: string[] = [
      ...referenceImageUrls,
      ...(seedImage ? [seedImage] : []),
      ...(seedFrame ? [seedFrame] : []),
    ];

    const convertedUrls = await Promise.all(
      urlsToConvert.map(url => convertToPublicUrl(url, projectId))
    );

    // Split converted URLs back to their respective variables
    const refImageCount = referenceImageUrls.length;
    referenceImageUrls = convertedUrls.slice(0, refImageCount);
    
    let currentIndex = refImageCount;
    if (seedImage) {
      seedImage = convertedUrls[currentIndex++];
    }
    
    let seedFrameUrl: string | undefined;
    if (seedFrame) {
      seedFrameUrl = convertedUrls[currentIndex++];
    }

    // Log URL verification
    const allUrlsPublic = referenceImageUrls.every(url => 
      url.startsWith('http://') || url.startsWith('https://')
    );
    console.log('[Image Generation API] Reference image URLs:', referenceImageUrls.map(url => url.substring(0, 80) + '...'));
    console.log('[Image Generation API] Are all URLs public?', allUrlsPublic);
    if (!allUrlsPublic) {
      console.warn('[Image Generation API] WARNING: Some reference image URLs are not publicly accessible!');
    }

    // Prompt adjustment strategy based on runtime config
    // Get prompt adjustment mode from request body (sent from client) or use default
    const promptAdjustmentMode: PromptAdjustmentMode = body.promptAdjustmentMode || DEFAULT_RUNTIME_CONFIG.promptAdjustmentMode || 'scene-specific';
    
    // Apply prompt adjustment based on mode
    if (referenceImageUrls.length > 0) {
      if (promptAdjustmentMode === 'disabled') {
        // No adjustment - use full prompt
        console.log(`[Image Generation API] Scene ${sceneIndex}: Prompt adjustment disabled - using full prompt`);
      } else if (promptAdjustmentMode === 'scene-specific') {
        // Scene-specific: Scene 1 uses full prompt (for dynamic shots), others use adjusted prompt
        if (sceneIndex === 1) {
          console.log(`[Image Generation API] Scene ${sceneIndex}: Scene-specific mode - Scene 1 uses full prompt for dynamic shots`);
          // Keep full prompt for Scene 1
        } else {
          prompt = adjustPromptForReferenceImage(prompt);
          console.log(`[Image Generation API] Scene ${sceneIndex}: Scene-specific mode - using prompt adjustment`);
          console.log(`[Image Generation API] Original prompt: ${body.prompt.substring(0, 100)}...`);
          console.log(`[Image Generation API] Adjusted prompt: ${prompt.substring(0, 100)}...`);
        }
      } else if (promptAdjustmentMode === 'less-aggressive') {
        // Less aggressive: Only replace object type mentions, keep all scene details
        prompt = adjustPromptForReferenceImage(prompt);
        console.log(`[Image Generation API] Scene ${sceneIndex}: Using less-aggressive prompt adjustment`);
        console.log(`[Image Generation API] Original prompt: ${body.prompt.substring(0, 100)}...`);
        console.log(`[Image Generation API] Adjusted prompt: ${prompt.substring(0, 100)}...`);
      }
    }

    // Strategy: Use seed image for image-to-image generation
    // For Scene 0: Seed image will be the reference image (if available)
    // For Scenes 1-4: Seed image will be the seed frame from the previous scene
    // Also use IP-Adapter with reference images for object consistency
    const strategy = seedImage
      ? `Image-to-image with seed image + IP-Adapter (reference images for object consistency)`
      : referenceImageUrls.length > 0
      ? `Text-to-image with IP-Adapter (reference images for object consistency)`
      : `Text-to-image only`;

    const timestamp = new Date().toISOString();
    console.log('[Image Generation API] ========================================');
    console.log('[Image Generation API] Request received');
    console.log('[Image Generation API] Timestamp:', timestamp);
    console.log('[Image Generation API] Model Type:', hasReferenceImages ? 'I2I' : 'T2I');
    console.log('[Image Generation API] Selected Model:', selectedModel || 'default');
    console.log('[Image Generation API] Project ID:', projectId);
    console.log('[Image Generation API] Scene Index:', sceneIndex);
    console.log('[Image Generation API] Prompt:', prompt);
    console.log('[Image Generation API] Strategy:', strategy);
    console.log('[Image Generation API] Inputs:');
    console.log('[Image Generation API]   - Seed Image:', seedImage || 'none');
    console.log('[Image Generation API]   - Seed Frame:', seedFrameUrl || 'none');
    console.log('[Image Generation API]   - Reference Images:', referenceImageUrls.length);
    if (referenceImageUrls.length > 0) {
      referenceImageUrls.forEach((url, idx) => {
        // Only log first 30 chars of URL to avoid flooding console with base64 data
        const urlPreview = url.startsWith('data:') ? `${url.substring(0, 30)}... [base64 data]` : url;
        console.log(`[Image Generation API]     [${idx + 1}] ${urlPreview}`);
      });
    }
    console.log('[Image Generation API]   - All URLs Public:', allUrlsPublic);
    console.log('[Image Generation API] ========================================');

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
    if (sceneIndex > 0 && seedFrameUrl) {
      ipAdapterImages.push(seedFrameUrl);
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

