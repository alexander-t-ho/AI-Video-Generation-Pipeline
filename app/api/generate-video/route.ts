import { NextRequest, NextResponse } from 'next/server';
import { createVideoPredictionWithRetry, setRuntimeVideoModel } from '@/lib/video/generator';

/**
 * POST /api/generate-video
 * Creates a video generation prediction and returns prediction ID for polling
 *
 * Request Body:
 * {
 *   imageUrl: string;              // Required: S3 URL or public HTTP/HTTPS URL (used as starting frame if no seedFrame)
 *   prompt: string;                // Required: Motion/action description
 *   seedFrame?: string;            // Optional: Seed frame URL for Scene 1-4 (used as starting frame, overrides imageUrl)
 *   sceneIndex: number;            // Required: Scene index (0-4)
 *   projectId: string;             // Required: Project ID
 *   duration?: number;             // Optional: Video duration in seconds (1-30)
 *   referenceImageUrls?: string[]; // Optional: Reference images for consistency/IP-Adapter
 *   modelParameters?: {            // Optional: Model-specific parameters
 *     last_frame?: string;         // Optional: Ending frame URL (for interpolation mode - mutually exclusive with using seedFrame/imageUrl as starting frame)
 *     [key: string]: any;
 *   };
 * }
 *
 * Note: For Google Veo models:
 * - Standard mode: Provide imageUrl or seedFrame as starting frame. The model generates video from this starting point.
 * - Interpolation mode: Provide last_frame in modelParameters. The model generates transition from imageUrl/seedFrame to last_frame.
 * - You can use EITHER standard mode OR interpolation mode, not both simultaneously.
 *
 * Response:
 * {
 *   success: boolean;
 *   data?: {
 *     predictionId: string;
 *   };
 *   error?: string;
 * }
 */
export async function POST(request: NextRequest) {
  const timestamp = new Date().toISOString();

  try {
    // Check for runtime model override in headers
    const runtimeVideoModel = request.headers.get('X-Model-Video');
    if (runtimeVideoModel) {
      setRuntimeVideoModel(runtimeVideoModel);
      console.log(`[Video Generation API] Using runtime model: ${runtimeVideoModel}`);
    }

    // Check for required environment variables
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
    const { imageUrl, prompt, seedFrame, sceneIndex, projectId, duration, referenceImageUrls, modelParameters } = body;

    // Validate required fields
    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json(
        { success: false, error: 'imageUrl is required and must be a string' },
        { status: 400 }
      );
    }

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { success: false, error: 'prompt is required and must be a string' },
        { status: 400 }
      );
    }

    if (typeof sceneIndex !== 'number' || sceneIndex < 0 || sceneIndex > 4) {
      return NextResponse.json(
        { success: false, error: 'sceneIndex is required and must be a number between 0 and 4' },
        { status: 400 }
      );
    }

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'projectId is required and must be a string' },
        { status: 400 }
      );
    }

    // Validate that imageUrl is an HTTP/HTTPS URL (S3 or other public URL)
    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'imageUrl must be a publicly accessible HTTP/HTTPS URL (e.g., S3 URL)' 
        },
        { status: 400 }
      );
    }

    // Validate seed frame URL if provided
    let seedFrameUrl: string | undefined;
    if (seedFrame) {
      if (typeof seedFrame !== 'string') {
        return NextResponse.json(
          { success: false, error: 'seedFrame must be a string if provided' },
          { status: 400 }
        );
      }
      if (!seedFrame.startsWith('http://') && !seedFrame.startsWith('https://')) {
        return NextResponse.json(
          {
            success: false,
            error: 'seedFrame must be a publicly accessible HTTP/HTTPS URL (e.g., S3 URL)'
          },
          { status: 400 }
        );
      }
      seedFrameUrl = seedFrame;
    }

    // Scene-based model selection
    // Note: Gen-4 Aleph requires video input, so it cannot be used for Scene 0 (image-to-video)
    let selectedModel = runtimeVideoModel;

    // Only override if Gen-4 Aleph is selected for Scene 0 (it requires video input, not image)
    if (selectedModel && sceneIndex === 0 && selectedModel.includes('gen4-aleph')) {
      console.log('[Video Generation API] Scene 0: Overriding Gen-4 Aleph to Gen-4 Turbo (Aleph requires video input, not image)');
      selectedModel = 'runwayml/gen4-turbo';
    } else if (selectedModel) {
      console.log(`[Video Generation API] Scene ${sceneIndex}: Using selected model: ${selectedModel}`);
    } else {
      // No override - use default from config (now Google Veo 3.1)
      console.log(`[Video Generation API] Scene ${sceneIndex}: Using default model from config`);
    }

    // Apply the selected model
    if (selectedModel) {
      setRuntimeVideoModel(selectedModel);
    }

    // Validate reference images if provided
    let refImageUrls: string[] = [];
    if (referenceImageUrls) {
      if (!Array.isArray(referenceImageUrls)) {
        return NextResponse.json(
          { success: false, error: 'referenceImageUrls must be an array of strings if provided' },
          { status: 400 }
        );
      }
      // Validate each URL is a string
      if (!referenceImageUrls.every(url => typeof url === 'string')) {
        return NextResponse.json(
          { success: false, error: 'All referenceImageUrls must be strings' },
          { status: 400 }
        );
      }
      refImageUrls = referenceImageUrls;
    }

    // Log request details
    console.log('[Video Generation API] ========================================');
    console.log('[Video Generation API] Request received');
    console.log('[Video Generation API] Timestamp:', timestamp);
    console.log('[Video Generation API] Selected Model:', selectedModel || runtimeVideoModel || 'default (Google Veo 3.1)');
    console.log('[Video Generation API] Model Selection Strategy:', 'Using Veo 3.1 for all scenes (reference_images + last_frame parameters)');
    console.log('[Video Generation API] Project ID:', projectId);
    console.log('[Video Generation API] Scene Index:', sceneIndex);
    console.log('[Video Generation API] Prompt:', prompt);
    console.log('[Video Generation API] Inputs:');
    console.log('[Video Generation API]   - Image URL:', imageUrl);
    console.log('[Video Generation API]   - Seed Frame:', seedFrameUrl || 'none');
    console.log('[Video Generation API]   - Reference Images:', refImageUrls.length > 0 ? refImageUrls.length : 'none');
    if (refImageUrls.length > 0) {
      refImageUrls.forEach((url, idx) => {
        const urlPreview = url.length > 80 ? url.substring(0, 80) + '...' : url;
        console.log(`[Video Generation API]     [${idx + 1}] ${urlPreview}`);
      });
    }
    console.log('[Video Generation API] ========================================');

    // Validate and use duration if provided (will be rounded up to model-acceptable values)
    let videoDuration: number | undefined;
    if (duration !== undefined) {
      if (typeof duration !== 'number' || duration < 1 || duration > 30) {
        return NextResponse.json(
          { success: false, error: 'duration must be a number between 1 and 30 seconds' },
          { status: 400 }
        );
      }
      videoDuration = duration;
      console.log('[Video Generation API] Using scene-specific duration:', videoDuration, 'seconds');
    }

    // Create video prediction (returns prediction ID for polling)
    // Pass modelParameters if provided
    const predictionId = await createVideoPredictionWithRetry(
      imageUrl,
      prompt,
      seedFrameUrl,
      videoDuration,
      refImageUrls,
      modelParameters // Pass model-specific parameters
    );

    return NextResponse.json({
      success: true,
      data: {
        predictionId,
      },
    });
  } catch (error: any) {
    console.error('[API] Video generation error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Video generation failed',
      },
      { status: 500 }
    );
  }
}

