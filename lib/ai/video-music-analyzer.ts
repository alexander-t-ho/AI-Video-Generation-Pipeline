/**
 * Video Music Analyzer - Gemini Integration via OpenRouter
 *
 * Analyzes videos to extract musical cues, mood, and timing information
 * for generating synchronized music tracks.
 *
 * Note: Google Gemini via OpenRouter only supports YouTube video links for video.
 * For S3/other video URLs, we use frame-based analysis with image vision.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Use Gemini 2.5 Flash for vision - faster and supports image analysis well
const GEMINI_MODEL = 'google/gemini-2.5-flash';

// Fallback to GPT-4o if Gemini fails
const FALLBACK_MODEL = 'openai/gpt-4o';

// Configuration
const MAX_FRAME_WIDTH = 800; // Resize frames to prevent large base64
const MAX_FRAME_HEIGHT = 600;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const VIDEO_DOWNLOAD_TIMEOUT_MS = 120000; // 2 minutes
const MIN_VIDEO_SIZE_BYTES = 1000; // Minimum valid video size

export interface VideoScene {
  start: string; // MM:SS format
  end: string;
  mood: string;
  energy: number; // 1-10 scale
  description: string;
  musicalSuggestion: string;
}

export interface VideoMusicAnalysis {
  duration: string;
  overallMood: string;
  overallGenre: string;
  suggestedBPM: number;
  suggestedInstruments: string[];
  scenes: VideoScene[];
  keyMoments: {
    timestamp: string;
    type: 'climax' | 'transition' | 'calm' | 'build' | 'drop';
    description: string;
  }[];
}

export interface MusicGenPrompt {
  prompt: string;
  duration: number; // in seconds
  temperature?: number;
}

/**
 * Check if ffmpeg and ffprobe are available
 */
async function checkFFmpegAvailable(): Promise<{ ffmpeg: boolean; ffprobe: boolean }> {
  const result = { ffmpeg: false, ffprobe: false };

  try {
    await execAsync('ffmpeg -version', { timeout: 5000 });
    result.ffmpeg = true;
  } catch {
    console.warn('[VideoMusicAnalyzer] ffmpeg not found in PATH');
  }

  try {
    await execAsync('ffprobe -version', { timeout: 5000 });
    result.ffprobe = true;
  } catch {
    console.warn('[VideoMusicAnalyzer] ffprobe not found in PATH');
  }

  return result;
}

/**
 * Validate video URL format
 */
function isValidVideoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Download video from URL to local path with robust error handling
 */
async function downloadVideo(videoUrl: string): Promise<string> {
  // Validate URL
  if (!isValidVideoUrl(videoUrl)) {
    throw new Error(`Invalid video URL: ${videoUrl.substring(0, 50)}...`);
  }

  const tmpDir = path.join('/tmp', 'music-analysis');
  await fs.mkdir(tmpDir, { recursive: true });

  const videoPath = path.join(tmpDir, `video-${uuidv4()}.mp4`);

  console.log('[VideoMusicAnalyzer] Downloading video from:', videoUrl.substring(0, 80) + '...');

  try {
    // Use curl with better options: follow redirects, fail on HTTP errors, show progress
    const curlCommand = `curl -L -f -S --connect-timeout 30 --max-time 120 -o "${videoPath}" "${videoUrl}"`;
    await execAsync(curlCommand, { timeout: VIDEO_DOWNLOAD_TIMEOUT_MS });

    // Verify file exists and has content
    const stats = await fs.stat(videoPath);

    if (stats.size < MIN_VIDEO_SIZE_BYTES) {
      await fs.unlink(videoPath).catch(() => {});
      throw new Error(`Downloaded video too small (${stats.size} bytes) - may be invalid or empty`);
    }

    console.log('[VideoMusicAnalyzer] Downloaded video:', stats.size, 'bytes');
    return videoPath;

  } catch (error: any) {
    // Clean up partial download
    await fs.unlink(videoPath).catch(() => {});

    if (error.message?.includes('ETIMEDOUT') || error.message?.includes('timeout')) {
      throw new Error('Video download timed out - URL may be slow or unreachable');
    }
    if (error.message?.includes('curl: (22)') || error.message?.includes('The requested URL returned error')) {
      throw new Error('Video URL returned HTTP error - check if URL is accessible');
    }
    if (error.message?.includes('curl: (6)') || error.message?.includes('Could not resolve host')) {
      throw new Error('Could not resolve video host - check network connection');
    }

    throw new Error(`Failed to download video: ${error.message}`);
  }
}

/**
 * Extract and resize frames from video for analysis
 */
