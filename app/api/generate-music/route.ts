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
} from '@/lib/ai/music-generator';
import {
  analyzeVideoForMusic,
  convertAnalysisToMusicGenPrompt,
  createSimpleMusicPrompt,
} from '@/lib/ai/video-music-analyzer';

export const maxDuration = 300; // Allow up to 5 minutes for video analysis + music generation (Suno can take longer)

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
  provider?: MusicProvider; // 'musicgen' | 'suno'

  // MusicGen options
  temperature?: number;
  modelVersion?: 'stereo-melody-large' | 'stereo-large' | 'melody-large' | 'large';
  outputFormat?: 'wav' | 'mp3';
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

    console.log('[GenerateMusic API] Request received:', {
      hasPrompt: !!body.prompt,
      hasVideoUrl: !!body.videoUrl,
      hasVideoBase64: !!body.videoBase64,
      hasMood: !!body.mood,
      analyzeVideo,
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
      });

      // Determine provider
      const defaultProvider = (process.env.MUSIC_PROVIDER as MusicProvider) || 'musicgen';
      const provider = body.provider || defaultProvider;

      // Start generation with selected provider
      let predictionId: string;
      let status: string;
      
      if (provider === 'suno') {
        const result = await generateMusicWithSuno({
          prompt: musicPrompt,
          duration,
          provider: 'suno',
        });
        predictionId = result.predictionId;
        status = result.status;
      } else {
        const result = await generateMusicWithMusicGen({
          prompt: musicPrompt,
          duration,
          temperature: body.temperature,
          modelVersion: body.modelVersion,
          outputFormat: body.outputFormat,
          provider: 'musicgen',
        });
        predictionId = result.predictionId;
        status = result.status;
      }

      return NextResponse.json({
        success: true,
      data: {
        predictionId,
        status,
        provider: provider,
        analysis, // Include the full analysis
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

    // Determine provider
    const defaultProvider = (process.env.MUSIC_PROVIDER as MusicProvider) || 'musicgen';
    const provider = body.provider || defaultProvider;

    // Start music generation with selected provider
    let predictionId: string;
    let status: string;
    
    if (provider === 'suno') {
      const result = await generateMusicWithSuno({
        prompt: musicPrompt,
        duration,
        provider: 'suno',
      });
      predictionId = result.predictionId;
      status = result.status;
    } else {
      const result = await generateMusicWithMusicGen({
        prompt: musicPrompt,
        duration,
        temperature: body.temperature,
        modelVersion: body.modelVersion,
        outputFormat: body.outputFormat,
        provider: 'musicgen',
      });
      predictionId = result.predictionId;
      status = result.status;
    }

    return NextResponse.json({
      success: true,
      data: {
        predictionId,
        status,
        provider: provider,
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
        configured: !!process.env.SUNO_API,
      },
    },
  });
}
