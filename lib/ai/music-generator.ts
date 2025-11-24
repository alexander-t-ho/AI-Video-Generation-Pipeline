/**
 * Music Generator Service
 *
 * Generates music using MusicGen via Replicate API.
 * Designed to be extensible for adding Suno or other providers later.
 */

import { MusicGenPrompt } from './video-music-analyzer';

// MusicGen model on Replicate (updated version hash)
const MUSICGEN_MODEL = 'meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb';

export type MusicProvider = 'musicgen' | 'suno'; // Extensible for future providers

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
}

export interface MusicGenerationResult {
  success: boolean;
  audioUrl?: string;
  localPath?: string;
  duration?: number;
  provider: MusicProvider;
  predictionId?: string;
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
 * Automatically detects provider based on predictionId format or uses provider parameter
 */
export async function getMusicGenerationStatus(
  predictionId: string,
  provider?: MusicProvider
): Promise<MusicGenerationStatus> {
  // Auto-detect provider if not specified
  if (!provider) {
    // Replicate prediction IDs are UUIDs, Suno might have different format
    // For now, check if SUNO_API is set and try Suno first, then fallback
    if (process.env.SUNO_API) {
      try {
        return await getSunoGenerationStatus(predictionId);
      } catch {
        // Fall through to MusicGen
      }
    }
    provider = 'musicgen';
  }

  if (provider === 'suno') {
    return getSunoGenerationStatus(predictionId);
  }

  // Default to MusicGen
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

/**
 * Generate music using Suno AI (via sunoapi.org third-party API)
 */
export async function generateMusicWithSuno(
  request: MusicGenerationRequest
): Promise<{ predictionId: string; status: string }> {
  const sunoApiKey = process.env.SUNO_API;

  if (!sunoApiKey) {
    throw new Error('SUNO_API is required for Suno music generation. Set it in .env.local or use MusicGen instead.');
  }

  // Suno supports longer durations (up to 2 minutes with Pro account)
  const duration = Math.floor(Math.min(Math.max(request.duration, 1), 120));
  
  console.log('[MusicGenerator] Starting Suno generation via sunoapi.org:', {
    promptLength: request.prompt.length,
    promptPreview: request.prompt.substring(0, 100) + '...',
    duration,
  });

  // Use sunoapi.org API endpoint
  const response = await fetch('https://api.sunoapi.org/v1/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sunoApiKey}`,
    },
    body: JSON.stringify({
      prompt: request.prompt,
      duration: duration,
      title: 'AI Generated Music',
      instrumental: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[MusicGenerator] Suno API error:', response.status, errorText);
    
    // If Suno API fails, we can fallback to MusicGen
    if (process.env.MUSIC_PROVIDER_FALLBACK !== 'false') {
      console.log('[MusicGenerator] Suno failed, falling back to MusicGen');
      return generateMusicWithMusicGen(request);
    }
    
    throw new Error(`Failed to start Suno generation: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  
  // sunoapi.org API response format
  const predictionId = result.id || result.task_id || result.prediction_id;
  const status = result.status || 'starting';

  console.log('[MusicGenerator] Suno generation started:', {
    predictionId,
    status,
  });

  return {
    predictionId,
    status,
  };
}

/**
 * Check Suno generation status (via sunoapi.org)
 */
export async function getSunoGenerationStatus(
  predictionId: string
): Promise<MusicGenerationStatus> {
  const sunoApiKey = process.env.SUNO_API;

  if (!sunoApiKey) {
    throw new Error('SUNO_API is required');
  }

  const response = await fetch(
    `https://api.sunoapi.org/v1/status/${predictionId}`,
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sunoApiKey}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get Suno status: ${response.status}`);
  }

  const result = await response.json();
  
  // Map sunoapi.org status to our status format
  return {
    status: mapSunoStatus(result.status || result.state),
    audioUrl: result.audio_url || result.music_url || result.output || result.url,
    error: result.error,
  };
}

/**
 * Map Suno status to our status format
 */
function mapSunoStatus(sunoStatus: string): MusicGenerationStatus['status'] {
  const statusMap: Record<string, MusicGenerationStatus['status']> = {
    'pending': 'starting',
    'generating': 'processing',
    'complete': 'succeeded',
    'completed': 'succeeded',
    'succeeded': 'succeeded',
    'failed': 'failed',
    'error': 'failed',
    'canceled': 'canceled',
  };
  return statusMap[sunoStatus?.toLowerCase()] || 'processing';
}

/**
 * Extract tags/genre from prompt for Suno
 */
function extractTagsFromPrompt(prompt: string): string[] {
  const tags: string[] = [];
  const lowerPrompt = prompt.toLowerCase();
  
  // Common genre keywords
  const genreKeywords: Record<string, string> = {
    'electronic': 'electronic',
    'rock': 'rock',
    'pop': 'pop',
    'jazz': 'jazz',
    'classical': 'classical',
    'cinematic': 'cinematic',
    'ambient': 'ambient',
    'hip hop': 'hip hop',
    'country': 'country',
    'blues': 'blues',
    'metal': 'metal',
    'folk': 'folk',
    'reggae': 'reggae',
    'latin': 'latin',
  };
  
  for (const [keyword, tag] of Object.entries(genreKeywords)) {
    if (lowerPrompt.includes(keyword)) {
      tags.push(tag);
    }
  }
  
  // If no tags found, default to instrumental
  if (tags.length === 0) {
    tags.push('instrumental');
  }
  
  return tags;
}

/**
 * Wait for Suno generation to complete (with polling)
 */
export async function waitForSunoGeneration(
  predictionId: string,
  options: {
    pollInterval?: number;
    timeout?: number;
    onProgress?: (status: MusicGenerationStatus) => void;
  } = {}
): Promise<MusicGenerationResult> {
  const { pollInterval = 3000, timeout = 300000, onProgress } = options; // Suno can take longer
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const status = await getSunoGenerationStatus(predictionId);

    if (onProgress) {
      onProgress(status);
    }

    if (status.status === 'succeeded') {
      return {
        success: true,
        audioUrl: status.audioUrl,
        provider: 'suno',
        predictionId,
      };
    }

    if (status.status === 'failed' || status.status === 'canceled') {
      return {
        success: false,
        provider: 'suno',
        predictionId,
        error: status.error || 'Generation failed',
      };
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  return {
    success: false,
    provider: 'suno',
    predictionId,
    error: 'Generation timed out',
  };
}

/**
 * High-level function to generate music from a prompt
 * Handles the full flow: start generation → poll → return result
 * Supports both MusicGen and Suno with automatic fallback
 */
export async function generateMusic(
  request: MusicGenerationRequest
): Promise<MusicGenerationResult> {
  // Determine provider: use request provider, env var, or default to MusicGen
  const defaultProvider = (process.env.MUSIC_PROVIDER as MusicProvider) || 'musicgen';
  const provider = request.provider || defaultProvider;

  if (provider === 'musicgen') {
    try {
      const { predictionId } = await generateMusicWithMusicGen(request);
      return waitForMusicGeneration(predictionId);
    } catch (error) {
      console.error('[MusicGenerator] MusicGen failed:', error);
      // If fallback enabled and Suno is available, try Suno
      if (process.env.MUSIC_PROVIDER_FALLBACK !== 'false' && process.env.SUNO_API) {
        console.log('[MusicGenerator] Falling back to Suno');
        return generateMusic({ ...request, provider: 'suno' });
      }
      throw error;
    }
  }

  if (provider === 'suno') {
    try {
      const { predictionId } = await generateMusicWithSuno(request);
      return waitForSunoGeneration(predictionId);
    } catch (error) {
      console.error('[MusicGenerator] Suno failed:', error);
      // If fallback enabled and MusicGen is available, try MusicGen
      if (process.env.MUSIC_PROVIDER_FALLBACK !== 'false' && process.env.REPLICATE_API_TOKEN) {
        console.log('[MusicGenerator] Falling back to MusicGen');
        return generateMusic({ ...request, provider: 'musicgen' });
      }
      throw error;
    }
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
