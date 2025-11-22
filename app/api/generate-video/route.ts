import { NextRequest, NextResponse } from 'next/server';
import { createVideoPredictionWithRetry, setRuntimeVideoModel } from '@/lib/video/generator';

/**
 * POST /api/generate-video
 * Creates a video generation prediction and returns prediction ID for polling
 *
 * Request Body:
 * {
 *   imageUrl: string;              // Required: S3 URL or public HTTP/HTTPS URL
 *   prompt: string;                // Required: Motion/action description
 *   seedFrame?: string;            // Optional: Seed frame URL for Scene 1-4
 *   sceneIndex: number;            // Required: Scene index (0-4)
 *   projectId: string;             // Required: Project ID
 *   duration?: number;             // Optional: Video duration in seconds (1-30)
 *   referenceImageUrls?: string[]; // Optional: Reference images for consistency/IP-Adapter
 * }
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
    const { imageUrl, prompt, seedFrame, sceneIndex, projectId, duration, referenceImageUrls } = body;

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
    // Scene 0 → Scene 1: Use Gen-4 Turbo for maximum consistency with cleaned reference image
    // Note: Gen-4 Aleph requires video input, so it cannot be used for Scene 0 (image-to-video)
    // Scenes 1-4: Use faster model (continuity already established via seed frames)
    let selectedModel = runtimeVideoModel;
    
    // Only apply overrides if no model was explicitly selected
    if (!selectedModel) {
      // For Scene 0, use Gen-4 Turbo for maximum consistency
      if (sceneIndex === 0) {
        selectedModel = 'runwayml/gen4-turbo';
        console.log('[Video Generation API] Scene 0 → Scene 1: Using Gen-4 Turbo for maximum consistency (image-to-video)');
      } else {
        // Scenes 1-4: Use faster model (WAN 2.5) since continuity is already established
        // Seed frames from previous scenes provide the continuity
        selectedModel = 'wan-video/wan-2.5-i2v-fast:5be8b80ffe74f3d3a731693ddd98e7ee94100a0f4ae704bd58e93565977670f9';
        console.log(`[Video Generation API] Scene ${sceneIndex}: Using WAN 2.5 for faster generation (continuity via seed frames)`);
      }
    } else {
      // Model was explicitly selected - only override Gen-4 Aleph for Scene 0 (it requires video input)
      if (sceneIndex === 0 && selectedModel.includes('gen4-aleph')) {
        console.log('[Video Generation API] Scene 0: Overriding Gen-4 Aleph to Gen-4 Turbo (Aleph requires video input, not image)');
        selectedModel = 'runwayml/gen4-turbo';
      } else {
        console.log(`[Video Generation API] Scene ${sceneIndex}: Using selected model: ${selectedModel}`);
      }
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
    console.log('[Video Generation API] Selected Model:', selectedModel || runtimeVideoModel || 'default');
    console.log('[Video Generation API] Model Selection Strategy:', sceneIndex === 0 ? 'Gen-4 for Scene 0→1 (max consistency)' : 'WAN 2.5 for Scenes 1-4 (speed + continuity)');
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
    const predictionId = await createVideoPredictionWithRetry(
      imageUrl,
      prompt,
      seedFrameUrl,
      videoDuration,
      refImageUrls
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

