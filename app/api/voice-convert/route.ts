/**
 * Voice Conversion API Route
 * 
 * POST /api/voice-convert
 * Converts audio voice using RVC models
 */

import { NextRequest, NextResponse } from 'next/server';
import { convertVoice, convertVoiceFromSource, VoiceConversionRequest, VoiceConversionSource } from '@/lib/ai/voice-converter';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getStorageService } from '@/lib/storage/storage-service';

export const maxDuration = 300; // 5 minutes for voice conversion

interface VoiceConvertBody {
  // Source type and input
  sourceType?: 'narration' | 'video' | 'audio_track' | 'direct';
  
  // For direct conversion
  audioUrl?: string;
  audioPath?: string;
  
  // For narration
  narrationTrackId?: string;
  narrationAudioUrl?: string;
  
  // For video
  videoUrl?: string;
  videoPath?: string;
  timelineClipId?: string;
  
  // For audio track
  audioTrackId?: string;
  
  // Voice model
  modelUrl?: string;
  modelPath?: string;
  customModelId?: string;
  
  // Parameters
  pitchChange?: number;
  indexRate?: number;
  reverbSize?: number;
  protect?: number;
  
  projectId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: VoiceConvertBody = await request.json();

    if (!body.projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID is required' },
        { status: 400 }
      );
    }

    // Determine source type
    const sourceType = body.sourceType || 'direct';

    if (sourceType === 'direct') {
      // Direct conversion with audio URL/path
      if (!body.audioUrl && !body.audioPath) {
        return NextResponse.json(
          { success: false, error: 'audioUrl or audioPath required for direct conversion' },
          { status: 400 }
        );
      }

      const conversionRequest: VoiceConversionRequest = {
        audioUrl: body.audioUrl,
        audioPath: body.audioPath,
        modelUrl: body.modelUrl,
        modelPath: body.modelPath,
        customModelId: body.customModelId,
        pitchChange: body.pitchChange,
        indexRate: body.indexRate,
        reverbSize: body.reverbSize,
        protect: body.protect,
        projectId: body.projectId,
      };

      const { predictionId, status } = await convertVoice(conversionRequest);

      return NextResponse.json({
        success: true,
        data: {
          predictionId,
          status,
        },
      });
    } else {
      // Use source-based conversion
      const source: VoiceConversionSource = {
        type: sourceType,
        narrationTrackId: body.narrationTrackId,
        narrationAudioUrl: body.narrationAudioUrl,
        videoUrl: body.videoUrl,
        videoPath: body.videoPath,
        timelineClipId: body.timelineClipId,
        audioTrackId: body.audioTrackId,
        audioUrl: body.audioUrl,
        modelUrl: body.modelUrl,
        customModelId: body.customModelId,
        pitchChange: body.pitchChange,
        indexRate: body.indexRate,
        reverbSize: body.reverbSize,
        protect: body.protect,
        projectId: body.projectId,
      };

      const { predictionId, status } = await convertVoiceFromSource(source);

      return NextResponse.json({
        success: true,
        data: {
          predictionId,
          status,
        },
      });
    }
  } catch (error) {
    console.error('[VoiceConvert API] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/voice-convert
 * Returns service status and available models
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'voice-conversion',
    provider: 'replicate',
    model: 'zsxkib/realistic-voice-cloning',
    available: !!process.env.REPLICATE_API_TOKEN,
    features: {
      narrationConversion: true,
      videoAudioConversion: true,
      audioTrackConversion: true,
      customModels: true,
    },
  });
}

