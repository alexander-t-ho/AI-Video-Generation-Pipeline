/**
 * Music Generator Service
 *
 * Generates music using MusicGen via Replicate API or Suno via sunoapi.org.
 * Supports multiple providers for flexibility.
 */

import { MusicGenPrompt } from './video-music-analyzer';

// MusicGen model on Replicate (updated version hash)
const MUSICGEN_MODEL = 'meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb';

// Suno API via sunoapi.org
const SUNO_API_URL = 'https://api.sunoapi.org';

// Suno model versions
export type SunoModel = 'V3_5' | 'V4' | 'V4_5' | 'V4_5PLUS' | 'V5';

export type MusicProvider = 'musicgen' | 'suno';

export interface MusicGenerationRequest {
  prompt: string;
  duration: number; // in seconds
  provider?: MusicProvider;
  temperature?: number;
  topK?: number;
  topP?: number;
  classifierFreeGuidance?: number;
  outputFormat?: 'wav' | 'mp3';
  modelVersion?: 'stereo-melody-large' | 'stereo-large' | 'melody-large' | 'large';
  // Suno-specific options
  sunoModel?: SunoModel;
  style?: string; // Music style/genre for Suno
  title?: string; // Song title for Suno
  instrumental?: boolean; // Whether to generate instrumental only
}

export interface MusicGenerationResult {
  success: boolean;
  audioUrl?: string;
  localPath?: string;
  duration?: number;
  provider: MusicProvider;
  predictionId?: string; // For MusicGen (Replicate)
  taskId?: string; // For Suno
  error?: string;
}

export interface MusicGenerationStatus {
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  progress?: number;
  audioUrl?: string;
  error?: string;
}

/**
 * Generate music using MusicGen via Replicate
 */
export async function generateMusicWithMusicGen(
  request: MusicGenerationRequest
): Promise<{ predictionId: string; status: string }> {
  const apiToken = process.env.REPLICATE_API_TOKEN;

  if (!apiToken) {
    throw new Error('REPLICATE_API_TOKEN is required for music generation');
  }

  const inputParams = {
    prompt: request.prompt,
    duration: Math.floor(Math.min(Math.max(request.duration, 1), 30)),
    model_version: request.modelVersion || 'stereo-melody-large',
    output_format: request.outputFormat || 'wav',
    temperature: request.temperature ?? 1.0,
    top_k: request.topK ?? 250,
    top_p: request.topP ?? 0.0,
    classifier_free_guidance: request.classifierFreeGuidance ?? 3,
    normalization_strategy: 'loudness',
  };

  console.log('[MusicGenerator] Starting MusicGen generation:', {
    promptLength: request.prompt.length,
    promptPreview: request.prompt.substring(0, 100) + '...',
    duration: inputParams.duration,
    model: inputParams.model_version,
    outputFormat: inputParams.output_format,
  });

  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: MUSICGEN_MODEL.split(':')[1],
      input: inputParams,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[MusicGenerator] Replicate API error:', response.status, errorText);
    // Try to parse the error for more details
    try {
      const errorJson = JSON.parse(errorText);
      console.error('[MusicGenerator] Error details:', JSON.stringify(errorJson, null, 2));
      throw new Error(`Failed to start music generation: ${response.status} - ${errorJson.detail || errorJson.error || errorText}`);
    } catch {
      throw new Error(`Failed to start music generation: ${response.status} - ${errorText}`);
    }
  }

  const prediction = await response.json();

  console.log('[MusicGenerator] Generation started:', {
    predictionId: prediction.id,
    status: prediction.status,
  });

  return {
    predictionId: prediction.id,
    status: prediction.status,
  };
}

/**
 * Check the status of a music generation prediction
 */
export async function getMusicGenerationStatus(
  predictionId: string
): Promise<MusicGenerationStatus> {
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
    throw new Error(`Failed to get prediction status: ${response.status}`);
  }

  const prediction = await response.json();

  return {
    status: prediction.status,
    audioUrl: prediction.output,
    error: prediction.error,
  };
}

/**
 * Wait for music generation to complete (with polling)
 */
export async function waitForMusicGeneration(
  predictionId: string,
  options: {
    pollInterval?: number;
    timeout?: number;
    onProgress?: (status: MusicGenerationStatus) => void;
  } = {}
): Promise<MusicGenerationResult> {
  const { pollInterval = 2000, timeout = 120000, onProgress } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const status = await getMusicGenerationStatus(predictionId);

    if (onProgress) {
      onProgress(status);
    }

    if (status.status === 'succeeded') {
      return {
        success: true,
        audioUrl: status.audioUrl,
        provider: 'musicgen',
        predictionId,
      };
    }

    if (status.status === 'failed' || status.status === 'canceled') {
      return {
        success: false,
        provider: 'musicgen',
        predictionId,
        error: status.error || 'Generation failed',
      };
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  return {
    success: false,
    provider: 'musicgen',
    predictionId,
    error: 'Generation timed out',
  };
}

// ============================================================================
// SUNO API INTEGRATION (via sunoapi.org)
// ============================================================================

export interface SunoGenerationResponse {
  taskId: string;
  status: string;
}

export interface SunoStatusResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
    status: 'SUCCESS' | 'PENDING' | 'TEXT_SUCCESS' | 'FIRST_SUCCESS' | 'SENSITIVE_WORD_ERROR' | 'CREATE_TASK_FAILED';
    sunoData?: Array<{
      id: string;
      audioUrl: string;
      videoUrl?: string;
      imageUrl?: string;
      prompt: string;
      modelName: string;
      title: string;
      tags: string;
      duration: number;
    }>;
    errorMessage?: string;
  };
}

