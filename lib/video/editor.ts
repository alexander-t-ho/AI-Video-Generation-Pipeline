/**
 * Video Editor Utilities
 * Functions for editing video clips: split, crop, delete
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { TimelineClip } from '@/lib/types';

const execAsync = promisify(exec);

// Cache for tracking edited clips to avoid re-processing unchanged clips
interface ClipCacheEntry {
  hash: string;
  outputPath: string;
  timestamp: number;
}

// In-memory cache for clip edits (persists during server runtime)
const clipEditCache = new Map<string, ClipCacheEntry>();

/**
 * Generate a hash for clip edit parameters to detect changes
 */
function generateClipHash(clip: TimelineClip): string {
  const hashData = {
    videoPath: clip.videoLocalPath,
    trimStart: clip.trimStart ?? 0,
    trimEnd: clip.trimEnd ?? clip.sourceDuration,
    sourceDuration: clip.sourceDuration,
  };
  return crypto.createHash('md5').update(JSON.stringify(hashData)).digest('hex');
}

/**
 * Crop/trim a video clip
 * @param inputPath Path to source video
 * @param outputPath Path to save cropped video
 * @param startTime Start time in seconds
 * @param endTime End time in seconds
 */
export async function cropVideo(
  inputPath: string,
  outputPath: string,
  startTime: number,
  endTime: number
): Promise<void> {
  const duration = endTime - startTime;

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });

  // Always re-encode when cropping to ensure proper keyframe alignment
  // Using -c copy can produce files without video streams for short segments
  // Use -ss before -i for faster seeking (input seeking)
  const command = `ffmpeg -ss ${startTime} -i "${inputPath}" -t ${duration} -c:v libx264 -preset ultrafast -crf 23 -c:a aac -b:a 128k -avoid_negative_ts make_zero -y "${outputPath}"`;

  try {
    await execAsync(command);
  } catch (error: any) {
    // If re-encoding fails (e.g., no audio stream), try video only
    console.log(`[Editor] Re-encoding with audio failed, trying video only: ${error.message}`);
    const videoOnlyCommand = `ffmpeg -ss ${startTime} -i "${inputPath}" -t ${duration} -c:v libx264 -preset ultrafast -crf 23 -an -avoid_negative_ts make_zero -y "${outputPath}"`;
    await execAsync(videoOnlyCommand);
  }
}

/**
 * Split a video into two parts
 * @param inputPath Path to source video
 * @param outputPath1 Path to save first part
 * @param outputPath2 Path to save second part
 * @param splitTime Time to split at (in seconds)
 */
export async function splitVideo(
  inputPath: string,
  outputPath1: string,
  outputPath2: string,
  splitTime: number
): Promise<void> {
  // Get video duration first
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`
  );
  const totalDuration = parseFloat(stdout.trim());
  
  // Ensure output directories exist
  await fs.mkdir(path.dirname(outputPath1), { recursive: true });
  await fs.mkdir(path.dirname(outputPath2), { recursive: true });
  
  // Create first part (0 to splitTime)
  const command1 = `ffmpeg -i "${inputPath}" -t ${splitTime} -c copy -avoid_negative_ts make_zero "${outputPath1}"`;
  await execAsync(command1);
  
  // Create second part (splitTime to end)
  const command2 = `ffmpeg -i "${inputPath}" -ss ${splitTime} -c copy -avoid_negative_ts make_zero "${outputPath2}"`;
  try {
    await execAsync(command2);
  } catch (error) {
    // If copy codec fails, try re-encoding
    const reencodeCommand = `ffmpeg -i "${inputPath}" -ss ${splitTime} -c:v libx264 -c:a aac -avoid_negative_ts make_zero "${outputPath2}"`;
    await execAsync(reencodeCommand);
  }
}

/**
 * Get video duration
 */
export async function getVideoDuration(videoPath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
    );
    return parseFloat(stdout.trim());
  } catch (error) {
    console.error(`Failed to get video duration for ${videoPath}:`, error);
    throw error;
  }
}

/**
 * Process a single clip edit with caching support
 */
async function processClipEdit(
  clip: TimelineClip,
  outputDir: string
): Promise<string> {
  // Guard: Only process video clips
  if (clip.type !== 'video' || !clip.videoLocalPath) {
    console.error(`[Editor] Invalid clip:`, {
      clipId: clip.id,
      type: clip.type,
      hasVideoLocalPath: !!clip.videoLocalPath,
      videoLocalPath: clip.videoLocalPath,
    });
    throw new Error(`Cannot process non-video clip: ${clip.id} (type: ${clip.type}, hasPath: ${!!clip.videoLocalPath})`);
  }

  const outputPath = path.join(outputDir, `clip-${clip.id}.mp4`);
  const clipHash = generateClipHash(clip);
  const cacheKey = `${clip.id}`;

  // Check cache for existing processed clip
  const cached = clipEditCache.get(cacheKey);
  if (cached && cached.hash === clipHash) {
    // Verify the cached file still exists
    try {
      await fs.access(cached.outputPath);
      console.log(`[Editor] Using cached clip: ${clip.id}`);
      return cached.outputPath;
    } catch {
      // Cache entry invalid, file doesn't exist
      clipEditCache.delete(cacheKey);
    }
  }

  // Verify input file exists before processing
  try {
    await fs.access(clip.videoLocalPath);
  } catch (error) {
    console.error(`[Editor] Input video file does not exist:`, {
      clipId: clip.id,
      videoLocalPath: clip.videoLocalPath,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(`Input video file does not exist: ${clip.videoLocalPath}`);
  }

  // Process the clip
  if (clip.trimStart !== undefined || clip.trimEnd !== undefined) {
    const startTime = clip.trimStart || 0;
    const endTime = clip.trimEnd || clip.sourceDuration;

    console.log(`[Editor] Processing clip with trim: ${clip.id} (${startTime}s - ${endTime}s) from ${clip.videoLocalPath}`);
    await cropVideo(clip.videoLocalPath, outputPath, startTime, endTime);
  } else {
    // No trimming needed, just copy the file
    console.log(`[Editor] Copying clip (no trim): ${clip.id} from ${clip.videoLocalPath}`);
    await fs.copyFile(clip.videoLocalPath, outputPath);
  }

  // Update cache
  clipEditCache.set(cacheKey, {
    hash: clipHash,
    outputPath,
    timestamp: Date.now(),
  });

  return outputPath;
}

/**
 * Apply timeline clip edits and generate edited video files
 * This creates new video files based on the clip edits (trim/crop)
 * Uses caching and parallel processing for better performance
 */
export async function applyClipEdits(
  clips: TimelineClip[],
  projectId: string
): Promise<string[]> {
  const outputDir = path.join('/tmp', 'projects', projectId, 'timeline-edits');
  await fs.mkdir(outputDir, { recursive: true });

  console.log(`[Editor] Processing ${clips.length} clips in parallel...`);

  // Process all clips in parallel for better performance
  const editedVideoPaths = await Promise.all(
    clips.map(clip => processClipEdit(clip, outputDir))
  );

  console.log(`[Editor] All clips processed successfully`);

  return editedVideoPaths;
}

/**
 * Clear the clip edit cache (useful for cleanup or testing)
 */
export function clearClipEditCache(): void {
  clipEditCache.clear();
  console.log('[Editor] Clip edit cache cleared');
}

