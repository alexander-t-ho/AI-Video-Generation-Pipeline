/**
 * Frame Extractor - FFmpeg Integration
 * 
 * This module handles extracting seed frames from video files using FFmpeg.
 * Extracts 5 frames from the last 0.5 seconds of a video for use as seed frames
 * in the next scene's video generation.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { SeedFrame } from '../types';

const execAsync = promisify(exec);

// ============================================================================
// Constants
// ============================================================================

const FRAME_COUNT = 5;
const FRAME_DURATION = 0.5; // seconds from end
const FRAME_QUALITY = 2; // High quality (1-31, lower is better)
const MAX_RETRIES = 1;
const FRAME_TIMESTAMPS = [0.1, 0.2, 0.3, 0.4, 0.5]; // seconds from end

// ============================================================================
// Types
// ============================================================================

interface VideoInfo {
  duration: number; // in seconds
  width: number;
  height: number;
  codec: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get video duration and metadata using ffprobe
 */
async function getVideoInfo(videoPath: string): Promise<VideoInfo> {
  try {
    const command = `ffprobe -v error -show_entries format=duration:stream=width,height,codec_name -of json "${videoPath}"`;
    const { stdout } = await execAsync(command);
    const info = JSON.parse(stdout);

    const format = info.format || {};
    const stream = info.streams?.[0] || {};

    const duration = parseFloat(format.duration || '0');
    const width = parseInt(stream.width || '0', 10);
    const height = parseInt(stream.height || '0', 10);
    const codec = stream.codec_name || 'unknown';

    if (!duration || duration < FRAME_DURATION) {
      throw new Error(`Video duration (${duration}s) is less than required frame extraction duration (${FRAME_DURATION}s)`);
    }

    return { duration, width, height, codec };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`Video file not found: ${videoPath}`);
    }
    throw new Error(`Failed to get video info: ${error.message}`);
  }
}

/**
 * Extract frames from video using FFmpeg
 */
async function extractFramesWithFFmpeg(
  videoPath: string,
  outputDir: string,
  startTime: number,
  frameCount: number
): Promise<string[]> {
  const framePaths: string[] = [];

  // Create output directory if it doesn't exist
  await fs.mkdir(outputDir, { recursive: true });

  // Extract frames using FFmpeg
  // -ss: seek to start time
  // -vframes: number of frames to extract
  // -q:v: quality (2 = high quality)
  // -y: overwrite output files
  const outputPattern = path.join(outputDir, 'frame_%d.png');
  const command = `ffmpeg -ss ${startTime} -i "${videoPath}" -vframes ${frameCount} -q:v ${FRAME_QUALITY} -y "${outputPattern}"`;

  try {
    await execAsync(command);
    
    // Verify frames were created
    for (let i = 1; i <= frameCount; i++) {
      const framePath = path.join(outputDir, `frame_${i}.png`);
      try {
        await fs.access(framePath);
        framePaths.push(framePath);
      } catch {
        throw new Error(`Frame ${i} was not created at ${framePath}`);
      }
    }

    return framePaths;
  } catch (error: any) {
    // Clean up any partial frames
    for (const framePath of framePaths) {
      try {
        await fs.unlink(framePath);
      } catch {
        // Ignore cleanup errors
      }
    }
    throw new Error(`FFmpeg frame extraction failed: ${error.message}`);
  }
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Extract 5 frames from the last 0.5 seconds of a video
 * 
 * @param videoPath - Path to the input video file
 * @param projectId - Project ID for organizing output files
 * @param sceneIndex - Scene index for organizing output files
 * @returns Array of SeedFrame objects with frame paths and timestamps
 * 
 * @throws Error if video file doesn't exist, is invalid, or extraction fails
 */
export async function extractFrames(
  videoPath: string,
  projectId: string,
  sceneIndex: number
): Promise<SeedFrame[]> {
  // Validate input
  if (!videoPath) {
    throw new Error('Video path is required');
  }

  if (!projectId) {
    throw new Error('Project ID is required');
  }

  // Check if video file exists
  try {
    await fs.access(videoPath);
  } catch {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  // Get video information
  let videoInfo: VideoInfo;
  try {
    videoInfo = await getVideoInfo(videoPath);
  } catch (error: any) {
    throw new Error(`Failed to get video info: ${error.message}`);
  }

  // Calculate start time (last 0.5 seconds)
  const startTime = Math.max(0, videoInfo.duration - FRAME_DURATION);

  // Create output directory
  const outputDir = path.join('/tmp', 'projects', projectId, 'frames', `scene-${sceneIndex}`);
  await fs.mkdir(outputDir, { recursive: true });

  // Extract frames with retry logic
  let framePaths: string[] = [];
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      framePaths = await extractFramesWithFFmpeg(
        videoPath,
        outputDir,
        startTime,
        FRAME_COUNT
      );
      break; // Success
    } catch (error: any) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        console.warn(`[FrameExtractor] Frame extraction attempt ${attempt + 1} failed, retrying...`);
        // Wait a bit before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  if (framePaths.length === 0) {
    throw lastError || new Error('Frame extraction failed after retries');
  }

  // Verify we got exactly 5 frames
  if (framePaths.length !== FRAME_COUNT) {
    // Clean up partial frames
    for (const framePath of framePaths) {
      try {
        await fs.unlink(framePath);
      } catch {
        // Ignore cleanup errors
      }
    }
    throw new Error(`Expected ${FRAME_COUNT} frames, got ${framePaths.length}`);
  }

  // Create SeedFrame objects
  const seedFrames: SeedFrame[] = framePaths.map((framePath, index) => ({
    id: uuidv4(),
    url: framePath,
    timestamp: FRAME_TIMESTAMPS[index],
  }));

  return seedFrames;
}

// ============================================================================
// Export
// ============================================================================

export default {
  extractFrames,
};

