/**
 * Music Generation API Route
 *
 * POST /api/generate-music
 * Generates music from a prompt using MusicGen (via Replicate)
 *
 * POST /api/generate-music?analyze=true
 * Analyzes a video and generates music based on the analysis
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  generateMusicWithMusicGen,
  generateMusicWithSuno,
  MusicGenerationRequest,
  MusicProvider,
  SunoModel,
} from '@/lib/ai/music-generator';
import {
  analyzeVideoForMusic,
  convertAnalysisToMusicGenPrompt,
  createSimpleMusicPrompt,
} from '@/lib/ai/video-music-analyzer';

export const maxDuration = 120; // Allow up to 2 minutes for video analysis + music generation

interface GenerateMusicBody {
  // Direct prompt mode
  prompt?: string;
  duration?: number;

  // Video analysis mode
  videoUrl?: string;
  videoBase64?: string;

  // Simple prompt mode
  mood?: string;
  genre?: string;

  // Provider selection
  provider?: MusicProvider;

  // MusicGen options
  temperature?: number;
  modelVersion?: 'stereo-melody-large' | 'stereo-large' | 'melody-large' | 'large';
  outputFormat?: 'wav' | 'mp3';

  // Suno options
  sunoModel?: SunoModel;
  style?: string;
  title?: string;
  instrumental?: boolean;
}

/**
 * POST /api/generate-music
 *
 * Modes:
 * 1. Direct prompt: { prompt, duration }
 * 2. Video analysis: { videoUrl } or { videoBase64 }
 * 3. Simple prompt: { mood, genre, duration }
 */
export async function POST(request: NextRequest) {
  try {
    const body: GenerateMusicBody = await request.json();
    const analyzeVideo = request.nextUrl.searchParams.get('analyze') === 'true';
    const provider: MusicProvider = body.provider || 'musicgen';

    console.log('[GenerateMusic API] Request received:', {
      hasPrompt: !!body.prompt,
      hasVideoUrl: !!body.videoUrl,
      hasVideoBase64: !!body.videoBase64,
      hasMood: !!body.mood,
      analyzeVideo,
      provider,
    });

    let musicPrompt: string;
    let duration: number = body.duration || 30;

    // Mode 1: Video analysis
    if (analyzeVideo && (body.videoUrl || body.videoBase64)) {
      console.log('[GenerateMusic API] Analyzing video for music cues...');

      const analysis = await analyzeVideoForMusic(body.videoUrl, body.videoBase64);
      const musicGenPrompt = convertAnalysisToMusicGenPrompt(analysis);

      musicPrompt = musicGenPrompt.prompt;
      duration = musicGenPrompt.duration;

      console.log('[GenerateMusic API] Video analysis complete:', {
        overallMood: analysis.overallMood,
        scenes: analysis.scenes.length,
        duration,
        provider,
      });

      // Use the appropriate provider for generation
      if (provider === 'suno') {
        const { taskId, status } = await generateMusicWithSuno({
          prompt: musicPrompt,
          duration,
          sunoModel: body.sunoModel,
          style: body.style,
          title: body.title,
          instrumental: body.instrumental,
        });

        return NextResponse.json({
          success: true,
          data: {
            taskId,
            status,
            provider: 'suno',
            analysis,
            prompt: musicPrompt,
            duration,
          },
        });
      }

      // Default to MusicGen
      const { predictionId, status } = await generateMusicWithMusicGen({
        prompt: musicPrompt,
        duration,
        temperature: body.temperature,
        modelVersion: body.modelVersion,
        outputFormat: body.outputFormat,
      });

      return NextResponse.json({
        success: true,
        data: {
          predictionId,
          status,
          provider: 'musicgen',
          analysis,
          prompt: musicPrompt,
          duration,
        },
      });
    }

    // Mode 2: Direct prompt
    if (body.prompt) {
      musicPrompt = body.prompt;
    }
    // Mode 3: Simple prompt (mood + genre)
    else if (body.mood && body.genre) {
      const simplePrompt = createSimpleMusicPrompt(body.mood, body.genre, duration);
      musicPrompt = simplePrompt.prompt;
      duration = simplePrompt.duration;
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields. Provide either: prompt, (videoUrl + analyze=true), or (mood + genre)',
        },
        { status: 400 }
      );
    }

    // Start music generation with the appropriate provider
    if (provider === 'suno') {
      const { taskId, status } = await generateMusicWithSuno({
        prompt: musicPrompt,
        duration,
        sunoModel: body.sunoModel,
        style: body.style,
        title: body.title,
        instrumental: body.instrumental,
      });

      return NextResponse.json({
        success: true,
        data: {
          taskId,
          status,
          provider: 'suno',
          prompt: musicPrompt,
          duration,
        },
      });
    }

    // Default to MusicGen
    const { predictionId, status } = await generateMusicWithMusicGen({
      prompt: musicPrompt,
      duration,
      temperature: body.temperature,
      modelVersion: body.modelVersion,
      outputFormat: body.outputFormat,
    });

    return NextResponse.json({
      success: true,
      data: {
        predictionId,
        status,
        provider: 'musicgen',
        prompt: musicPrompt,
        duration,
      },
    });
  } catch (error) {
    console.error('[GenerateMusic API] Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/generate-music
 *
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'music-generation',
    providers: {
      musicgen: {
        available: !!process.env.REPLICATE_API_TOKEN,
        via: 'replicate',
      },
      geminiAnalysis: {
        available: !!process.env.OPENROUTER_API_KEY,
        via: 'openrouter',
        model: 'google/gemini-2.5-pro',
      },
      suno: {
        available: !!process.env.SUNO_API,
        via: 'sunoapi.org',
        models: ['V3_5', 'V4', 'V4_5', 'V4_5PLUS', 'V5'],
      },
    },
  });
}
