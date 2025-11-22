/**
 * Frame Extractor Service for Face Swap Pipeline
 * Extracts frames from video files using ffmpeg
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { FrameMetadata } from '@/lib/types/face-swap-pipeline';

const execAsync = promisify(exec);

interface VideoInfo {
  duration: number; // in seconds
  width: number;
  height: number;
  fps: number;
  codec: string;
}

/**
 * Get video information using ffprobe
 */
async function getVideoInfo(videoPath: string): Promise<VideoInfo> {
  try {
    // Get video metadata using ffprobe
    const command = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,codec_name -show_entries format=duration -of json "${videoPath}"`;
    const { stdout } = await execAsync(command);
    const metadata = JSON.parse(stdout);

    const stream = metadata.streams?.[0];
    const format = metadata.format;

    if (!stream || !format) {
      throw new Error('Invalid video metadata');
    }

    // Parse frame rate (e.g., "30/1" -> 30)
    const frameRate = stream.r_frame_rate?.split('/');
    const fps = frameRate ? parseFloat(frameRate[0]) / parseFloat(frameRate[1]) : 30;

    return {
      duration: parseFloat(format.duration) || 0,
      width: stream.width || 0,
      height: stream.height || 0,
      fps,
      codec: stream.codec_name || 'unknown',
    };
  } catch (error: any) {
    throw new Error(`Failed to get video info: ${error.message}`);
  }
}

/**
 * Extract frames from video
 * @param videoPath - Path to video file
 * @param projectId - Project ID for organizing frames
 * @param options - Extraction options
 * @returns Array of frame metadata
 */
export async function extractFrames(
  videoPath: string,
  projectId: string,
  options: {
    frameRate?: number; // Extract every Nth frame
    timeInterval?: number; // Extract frame every N seconds
    maxFrames?: number; // Maximum number of frames to extract
  } = {}
): Promise<FrameMetadata[]> {
  const logPrefix = '[FrameExtractor]';
  console.log(`${logPrefix} Starting frame extraction`);
  console.log(`${logPrefix} Video: ${videoPath}`);
  console.log(`${logPrefix} Project ID: ${projectId}`);

  // Validate video file exists
  try {
    await fs.access(videoPath);
  } catch {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  // Get video information
  const videoInfo = await getVideoInfo(videoPath);
  console.log(`${logPrefix} Video info:`, {
    duration: `${videoInfo.duration}s`,
    resolution: `${videoInfo.width}x${videoInfo.height}`,
    fps: videoInfo.fps,
    codec: videoInfo.codec,
  });

  // Create output directory
  const outputDir = path.join(process.cwd(), 'tmp', 'face-swap-pipeline', projectId, 'frames');
  await fs.mkdir(outputDir, { recursive: true });
  console.log(`${logPrefix} Output directory: ${outputDir}`);

  // Determine extraction strategy
  let frameTimestamps: number[] = [];
  const { frameRate, timeInterval, maxFrames } = options;

  if (timeInterval) {
    // Extract by time interval
    for (let t = 0; t < videoInfo.duration; t += timeInterval) {
      frameTimestamps.push(Math.min(t, videoInfo.duration - 0.1));
    }
  } else if (frameRate) {
    // Extract every Nth frame
    const frameInterval = 1 / videoInfo.fps * frameRate; // Time between frames
    for (let t = 0; t < videoInfo.duration; t += frameInterval) {
      frameTimestamps.push(Math.min(t, videoInfo.duration - 0.1));
    }
  } else {
    // Default: extract every second
    for (let t = 0; t < videoInfo.duration; t += 1) {
      frameTimestamps.push(Math.min(t, videoInfo.duration - 0.1));
    }
  }

  // Limit to maxFrames if specified
  if (maxFrames && frameTimestamps.length > maxFrames) {
    // Evenly sample frames
    const step = Math.floor(frameTimestamps.length / maxFrames);
    frameTimestamps = frameTimestamps.filter((_, i) => i % step === 0).slice(0, maxFrames);
  }

  console.log(`${logPrefix} Extracting ${frameTimestamps.length} frames`);

  // Extract frames
  const frames: FrameMetadata[] = [];
  for (let i = 0; i < frameTimestamps.length; i++) {
    const timestamp = frameTimestamps[i];
    const frameNumber = i + 1;
    const framePath = path.join(outputDir, `frame_${frameNumber.toString().padStart(6, '0')}.png`);

    try {
      // Extract frame at specific timestamp
      // -ss: seek to timestamp (before -i for faster seeking)
      // -vframes 1: extract only 1 frame
      // -q:v 2: high quality (1-31, lower is better)
      const command = `ffmpeg -ss ${timestamp} -i "${videoPath}" -vframes 1 -q:v 2 -y "${framePath}"`;
      await execAsync(command);

      // Verify frame was created
      await fs.access(framePath);

      frames.push({
        frameNumber,
        timestamp,
        path: framePath,
      });

      if ((i + 1) % 10 === 0) {
        console.log(`${logPrefix} Extracted ${i + 1}/${frameTimestamps.length} frames`);
      }
    } catch (error: any) {
      console.error(`${logPrefix} Failed to extract frame ${frameNumber} at ${timestamp}s:`, error.message);
      // Continue with other frames
    }
  }

  console.log(`${logPrefix} ✓ Successfully extracted ${frames.length} frames`);
  return frames;
}

/**
 * Get video information without extracting frames
 */
export async function getVideoMetadata(videoPath: string): Promise<VideoInfo> {
  return getVideoInfo(videoPath);
}

