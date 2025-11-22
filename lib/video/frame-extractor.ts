/**
 * Frame Extractor - FFmpeg Integration
 *
 * This module handles extracting seed frames from video files using FFmpeg.
 * Extracts the last frame of a video for use as seed frame in the next scene's generation.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { SeedFrame } from '../types';
import { getStorageService } from '@/lib/storage/storage-service';

const execAsync = promisify(exec);

// ============================================================================
// Constants
// ============================================================================

const FRAME_COUNT = 1;
const FRAME_QUALITY = 2; // High quality (1-31, lower is better)
const MAX_RETRIES = 1;
const FRAME_TIMESTAMPS = [0.0]; // Last frame (0.0 seconds from end)

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

    if (!duration || duration <= 0) {
      throw new Error(`Video duration (${duration}s) is invalid`);
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
 * Extract frames from video using FFmpeg at specific timestamps
 */
async function extractFramesWithFFmpeg(
  videoPath: string,
  outputDir: string,
  videoDuration: number,
  frameTimestamps: number[]
): Promise<string[]> {
  const framePaths: string[] = [];

  // Create output directory if it doesn't exist
  await fs.mkdir(outputDir, { recursive: true });

  // Extract frames at specific timestamps (relative to end of video)
  // Each timestamp is relative to the end (e.g., 0.1 means 0.1s before the end)
  // We need to calculate the absolute timestamp for each frame
  for (let i = 0; i < frameTimestamps.length; i++) {
    const relativeTimestamp = frameTimestamps[i];
    // Calculate absolute timestamp: duration - relativeTimestamp
    // e.g., if video is 3s long and relativeTimestamp is 0.1, extract at 2.9s
    const absoluteTimestamp = Math.max(0, videoDuration - relativeTimestamp);
    const framePath = path.join(outputDir, `frame_${i + 1}.png`);
    
    // Extract single frame at specific timestamp
    // Use output seeking (-ss after -i) for more accurate frame extraction
    // Input seeking (-ss before -i) is faster but less accurate
    // Output seeking is slower but ensures we get the exact frame at the timestamp
    // -i: input file
    // -ss: seek to specific time (output seeking for accuracy)
    // -vframes 1: extract only 1 frame
    // -q:v: quality (2 = high quality)
    // -y: overwrite output file
    const command = `ffmpeg -i "${videoPath}" -ss ${absoluteTimestamp} -vframes 1 -q:v ${FRAME_QUALITY} -y "${framePath}"`;

    try {
      await execAsync(command);
      
      // Verify frame was created
      try {
        await fs.access(framePath);
        framePaths.push(framePath);
      } catch {
        throw new Error(`Frame ${i + 1} was not created at ${framePath}`);
      }
    } catch (error: any) {
      // Clean up any partial frames
      for (const createdPath of framePaths) {
        try {
          await fs.unlink(createdPath);
        } catch {
          // Ignore cleanup errors
        }
      }
      throw new Error(`FFmpeg frame extraction failed at timestamp ${relativeTimestamp}s: ${error.message}`);
    }
  }

  return framePaths;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Extract the last frame from a video
 *
 * @param videoPath - Path to the input video file
 * @param projectId - Project ID for organizing output files
 * @param sceneIndex - Scene index for organizing output files
 * @returns Array containing a single SeedFrame object with the last frame
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

  // Create output directory
  const outputDir = path.join('/tmp', 'projects', projectId, 'frames', `scene-${sceneIndex}`);
  await fs.mkdir(outputDir, { recursive: true });

  // Extract the last frame from the video
  // FRAME_TIMESTAMPS contains [0.0] which means extract the very last frame
  console.log(`[FrameExtractor] Extracting last frame from video: ${videoPath}`);
  console.log(`[FrameExtractor] Video duration: ${videoInfo.duration}s`);
  console.log(`[FrameExtractor] Scene index: ${sceneIndex}`);
  console.log(`[FrameExtractor] Frame timestamp (relative to end): ${FRAME_TIMESTAMPS[0]}s`);
  
  // Calculate and log absolute timestamps for verification
  const absoluteTimestamps = FRAME_TIMESTAMPS.map(ts => Math.max(0, videoInfo.duration - ts));
  console.log(`[FrameExtractor] Absolute timestamps: ${absoluteTimestamps.map(ts => ts.toFixed(2)).join(', ')}s`);
  
  // Verify all timestamps are within video duration
  const invalidTimestamps = absoluteTimestamps.filter(ts => ts >= videoInfo.duration);
  if (invalidTimestamps.length > 0) {
    throw new Error(`Cannot extract frames: Some timestamps (${invalidTimestamps.join(', ')}) are beyond video duration (${videoInfo.duration}s)`);
  }
  
  // Verify we're extracting from the last frame
  const latestTimestamp = Math.max(...absoluteTimestamps);
  if (Math.abs(latestTimestamp - videoInfo.duration) > 0.1) {
    console.warn(`[FrameExtractor] Warning: Latest timestamp (${latestTimestamp.toFixed(2)}s) doesn't match video end (${videoInfo.duration.toFixed(2)}s)`);
  }
  
  let framePaths: string[] = [];
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      framePaths = await extractFramesWithFFmpeg(
        videoPath,
        outputDir,
        videoInfo.duration,
        FRAME_TIMESTAMPS
      );
      console.log(`[FrameExtractor] Successfully extracted ${framePaths.length} frames`);
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

  // Verify we got exactly 1 frame
  if (framePaths.length !== FRAME_COUNT) {
    // Clean up partial frames
    for (const framePath of framePaths) {
      try {
        await fs.unlink(framePath);
      } catch {
        // Ignore cleanup errors
      }
    }
    throw new Error(`Expected ${FRAME_COUNT} frame, got ${framePaths.length}`);
  }

  // Upload frames to S3 and create SeedFrame objects
  const storageService = getStorageService();
  const seedFrames: SeedFrame[] = [];

  for (let index = 0; index < framePaths.length; index++) {
    const framePath = framePaths[index];
    const frameId = uuidv4();

    try {
      // Upload to S3
      const storedFile = await storageService.storeFromLocalPath(framePath, {
        projectId,
        sceneId: `scene-${sceneIndex}`,
        category: 'frames',
        mimeType: 'image/png',
        customFilename: `frame_${index + 1}.png`,
      }, {
        keepLocal: true, // Keep local for potential FFmpeg operations
        deleteSource: false,
      });

      seedFrames.push({
        id: frameId,
        url: storedFile.url, // S3 URL
        localPath: storedFile.localPath,
        s3Key: storedFile.s3Key,
        timestamp: FRAME_TIMESTAMPS[index],
      });

      console.log(`[FrameExtractor] Frame ${index + 1} uploaded to S3: ${storedFile.s3Key}`);
    } catch (error) {
      console.error(`[FrameExtractor] Failed to upload frame ${index + 1}:`, error);
      // Fall back to local path
      seedFrames.push({
        id: frameId,
        url: framePath,
        localPath: framePath,
        timestamp: FRAME_TIMESTAMPS[index],
      });
    }
  }

  console.log(`[FrameExtractor] Completed extracting and uploading ${seedFrames.length} frames`);
  return seedFrames;
}

// ============================================================================
// Export
// ============================================================================

export default {
  extractFrames,
};

