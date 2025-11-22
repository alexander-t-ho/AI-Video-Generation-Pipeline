/**
 * Key Frame Detector Service
 * Auto-detects key frames (scene changes, motion, important moments)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { FrameMetadata } from '@/lib/types/face-swap-pipeline';

const execAsync = promisify(exec);

interface FrameDifference {
  frameNumber: number;
  difference: number; // 0-1, higher = more different
}

/**
 * Calculate frame differences using FFmpeg's scene detection
 * @param videoPath - Path to video file
 * @param frameMetadata - Array of extracted frames
 * @returns Array of frame numbers that are key frames
 */
export async function detectKeyFrames(
  videoPath: string,
  frameMetadata: FrameMetadata[],
  options: {
    sceneChangeThreshold?: number; // 0-1, lower = more sensitive
    minFramesBetweenScenes?: number; // Minimum frames between scene changes
  } = {}
): Promise<number[]> {
  const logPrefix = '[KeyFrameDetector]';
  console.log(`${logPrefix} Detecting key frames`);
  console.log(`${logPrefix} Total frames: ${frameMetadata.length}`);

  const { sceneChangeThreshold = 0.3, minFramesBetweenScenes = 5 } = options;

  // Use FFmpeg's scene detection filter
  // This analyzes frame differences to detect scene changes
  const tempOutput = path.join(process.cwd(), 'tmp', 'face-swap-pipeline', 'scene-detect.txt');

  try {
    // FFmpeg scene detection command
    // -vf "select='gt(scene,0.3)',showinfo" -f null - outputs scene change info
    // We'll parse the output to find scene change frames
    const command = `ffmpeg -i "${videoPath}" -vf "select='gt(scene,${sceneChangeThreshold})',showinfo" -f null - 2>&1 | grep "n:" | awk '{print $5}' | cut -d: -f2`;
    
    const { stdout } = await execAsync(command);
    const sceneChangeFrames = stdout
      .trim()
      .split('\n')
      .filter(line => line.trim())
      .map(line => parseInt(line.trim(), 10))
      .filter(num => !isNaN(num) && num > 0);

    console.log(`${logPrefix} Found ${sceneChangeFrames.length} scene changes`);

    // Map scene change frame numbers to our frame metadata
    // Since FFmpeg frame numbers might not match our extracted frames exactly,
    // we'll find the closest extracted frame to each scene change
    const keyFrameNumbers: number[] = [];
    const processedIndices = new Set<number>();

    for (const sceneFrame of sceneChangeFrames) {
      // Find the closest extracted frame to this scene change
      let closestFrame: FrameMetadata | null = null;
      let closestIndex = -1;
      let minDistance = Infinity;

      for (let i = 0; i < frameMetadata.length; i++) {
        if (processedIndices.has(i)) continue;

        // Estimate frame number based on timestamp
        // Assuming 30 fps for estimation (will be adjusted based on actual video)
        const estimatedFrameNum = Math.round(frameMetadata[i].timestamp * 30);
        const distance = Math.abs(estimatedFrameNum - sceneFrame);

        if (distance < minDistance) {
          minDistance = distance;
          closestFrame = frameMetadata[i];
          closestIndex = i;
        }
      }

      // Only add if we haven't already processed a frame near this one
      if (closestFrame && minDistance < 30 && !processedIndices.has(closestIndex)) {
        // Check minimum distance from previously selected key frames
        const tooClose = keyFrameNumbers.some(
          kf => Math.abs(kf - closestFrame!.frameNumber) < minFramesBetweenScenes
        );

        if (!tooClose) {
          keyFrameNumbers.push(closestFrame.frameNumber);
          processedIndices.add(closestIndex);
        }
      }
    }

    // Always include first and last frames as key frames
    if (frameMetadata.length > 0) {
      if (!keyFrameNumbers.includes(1)) {
        keyFrameNumbers.unshift(1);
      }
      const lastFrameNum = frameMetadata[frameMetadata.length - 1].frameNumber;
      if (!keyFrameNumbers.includes(lastFrameNum)) {
        keyFrameNumbers.push(lastFrameNum);
      }
    }

    // Sort key frame numbers
    keyFrameNumbers.sort((a, b) => a - b);

    console.log(`${logPrefix} ✓ Detected ${keyFrameNumbers.length} key frames:`, keyFrameNumbers);
    return keyFrameNumbers;
  } catch (error: any) {
    console.error(`${logPrefix} Scene detection failed:`, error.message);
    // Fallback: return first, middle, and last frames
    console.log(`${logPrefix} Using fallback: first, middle, last frames`);
    if (frameMetadata.length === 0) return [];
    if (frameMetadata.length === 1) return [1];
    
    const first = 1;
    const middle = Math.ceil(frameMetadata.length / 2);
    const last = frameMetadata[frameMetadata.length - 1].frameNumber;
    return [first, middle, last];
  }
}

/**
 * Simple key frame detection based on frame differences
 * Alternative method using frame comparison
 */
export async function detectKeyFramesByDifference(
  frameMetadata: FrameMetadata[],
  options: {
    differenceThreshold?: number;
    minFramesBetweenScenes?: number;
  } = {}
): Promise<number[]> {
  const logPrefix = '[KeyFrameDetector]';
  const { differenceThreshold = 0.15, minFramesBetweenScenes = 5 } = options;

  if (frameMetadata.length < 2) {
    return frameMetadata.length > 0 ? [1] : [];
  }

  // For now, use a simple strategy: evenly sample frames
  // In a full implementation, we'd compare frames using image similarity
  const keyFrameNumbers: number[] = [];
  const step = Math.max(1, Math.floor(frameMetadata.length / 10)); // ~10 key frames

  for (let i = 0; i < frameMetadata.length; i += step) {
    keyFrameNumbers.push(frameMetadata[i].frameNumber);
  }

  // Always include last frame
  const lastFrameNum = frameMetadata[frameMetadata.length - 1].frameNumber;
  if (!keyFrameNumbers.includes(lastFrameNum)) {
    keyFrameNumbers.push(lastFrameNum);
  }

  console.log(`${logPrefix} ✓ Detected ${keyFrameNumbers.length} key frames (evenly sampled)`);
  return keyFrameNumbers.sort((a, b) => a - b);
}

