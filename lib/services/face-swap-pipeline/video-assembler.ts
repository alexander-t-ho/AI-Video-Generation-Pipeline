/**
 * Video Assembler Service
 * Reassembles processed frames into video using ffmpeg
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import http from 'http';

const execAsync = promisify(exec);

const logPrefix = '[VideoAssembler]';

/**
 * Check if a path is a URL
 */
function isUrl(pathOrUrl: string): boolean {
  return pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://');
}

/**
 * Download a file from URL to local path
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https://') ? https : http;
    const file = require('fs').createWriteStream(destPath);

    protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`Failed to download ${url}: HTTP ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      reject(err);
    });
  });
}

interface VideoMetadata {
  duration: number;
  fps: number;
  width: number;
  height: number;
  audioPath?: string;
}

/**
 * Reassemble frames into video
 * @param framePaths - Array of frame file paths (in order)
 * @param outputPath - Output video path
 * @param metadata - Original video metadata
 * @param frameTimestamps - Optional array of timestamps for each frame (for duration calculation)
 * @returns Path to assembled video
 */
export async function assembleVideo(
  framePaths: string[],
  outputPath: string,
  metadata: VideoMetadata,
  frameTimestamps?: number[]
): Promise<string> {
  console.log(`${logPrefix} Assembling video from ${framePaths.length} frames`);
  console.log(`${logPrefix} Output: ${outputPath}`);
  console.log(`${logPrefix} FPS: ${metadata.fps}`);
  console.log(`${logPrefix} Resolution: ${metadata.width}x${metadata.height}`);

  if (framePaths.length === 0) {
    throw new Error('No frames provided for video assembly');
  }

  // Create output directory
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });

  // Create temp directory for downloaded frames
  const tempFramesDir = path.join(outputDir, 'temp-frames');
  await fs.mkdir(tempFramesDir, { recursive: true });

  // Process frames - download URLs to local files if needed
  const localFramePaths: string[] = [];
  let hasUrls = false;

  for (let i = 0; i < framePaths.length; i++) {
    const framePath = framePaths[i];

    if (isUrl(framePath)) {
      hasUrls = true;
      // Download URL to local file
      const ext = path.extname(new URL(framePath).pathname) || '.png';
      const localPath = path.join(tempFramesDir, `frame_${i.toString().padStart(6, '0')}${ext}`);

      try {
        console.log(`${logPrefix} Downloading frame ${i + 1}/${framePaths.length}...`);
        await downloadFile(framePath, localPath);
        await fs.access(localPath);
        localFramePaths.push(localPath);
      } catch (error: any) {
        throw new Error(`Failed to download frame ${i + 1}: ${error.message}`);
      }
    } else {
      // Verify local file exists
      try {
        await fs.access(framePath);
        localFramePaths.push(framePath);
      } catch {
        throw new Error(`Frame not found: ${framePath}`);
      }
    }
  }

  if (hasUrls) {
    console.log(`${logPrefix} ✓ Downloaded ${framePaths.length} frames to local storage`);
  }

  // Calculate frame duration
  // If we have timestamps, calculate average interval between frames
  // Otherwise, assume frames should be displayed at the original video's frame rate
  let frameDuration: number;
  if (frameTimestamps && frameTimestamps.length > 1) {
    // Calculate average interval between consecutive frames
    const intervals: number[] = [];
    for (let i = 1; i < frameTimestamps.length; i++) {
      intervals.push(frameTimestamps[i] - frameTimestamps[i - 1]);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    frameDuration = avgInterval;
    console.log(`${logPrefix} Calculated frame duration from timestamps: ${frameDuration.toFixed(3)}s per frame`);
  } else {
    // Default: each frame displayed for 1/fps seconds (original frame rate)
    frameDuration = 1 / metadata.fps;
    console.log(`${logPrefix} Using default frame duration: ${frameDuration.toFixed(3)}s per frame`);
  }

  // Calculate total output duration
  const totalDuration = localFramePaths.length * frameDuration;
  console.log(`${logPrefix} Total output duration: ${totalDuration.toFixed(2)}s`);

  // Create a temporary file list for ffmpeg
  // For image sequences with concat demuxer, we need to specify duration
  const fileListPath = path.join(outputDir, 'frame-list.txt');
  let fileListContent = '';

  // Build file list with duration information for each frame (using local paths)
  for (const localPath of localFramePaths) {
    fileListContent += `file '${localPath.replace(/'/g, "'\\''")}'\n`;
    fileListContent += `duration ${frameDuration}\n`;
  }

  // Repeat last frame to ensure proper duration (ffmpeg concat quirk)
  if (localFramePaths.length > 0) {
    fileListContent += `file '${localFramePaths[localFramePaths.length - 1].replace(/'/g, "'\\''")}'\n`;
  }

  await fs.writeFile(fileListPath, fileListContent);

  try {
    // Assemble video using ffmpeg concat demuxer
    // -f concat: use concat demuxer (reads timing from 'duration' directives in file list)
    // -safe 0: allow unsafe file names
    // -r: set output framerate (how fast to display them)
    // -t: limit output duration to calculated total
    // -pix_fmt yuv420p: ensure compatibility
    // -c:v libx264: use H.264 codec
    // -preset medium: encoding speed/quality balance
    // -crf 23: quality (lower = better, 18-28 is good range)
    // Note: -framerate is NOT used with concat demuxer - timing comes from 'duration' in file list
    let command = `ffmpeg -f concat -safe 0 -i "${fileListPath}" -r ${metadata.fps} -t ${totalDuration} -pix_fmt yuv420p -c:v libx264 -preset medium -crf 23 -y "${outputPath}"`;

    // Add audio if provided
    if (metadata.audioPath) {
      try {
        await fs.access(metadata.audioPath);
        // Use -shortest to match video duration, or trim audio to match
        command = `ffmpeg -f concat -safe 0 -i "${fileListPath}" -i "${metadata.audioPath}" -r ${metadata.fps} -t ${totalDuration} -pix_fmt yuv420p -c:v libx264 -preset medium -crf 23 -c:a aac -shortest -y "${outputPath}"`;
        console.log(`${logPrefix} Including audio track`);
      } catch {
        console.warn(`${logPrefix} Audio file not found, proceeding without audio`);
      }
    }

    console.log(`${logPrefix} Running ffmpeg...`);
    console.log(`${logPrefix} Command: ${command.substring(0, 200)}...`);
    await execAsync(command);

    // Verify output was created
    await fs.access(outputPath);
    const stats = await fs.stat(outputPath);
    console.log(`${logPrefix} ✓ Video assembled: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

    return outputPath;
  } catch (error: any) {
    console.error(`${logPrefix} ✗ Video assembly failed:`, error.message);
    throw new Error(`Video assembly failed: ${error.message}`);
  } finally {
    // Clean up file list
    try {
      await fs.unlink(fileListPath);
    } catch {
      // Ignore cleanup errors
    }

    // Clean up downloaded frames if any
    if (hasUrls) {
      try {
        await fs.rm(tempFramesDir, { recursive: true, force: true });
        console.log(`${logPrefix} Cleaned up temp frames directory`);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Extract audio track from original video
 * @param videoPath - Path to original video
 * @param outputPath - Path to save audio file
 * @returns Path to extracted audio
 */
export async function extractAudio(
  videoPath: string,
  outputPath: string
): Promise<string> {
  console.log(`${logPrefix} Extracting audio from: ${videoPath}`);

  try {
    await fs.access(videoPath);
  } catch {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  // Create output directory
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });

  // Extract audio using ffmpeg
  // -i: input video
  // -vn: no video
  // -acodec copy: copy audio codec (faster) or -acodec aac for re-encoding
  const command = `ffmpeg -i "${videoPath}" -vn -acodec aac -y "${outputPath}"`;

  try {
    await execAsync(command);
    await fs.access(outputPath);
    console.log(`${logPrefix} ✓ Audio extracted: ${outputPath}`);
    return outputPath;
  } catch (error: any) {
    console.error(`${logPrefix} ✗ Audio extraction failed:`, error.message);
    throw new Error(`Audio extraction failed: ${error.message}`);
  }
}