/**
 * Generate music using Suno via sunoapi.org
 */
export async function generateMusicWithSuno(
  request: MusicGenerationRequest
): Promise<{ taskId: string; status: string }> {
  const apiKey = process.env.SUNO_API;

  if (!apiKey) {
    throw new Error('SUNO_API is required for Suno music generation');
  }

  // Build the request body
  const requestBody = {
    customMode: true, // Use custom mode for more control
    instrumental: request.instrumental ?? true, // Default to instrumental for video backgrounds
    model: request.sunoModel || 'V4', // Default to V4 model
    prompt: request.prompt,
    style: request.style || 'cinematic, film score, ambient',
    title: request.title || 'Generated Music',
  };

  console.log('[MusicGenerator] Starting Suno generation:', {
    promptLength: request.prompt.length,
    promptPreview: request.prompt.substring(0, 100) + '...',
    model: requestBody.model,
    style: requestBody.style,
    instrumental: requestBody.instrumental,
  });

  const response = await fetch(`${SUNO_API_URL}/api/v1/generate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[MusicGenerator] Suno API error:', response.status, errorText);
    try {
      const errorJson = JSON.parse(errorText);
      throw new Error(`Failed to start Suno generation: ${response.status} - ${errorJson.msg || errorJson.message || errorText}`);
    } catch {
      throw new Error(`Failed to start Suno generation: ${response.status} - ${errorText}`);
    }
  }

  const result = await response.json();

  console.log('[MusicGenerator] Suno generation started:', {
    taskId: result.data?.taskId || result.taskId,
    status: result.data?.status || result.status,
  });

  return {
    taskId: result.data?.taskId || result.taskId,
    status: result.data?.status || result.status || 'PENDING',
  };
}

/**
 * Check the status of a Suno generation task
 */
export async function getSunoGenerationStatus(
  taskId: string
): Promise<MusicGenerationStatus & { audioUrl?: string; duration?: number }> {
  const apiKey = process.env.SUNO_API;

  if (!apiKey) {
    throw new Error('SUNO_API is required');
  }

  const response = await fetch(
    `${SUNO_API_URL}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get Suno status: ${response.status}`);
  }

  const result: SunoStatusResponse = await response.json();

  // Map Suno status to our standard status
  let status: MusicGenerationStatus['status'];
  switch (result.data.status) {
    case 'SUCCESS':
    case 'FIRST_SUCCESS':
      status = 'succeeded';
      break;
    case 'PENDING':
    case 'TEXT_SUCCESS':
      status = 'processing';
      break;
    case 'SENSITIVE_WORD_ERROR':
    case 'CREATE_TASK_FAILED':
      status = 'failed';
      break;
    default:
      status = 'processing';
  }

  // Get the first audio result if available
  const sunoData = result.data.sunoData?.[0];

  return {
    status,
    audioUrl: sunoData?.audioUrl,
    duration: sunoData?.duration,
    error: result.data.errorMessage,
  };
}

/**
 * Wait for Suno generation to complete (with polling)
 */
export async function waitForSunoGeneration(
  taskId: string,
  options: {
    pollInterval?: number;
    timeout?: number;
    onProgress?: (status: MusicGenerationStatus) => void;
  } = {}
): Promise<MusicGenerationResult> {
  // Suno can take longer, so use longer defaults
  const { pollInterval = 5000, timeout = 300000, onProgress } = options;
  const startTime = Date.now();

  console.log('[MusicGenerator] Polling Suno status for taskId:', taskId);

  while (Date.now() - startTime < timeout) {
    try {
      const status = await getSunoGenerationStatus(taskId);

      if (onProgress) {
        onProgress(status);
      }

      console.log('[MusicGenerator] Suno status:', {
        taskId,
        status: status.status,
        hasAudioUrl: !!status.audioUrl,
      });

      if (status.status === 'succeeded' && status.audioUrl) {
        return {
          success: true,
          audioUrl: status.audioUrl,
          duration: status.duration,
          provider: 'suno',
          taskId,
        };
      }

      if (status.status === 'failed') {
        return {
          success: false,
          provider: 'suno',
          taskId,
          error: status.error || 'Suno generation failed',
        };
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error('[MusicGenerator] Error polling Suno status:', error);
      // Continue polling on transient errors
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  return {
    success: false,
    provider: 'suno',
    taskId,
    error: 'Suno generation timed out',
  };
}

/**
 * High-level function to generate music from a prompt
 * Handles the full flow: start generation → poll → return result
 */
export async function generateMusic(
  request: MusicGenerationRequest
): Promise<MusicGenerationResult> {
  const provider = request.provider || 'musicgen';

  if (provider === 'musicgen') {
    const { predictionId } = await generateMusicWithMusicGen(request);
    return waitForMusicGeneration(predictionId);
  }

  if (provider === 'suno') {
    const { taskId } = await generateMusicWithSuno(request);
    return waitForSunoGeneration(taskId);
  }

  throw new Error(`Unknown music provider: ${provider}`);
}

/**
 * Generate music from video analysis (convenience function)
 */
export async function generateMusicFromAnalysis(
  musicPrompt: MusicGenPrompt,
  options?: Partial<MusicGenerationRequest>
): Promise<MusicGenerationResult> {
  return generateMusic({
    prompt: musicPrompt.prompt,
    duration: musicPrompt.duration,
    temperature: musicPrompt.temperature,
    ...options,
  });
}
