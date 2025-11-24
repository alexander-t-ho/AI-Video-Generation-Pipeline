/**
 * Voice Conversion Service using RVC (Realistic Voice Cloning) on Replicate
 * 
 * Supports:
 * - Converting existing audio to target voice
 * - Using pre-trained models or custom trained models
 * - Adjusting pitch, reverb, and index rate
 * - Converting narration tracks and video audio
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

// Replicate RVC models
const RVC_VOICE_CLONING_MODEL = 'zsxkib/realistic-voice-cloning';
const RVC_DATASET_MODEL = 'zsxkib/create-rvc-dataset';
const RVC_TRAIN_MODEL = 'replicate/train-rvc-model';

export interface VoiceConversionRequest {
  // Input audio (required - one of these)
  audioUrl?: string;        // URL to audio file
  audioPath?: string;        // Local path to audio file
  audioBuffer?: ArrayBuffer; // Raw audio buffer
  
  // Voice model (required - one of these)
  modelUrl?: string;         // URL to pre-trained RVC model (.pth file)
  modelPath?: string;        // Local path to RVC model
  customModelId?: string;    // ID of custom trained model (if stored in DB)
  
  // Conversion parameters (optional)
  pitchChange?: number;      // Pitch shift (e.g., 0 = no change, 12 = +1 octave, -12 = -1 octave)
  indexRate?: number;        // Index rate (0.0 to 1.0, default 0.5) - controls how much of the original voice characteristics to keep
  reverbSize?: number;       // Reverb size (0.0 to 1.0, default 0.0) - adds reverb effect
  protect?: number;          // Protect voiceless sounds (0.0 to 0.5, default 0.33)
  
  // Project context
  projectId: string;
}

export interface VoiceConversionResult {
  success: boolean;
  audioUrl?: string;
  localPath?: string;
  s3Url?: string;
  duration?: number;
  error?: string;
  predictionId?: string;
}

export interface VoiceConversionStatus {
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  audioUrl?: string;
  error?: string;
}

export interface VoiceConversionSource {
  // Source type
  type: 'narration' | 'video' | 'audio_track';
  
  // For narration
  narrationTrackId?: string;
  narrationAudioUrl?: string;
  
  // For video
  videoUrl?: string;
  videoPath?: string;
  timelineClipId?: string;
  
  // For generic audio track
  audioTrackId?: string;
  audioUrl?: string;
  
  // Voice model
  modelUrl?: string;
  customModelId?: string;
  
  // Conversion parameters
  pitchChange?: number;
  indexRate?: number;
  reverbSize?: number;
  protect?: number;
  
  projectId: string;
}

/**
 * Extract audio from video file using FFmpeg
 */
export async function extractAudioFromVideo(
  videoPath: string,
  outputPath: string
): Promise<void> {
  const command = `ffmpeg -i "${videoPath}" -vn -acodec libmp3lame -ab 192k -ar 44100 -y "${outputPath}"`;
  await execAsync(command);
}

/**
 * Convert voice using RVC model on Replicate
 */
export async function convertVoice(
  request: VoiceConversionRequest
): Promise<{ predictionId: string; status: string }> {
  const apiToken = process.env.REPLICATE_API_TOKEN;

  if (!apiToken) {
    throw new Error('REPLICATE_API_TOKEN is required for voice conversion');
  }

  // Prepare input audio
  let inputAudioUrl: string;
  if (request.audioBuffer) {
    // Save buffer to temp file
    const tempPath = await saveAudioBuffer(request.audioBuffer, request.projectId);
    // For Replicate, we need a publicly accessible URL
    // In production, upload to S3 first
    throw new Error('Audio buffer upload not yet implemented - use audioUrl or audioPath with S3 URL');
  } else if (request.audioPath) {
    // For local files, we need to upload to a publicly accessible location
    // For now, assume it's already accessible or upload to S3
    inputAudioUrl = request.audioPath;
    // TODO: Upload to S3 if not already there
    console.warn('[VoiceConverter] Using local audio path - ensure it\'s accessible or upload to S3 first');
  } else if (request.audioUrl) {
    inputAudioUrl = request.audioUrl;
  } else {
    throw new Error('No audio input provided (audioUrl, audioPath, or audioBuffer required)');
  }

  // Prepare model URL
  let modelUrl: string;
  if (request.modelPath) {
    // Similar to audio - need to upload to S3 or use public URL
    modelUrl = request.modelPath;
    console.warn('[VoiceConverter] Using local model path - ensure it\'s accessible or upload to S3 first');
  } else if (request.modelUrl) {
    modelUrl = request.modelUrl;
  } else if (request.customModelId) {
    // Fetch model from database/storage
    modelUrl = await getModelUrlFromId(request.customModelId);
  } else {
    throw new Error('No voice model provided (modelUrl, modelPath, or customModelId required)');
  }

  const inputParams = {
    input_audio: inputAudioUrl,
    model_path: modelUrl,
    pitch_change: request.pitchChange ?? 0,
    index_rate: request.indexRate ?? 0.5,
    reverb_size: request.reverbSize ?? 0.0,
    protect: request.protect ?? 0.33,
  };

  console.log('[VoiceConverter] Starting RVC conversion:', {
    inputAudioUrl: inputAudioUrl.substring(0, 50) + '...',
    modelUrl: modelUrl.substring(0, 50) + '...',
    pitchChange: inputParams.pitch_change,
    indexRate: inputParams.index_rate,
  });

  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: RVC_VOICE_CLONING_MODEL.split('/')[1], // May need to extract version hash
      input: inputParams,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[VoiceConverter] Replicate API error:', response.status, errorText);
    throw new Error(`Failed to start voice conversion: ${response.status} - ${errorText}`);
  }

  const prediction = await response.json();

  console.log('[VoiceConverter] Conversion started:', {
    predictionId: prediction.id,
    status: prediction.status,
  });

  return {
    predictionId: prediction.id,
    status: prediction.status,
  };
}