async function extractFramesForAnalysis(videoPath: string, frameCount: number = 5): Promise<string[]> {
  // Check ffmpeg/ffprobe availability
  const ffAvailable = await checkFFmpegAvailable();

  if (!ffAvailable.ffprobe) {
    throw new Error('ffprobe is not installed or not in PATH. Please install ffmpeg.');
  }
  if (!ffAvailable.ffmpeg) {
    throw new Error('ffmpeg is not installed or not in PATH. Please install ffmpeg.');
  }

  const tmpDir = path.join('/tmp', 'music-analysis', 'frames');
  await fs.mkdir(tmpDir, { recursive: true });

  // Get video duration with error handling
  let duration: number;
  try {
    const durationCmd = `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`;
    const { stdout, stderr } = await execAsync(durationCmd, { timeout: 30000 });

    if (stderr && stderr.includes('Invalid data found')) {
      throw new Error('Invalid video format - ffprobe could not read file');
    }

    duration = parseFloat(stdout.trim());

    if (isNaN(duration) || duration <= 0) {
      throw new Error(`Invalid video duration: ${stdout.trim()}`);
    }
  } catch (error: any) {
    throw new Error(`Failed to get video duration: ${error.message}`);
  }

  console.log('[VideoMusicAnalyzer] Video duration:', duration, 'seconds');

  const framePaths: string[] = [];
  const interval = duration / (frameCount + 1);

  for (let i = 1; i <= frameCount; i++) {
    const timestamp = interval * i;
    const framePath = path.join(tmpDir, `frame-${uuidv4()}-${i}.jpg`);

    try {
      // Extract frame with resize to reduce base64 size
      // Using scale filter to resize while maintaining aspect ratio
      const ffmpegCmd = `ffmpeg -ss ${timestamp} -i "${videoPath}" -vframes 1 -vf "scale='min(${MAX_FRAME_WIDTH},iw)':'min(${MAX_FRAME_HEIGHT},ih)':force_original_aspect_ratio=decrease" -q:v 3 -y "${framePath}" 2>/dev/null`;
      await execAsync(ffmpegCmd, { timeout: 30000 });

      // Verify frame was created and has content
      const stats = await fs.stat(framePath);
      if (stats.size > 100) { // Minimum valid JPEG size
        framePaths.push(framePath);
      } else {
        console.warn(`[VideoMusicAnalyzer] Frame ${i} too small, skipping`);
        await fs.unlink(framePath).catch(() => {});
      }
    } catch (error: any) {
      console.warn(`[VideoMusicAnalyzer] Failed to extract frame at ${timestamp.toFixed(2)}s:`, error.message);
      // Continue with other frames
    }
  }

  if (framePaths.length === 0) {
    throw new Error('No valid frames could be extracted from video');
  }

  console.log('[VideoMusicAnalyzer] Extracted', framePaths.length, 'frames');
  return framePaths;
}

/**
 * Convert image file to base64 with size check
 */
