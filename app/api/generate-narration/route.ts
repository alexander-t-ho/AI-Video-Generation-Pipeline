/**
 * Narration Generation API Route
 *
 * POST /api/generate-narration
 * Generates narration audio using OpenAI TTS HD API directly
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  generateNarrationBuffer,
  NarrationVoice,
  estimateNarrationDuration,
  VOICE_DESCRIPTIONS,
} from '@/lib/ai/narration-generator';

export const maxDuration = 60; // Allow up to 60 seconds for TTS generation

// OpenAI API endpoint for TTS (OpenRouter doesn't support audio endpoints)
const OPENAI_TTS_API_URL = 'https://api.openai.com/v1/audio/speech';

interface GenerateNarrationBody {
  text: string;
  voice?: NarrationVoice;
  speed?: number;
  projectId: string;
}

/**
 * POST /api/generate-narration
 *
 * Generate narration audio from text using OpenAI TTS HD
 */
export async function POST(request: NextRequest) {
  try {
    const body: GenerateNarrationBody = await request.json();

    if (!body.text || body.text.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Text is required for narration' },
        { status: 400 }
      );
    }

    if (!body.projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const voice = body.voice || 'alloy';
    const speed = Math.min(Math.max(body.speed || 1.0, 0.25), 4.0);

    console.log('[GenerateNarration API] Request received:', {
      textLength: body.text.length,
      textPreview: body.text.substring(0, 50) + '...',
      voice,
      speed,
      projectId: body.projectId,
    });

    // Call OpenAI TTS API directly
    const response = await fetch(OPENAI_TTS_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1-hd',
        input: body.text,
        voice: voice,
        speed: speed,
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[GenerateNarration API] OpenAI error:', response.status, errorText);

      try {
        const errorJson = JSON.parse(errorText);
        return NextResponse.json(
          { success: false, error: `TTS generation failed: ${errorJson.error?.message || errorJson.detail || errorText}` },
          { status: 500 }
        );
      } catch {
        return NextResponse.json(
          { success: false, error: `TTS generation failed: ${response.status}` },
          { status: 500 }
        );
      }
    }

    // Get audio buffer from response
    const audioBuffer = await response.arrayBuffer();

    // Save audio file locally
    const projectDir = path.join(process.cwd(), 'generated', body.projectId, 'narration');
    await fs.mkdir(projectDir, { recursive: true });

    const filename = `narration_${uuidv4()}.mp3`;
    const localPath = path.join(projectDir, filename);

    await fs.writeFile(localPath, Buffer.from(audioBuffer));

    // Get audio duration using ffprobe (estimated based on file size or text length)
    const estimatedDuration = estimateNarrationDuration(body.text, speed);

    // Create a URL to serve the audio
    const audioUrl = `/api/serve-audio?path=${encodeURIComponent(localPath)}`;

    console.log('[GenerateNarration API] Narration generated:', {
      localPath,
      audioUrl,
      estimatedDuration,
      voice,
      fileSize: audioBuffer.byteLength,
    });

    return NextResponse.json({
      success: true,
      data: {
        audioUrl,
        localPath,
        duration: estimatedDuration,
        voice,
        text: body.text,
      },
    });
  } catch (error) {
    console.error('[GenerateNarration API] Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET /api/generate-narration
 *
 * Returns available voices and service status
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'narration-generation',
    model: 'tts-1-hd',
    via: 'openai',
    available: !!process.env.OPENAI_API_KEY,
    voices: VOICE_DESCRIPTIONS,
    supportedSpeeds: {
      min: 0.25,
      max: 4.0,
      default: 1.0,
    },
  });
}