/**
 * Check voice conversion status
 */
export async function getVoiceConversionStatus(
  predictionId: string
): Promise<VoiceConversionStatus> {
  const apiToken = process.env.REPLICATE_API_TOKEN;

  if (!apiToken) {
    throw new Error('REPLICATE_API_TOKEN is required');
  }

  const response = await fetch(
    `https://api.replicate.com/v1/predictions/${predictionId}`,
    {
      headers: {
        'Authorization': `Token ${apiToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get conversion status: ${response.status}`);
  }

  const prediction = await response.json();

  return {
    status: prediction.status,
    audioUrl: prediction.output,
    error: prediction.error,
  };
}

/**
 * Convert voice from various sources (narration, video, audio track)
 */
export async function convertVoiceFromSource(
  source: VoiceConversionSource
): Promise<{ predictionId: string; status: string }> {
  let audioInput: { audioUrl?: string; audioPath?: string };
  
  switch (source.type) {
    case 'narration':
      // Use existing narration audio
      if (source.narrationAudioUrl) {
        audioInput = { audioUrl: source.narrationAudioUrl };
      } else if (source.narrationTrackId) {
        // In production, fetch from database
        throw new Error('Narration track lookup not yet implemented - use narrationAudioUrl');
      } else {
        throw new Error('Narration source requires narrationAudioUrl or narrationTrackId');
      }
      break;
      
    case 'video':
      // Extract audio from video first
      if (!source.videoUrl && !source.videoPath) {
        throw new Error('Video source requires videoUrl or videoPath');
      }
      
      const tempAudioPath = path.join('/tmp', 'voice-conversion', source.projectId, `extracted_${uuidv4()}.mp3`);
      await fs.mkdir(path.dirname(tempAudioPath), { recursive: true });
      
      let videoPath = source.videoPath;
      if (source.videoUrl && !videoPath) {
        // Download video first (simplified - in production use proper download)
        throw new Error('Video download not yet implemented - use videoPath or download first');
      }
      
      await extractAudioFromVideo(videoPath!, tempAudioPath);
      audioInput = { audioPath: tempAudioPath };
      break;
      
    case 'audio_track':
      // Use existing audio track
      if (source.audioUrl) {
        audioInput = { audioUrl: source.audioUrl };
      } else if (source.audioTrackId) {
        // In production, fetch from database
        throw new Error('Audio track lookup not yet implemented - use audioUrl');
      } else {
        throw new Error('Audio track source requires audioUrl or audioTrackId');
      }
      break;
      
    default:
      throw new Error(`Unknown source type: ${source.type}`);
  }
  
  // Perform voice conversion
  return convertVoice({
    ...audioInput,
    modelUrl: source.modelUrl,
    customModelId: source.customModelId,
    pitchChange: source.pitchChange,
    indexRate: source.indexRate,
    reverbSize: source.reverbSize,
    protect: source.protect,
    projectId: source.projectId,
  });
}

// Helper functions
async function saveAudioBuffer(buffer: ArrayBuffer, projectId: string): Promise<string> {
  const outputDir = path.join('/tmp', 'voice-conversion', projectId);
  await fs.mkdir(outputDir, { recursive: true });
  
  const filename = `audio_${uuidv4()}.mp3`;
  const filePath = path.join(outputDir, filename);
  
  await fs.writeFile(filePath, Buffer.from(buffer));
  return filePath;
}

async function getModelUrlFromId(modelId: string): Promise<string> {
  // TODO: Fetch from database or storage
  // For now, throw error to indicate it needs implementation
  throw new Error('Custom model lookup not yet implemented - use modelUrl instead');
}

