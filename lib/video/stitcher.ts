/**
 * Video Stitcher - FFmpeg Integration
 * 
 * This module handles concatenating multiple video clips into a single MP4 file.
 * Uses FFmpeg's concat demuxer for fast concatenation without re-encoding.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

// ============================================================================
// Constants
// ============================================================================

const CONCAT_FILE_NAME = 'concat.txt';
const OUTPUT_FILENAME = 'output.mp4';

// ============================================================================
// Types
// ============================================================================

interface VideoInfo {
  duration: number;
  codec: string;
  width: number;
  height: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get video codec and resolution information
 */
async function getVideoInfo(videoPath: string): Promise<VideoInfo> {
  try {
    const command = `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height:format=duration -of json "${videoPath}"`;
    const { stdout } = await execAsync(command);
    const info = JSON.parse(stdout);

    const stream = info.streams?.[0] || {};
    const format = info.format || {};

    return {
      codec: stream.codec_name || 'unknown',
      width: parseInt(stream.width || '0', 10),
      height: parseInt(stream.height || '0', 10),
      duration: parseFloat(format.duration || '0'),
    };
  } catch (error: any) {
    throw new Error(`Failed to get video info for ${videoPath}: ${error.message}`);
  }
}

/**
 * Validate all videos have compatible codecs and resolutions
 */
async function validateVideoCompatibility(videoPaths: string[]): Promise<void> {
  if (videoPaths.length === 0) {
    throw new Error('No video files provided');
  }

  const videoInfos: VideoInfo[] = [];

  // Get info for all videos
  for (const videoPath of videoPaths) {
    try {
      await fs.access(videoPath);
      const info = await getVideoInfo(videoPath);
      videoInfos.push(info);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Video file not found: ${videoPath}`);
      }
      throw error;
    }
  }

  // Check codec compatibility
  const firstCodec = videoInfos[0].codec;
  const incompatibleCodecs = videoInfos.filter(info => info.codec !== firstCodec);
  if (incompatibleCodecs.length > 0) {
    console.warn(`[VideoStitcher] Warning: Videos have different codecs. First video: ${firstCodec}, others may need re-encoding.`);
  }

  // Check resolution compatibility
  const firstWidth = videoInfos[0].width;
  const firstHeight = videoInfos[0].height;
  const incompatibleResolutions = videoInfos.filter(
    info => info.width !== firstWidth || info.height !== firstHeight
  );
  if (incompatibleResolutions.length > 0) {
    console.warn(`[VideoStitcher] Warning: Videos have different resolutions. First video: ${firstWidth}x${firstHeight}, others may need resizing.`);
  }
}

/**
 * Create concat file for FFmpeg
 */
async function createConcatFile(videoPaths: string[], concatFilePath: string): Promise<void> {
  const lines: string[] = [];

  for (const videoPath of videoPaths) {
    // Use absolute paths to avoid path resolution issues
    const absolutePath = path.isAbsolute(videoPath) 
      ? videoPath 
      : path.resolve(videoPath);
    
    // Escape single quotes in path for FFmpeg
    const escapedPath = absolutePath.replace(/'/g, "'\\''");
    lines.push(`file '${escapedPath}'`);
  }

  await fs.writeFile(concatFilePath, lines.join('\n') + '\n', 'utf-8');
}

/**
 * Stitch videos using FFmpeg concat demuxer
 */
async function stitchVideosWithFFmpeg(
  concatFilePath: string,
  outputPath: string
): Promise<void> {
  // FFmpeg concat command
  // -f concat: use concat demuxer
  // -safe 0: allow unsafe file paths
  // -c copy: copy streams without re-encoding (fast)
  // -y: overwrite output file
  const command = `ffmpeg -f concat -safe 0 -i "${concatFilePath}" -c copy -y "${outputPath}"`;

  try {
    await execAsync(command);
  } catch (error: any) {
    // If copy fails due to codec incompatibility, try re-encoding
    if (error.message?.includes('codec') || error.message?.includes('incompatible')) {
      console.warn('[VideoStitcher] Copy failed, attempting re-encode...');
      const reencodeCommand = `ffmpeg -f concat -safe 0 -i "${concatFilePath}" -c:v libx264 -c:a aac -y "${outputPath}"`;
      await execAsync(reencodeCommand);
    } else {
      throw new Error(`FFmpeg stitching failed: ${error.message}`);
    }
  }
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Stitch multiple video clips into a single MP4 file
 * 
 * @param videoPaths - Array of paths to video files to stitch (in order)
 * @param projectId - Project ID for organizing output files
 * @returns Path to the stitched output video file
 * 
 * @throws Error if video files don't exist, are invalid, or stitching fails
 */
export async function stitchVideos(
  videoPaths: string[],
  projectId: string
): Promise<string> {
  // Validate input
  if (!videoPaths || videoPaths.length === 0) {
    throw new Error('At least one video file is required');
  }

  if (!projectId) {
    throw new Error('Project ID is required');
  }

  // Validate all video files exist and are compatible
  await validateVideoCompatibility(videoPaths);

  // Create output directory
  const outputDir = path.join('/tmp', 'projects', projectId, 'final');
  await fs.mkdir(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, OUTPUT_FILENAME);

  // Create temporary concat file
  const concatFilePath = path.join(outputDir, CONCAT_FILE_NAME);

  try {
    // Create concat file
    await createConcatFile(videoPaths, concatFilePath);

    // Stitch videos
    await stitchVideosWithFFmpeg(concatFilePath, outputPath);

    // Verify output file was created
    try {
      await fs.access(outputPath);
    } catch {
      throw new Error('Stitched video file was not created');
    }

    // Clean up concat file
    try {
      await fs.unlink(concatFilePath);
    } catch {
      // Ignore cleanup errors
    }

    return outputPath;
  } catch (error: any) {
    // Clean up on error
    try {
      await fs.unlink(concatFilePath);
    } catch {
      // Ignore cleanup errors
    }
    try {
      await fs.unlink(outputPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

// ============================================================================
// Export
// ============================================================================

export default {
  stitchVideos,
};