async function imageToBase64(imagePath: string): Promise<string> {
  const { imageCache } = await import('@/lib/storage/cache');

  // Check cache first
  let imageBuffer: Buffer;
  const cached = imageCache.get(imagePath);
  if (cached) {
    imageBuffer = cached.buffer;
  } else {
    imageBuffer = await fs.readFile(imagePath);
    imageCache.set(imagePath, imageBuffer, 'image/jpeg');
  }

  // Warn if image is very large (>500KB base64 ≈ 375KB file)
  if (imageBuffer.length > 375000) {
    console.warn(`[VideoMusicAnalyzer] Large frame: ${(imageBuffer.length / 1024).toFixed(1)}KB - may cause API issues`);
  }

  return `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
}

/**
 * Make API request with retry logic
 */
async function makeVisionRequest(
  apiKey: string,
  model: string,
  messageContent: any[],
  retries: number = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          'X-Title': 'AI Video Generation Pipeline - Music Analysis',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: messageContent,
            },
          ],
          max_tokens: 4000,
          temperature: 0.3,
        }),
      });

      // Check for rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : RETRY_DELAY_MS * (attempt + 1);
        console.warn(`[VideoMusicAnalyzer] Rate limited, waiting ${waitTime}ms before retry`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      // Return successful or non-retryable responses
      if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
        return response;
      }

      // Server errors (5xx) - retry
      lastError = new Error(`API returned ${response.status}`);
      console.warn(`[VideoMusicAnalyzer] API error ${response.status}, attempt ${attempt + 1}/${retries + 1}`);

    } catch (error: any) {
      lastError = error;
      console.warn(`[VideoMusicAnalyzer] Request failed, attempt ${attempt + 1}/${retries + 1}:`, error.message);
    }

    if (attempt < retries) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
    }
  }

  throw lastError || new Error('API request failed after retries');
}

/**
 * Analyze a video for music composition using frame-based vision analysis
 *
 * @param videoUrl - URL to the video (S3 or other public URL)
 * @param videoBase64 - Optional base64 encoded video data (not currently used)
 * @param videoDuration - Optional known video duration in seconds
 * @returns Structured analysis for music generation
 */
export async function analyzeVideoForMusic(
  videoUrl?: string,
  videoBase64?: string,
  videoDuration?: number
): Promise<VideoMusicAnalysis> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    console.error('[VideoMusicAnalyzer] OPENROUTER_API_KEY is not set');
    return createDefaultAnalysis(videoDuration || 30);
  }

  if (!videoUrl && !videoBase64) {
    console.error('[VideoMusicAnalyzer] No video source provided');
    return createDefaultAnalysis(videoDuration || 30);
  }

  // For base64 video, we can't easily extract frames, so create a simple analysis
  if (videoBase64 && !videoUrl) {
    console.log('[VideoMusicAnalyzer] Base64 video provided - using simplified analysis');
    return createDefaultAnalysis(videoDuration || 30);
  }

  let videoPath: string | null = null;
  let framePaths: string[] = [];

  try {
    // Download the video
    videoPath = await downloadVideo(videoUrl!);

    // Extract frames for analysis
    framePaths = await extractFramesForAnalysis(videoPath, 5);

    // Convert frames to base64
    const frameBase64List = await Promise.all(framePaths.map(imageToBase64));

    // Calculate total base64 size
    const totalBase64Size = frameBase64List.reduce((sum, b64) => sum + b64.length, 0);
    console.log(`[VideoMusicAnalyzer] Total frames base64 size: ${(totalBase64Size / 1024).toFixed(1)}KB`);

    // If too large, reduce frames
    let finalFrames = frameBase64List;
    if (totalBase64Size > 4 * 1024 * 1024) { // 4MB limit
      console.warn('[VideoMusicAnalyzer] Frames too large, using fewer frames');
      // Use every other frame
      finalFrames = frameBase64List.filter((_, i) => i % 2 === 0);
    }

    // Build the analysis prompt with frames
    const analysisPrompt = `Analyze these ${finalFrames.length} frames from a video to recommend music for it.

The frames are in chronological order and represent key moments from the video.

Based on what you see, provide a JSON object with this exact structure:
{
  "duration": "${videoDuration ? Math.round(videoDuration) : '30'}",
  "overallMood": "description of the overall emotional tone",
  "overallGenre": "suggested music genre/style (e.g., cinematic, electronic, ambient, rock)",
  "suggestedBPM": number between 60-180,
  "suggestedInstruments": ["instrument1", "instrument2", "instrument3"],
  "scenes": [
    {
      "start": "00:00",
      "end": "00:10",
      "mood": "emotional tone for this part",
      "energy": number 1-10,
      "description": "what's happening visually",
      "musicalSuggestion": "specific music suggestions"
    }
  ],
  "keyMoments": [
    {
      "timestamp": "00:05",
      "type": "climax|transition|calm|build|drop",
      "description": "what makes this moment significant"
    }
  ]
}

For automotive/product videos:
- Dramatic reveals → building crescendos
- Speed/motion → high energy, fast tempo (120-140 BPM)
- Detail shots → subtle, atmospheric music (80-100 BPM)
- Wide landscape → epic, sweeping orchestral

Return ONLY the JSON object.`;

    // Build message content with all frames
    const messageContent: any[] = [
      {
        type: 'text',
        text: analysisPrompt,
      },
    ];

    // Add each frame as an image
    for (const frameBase64 of finalFrames) {
      messageContent.push({
        type: 'image_url',
        image_url: {
          url: frameBase64,
        },
      });
    }

    console.log('[VideoMusicAnalyzer] Analyzing frames with vision model...');

    // Try Gemini first with retries
    let response = await makeVisionRequest(apiKey, GEMINI_MODEL, messageContent);

    // If Gemini fails, try GPT-4o
    if (!response.ok) {
      const errorText = await response.text();
      console.warn('[VideoMusicAnalyzer] Gemini failed:', response.status, errorText.substring(0, 200));
      console.log('[VideoMusicAnalyzer] Falling back to GPT-4o...');

      response = await makeVisionRequest(apiKey, FALLBACK_MODEL, messageContent);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[VideoMusicAnalyzer] All vision models failed:', response.status, errorText);
      throw new Error(`Vision API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error('No analysis returned from vision model');
    }

    // Parse the JSON response
    let cleanedContent = content;
    if (cleanedContent.startsWith('```')) {
      cleanedContent = cleanedContent.replace(/```json?\n?/g, '').replace(/```\n?/g, '');
    }

    // Handle potential trailing content after JSON
    const jsonEndIndex = cleanedContent.lastIndexOf('}');
    if (jsonEndIndex !== -1) {
      cleanedContent = cleanedContent.substring(0, jsonEndIndex + 1);
    }

    const analysis: VideoMusicAnalysis = JSON.parse(cleanedContent);
    console.log('[VideoMusicAnalyzer] Successfully analyzed video:', {
      duration: analysis.duration,
      scenes: analysis.scenes?.length || 0,
      mood: analysis.overallMood,
      genre: analysis.overallGenre,
    });

    return analysis;

  } catch (error: any) {
    console.error('[VideoMusicAnalyzer] Analysis failed:', error.message);
    // Return a default analysis on failure
    return createDefaultAnalysis(videoDuration || 30);
  } finally {
    // Clean up downloaded video and frames
    if (videoPath) {
      try {
        await fs.unlink(videoPath);
      } catch { /* ignore */ }
    }
    for (const framePath of framePaths) {
      try {
        await fs.unlink(framePath);
      } catch { /* ignore */ }
    }
  }
}

/**
 * Create a default analysis when video analysis fails
 */
function createDefaultAnalysis(durationSeconds: number): VideoMusicAnalysis {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.round(durationSeconds % 60);
  const durationStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  console.log('[VideoMusicAnalyzer] Using default analysis for duration:', durationSeconds, 'seconds');

  return {
    duration: durationStr,
    overallMood: 'dynamic and engaging',
    overallGenre: 'cinematic electronic',
    suggestedBPM: 110,
    suggestedInstruments: ['synthesizer', 'drums', 'bass', 'strings'],
    scenes: [
      {
        start: '00:00',
        end: durationStr,
        mood: 'energetic',
        energy: 7,
        description: 'Full video sequence',
        musicalSuggestion: 'Modern cinematic electronic with building intensity',
      },
    ],
    keyMoments: [
      {
        timestamp: '00:00',
        type: 'build',
        description: 'Opening sequence',
      },
    ],
  };
}

/**
 * Convert video analysis to a MusicGen prompt
 *
 * @param analysis - The video analysis from vision model
 * @returns A prompt suitable for MusicGen
 */
export function convertAnalysisToMusicGenPrompt(analysis: VideoMusicAnalysis): MusicGenPrompt {
  // Parse duration to seconds
  const durationParts = analysis.duration.split(':').map(Number);
  let totalSeconds = 0;
  if (durationParts.length === 2) {
    totalSeconds = (durationParts[0] || 0) * 60 + (durationParts[1] || 0);
  } else if (durationParts.length === 1) {
    totalSeconds = durationParts[0] || 30;
  } else {
    totalSeconds = 30;
  }

  // Build scene descriptions for the prompt
  const sceneDescriptions = (analysis.scenes || []).map((scene) => {
    return `${scene.musicalSuggestion} (energy ${scene.energy}/10)`;
  }).join('. ');

  // Build key moments description
  const keyMomentsDesc = (analysis.keyMoments || []).length > 0
    ? analysis.keyMoments.map(m => `${m.type}`).join(', ')
    : 'dynamic progression';

  // Construct the MusicGen prompt
  const prompt = `${analysis.overallGenre} music, ${analysis.overallMood} mood, ${analysis.suggestedBPM} BPM.
Instruments: ${(analysis.suggestedInstruments || ['synthesizer', 'drums']).join(', ')}.
Style: ${sceneDescriptions || 'cinematic and engaging'}.
Progression: ${keyMomentsDesc}.
High quality, cinematic, professional production.`;

  return {
    prompt: prompt.trim(),
    duration: Math.min(Math.max(totalSeconds, 10), 30), // MusicGen limits: 10-30s
    temperature: 0.8,
  };
}

/**
 * Create a simple music prompt from text description
 * (For use without video analysis)
 */
export function createSimpleMusicPrompt(
  mood: string,
  genre: string,
  duration: number = 30,
  additionalDetails?: string
): MusicGenPrompt {
  let prompt = `${genre} music with ${mood} mood`;

  if (additionalDetails) {
    prompt += `. ${additionalDetails}`;
  }

  prompt += '. High quality, professional production.';

  return {
    prompt,
    duration: Math.min(duration, 30),
    temperature: 0.8,
  };
}
