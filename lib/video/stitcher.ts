/**
 * Video Stitcher - FFmpeg Integration with Fast Video Stitching
 * 
 * This module handles concatenating multiple video clips into a single MP4 file
 * with simple fade transitions for optimal processing speed.
 * Uses FFmpeg's filter_complex with xfade transitions for clip blending.
 * 
 * OPTIMIZED: Removed motion interpolation and scene analysis for faster stitching.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { getStorageService, type StoredFile } from '@/lib/storage/storage-service';
import type { TextOverlay } from '@/lib/types';

const execAsync = promisify(exec);

// ============================================================================
// Constants
// ============================================================================

const CONCAT_FILE_NAME = 'concat.txt';
const OUTPUT_FILENAME = 'output.mp4';
const DEFAULT_TRANSITION_DURATION = 0.2; // seconds - default fade transition

// DISABLED: Similarity thresholds (no longer used for performance optimization)
// const MIN_TRANSITION_DURATION = 0.15;
// const MAX_TRANSITION_DURATION = 0.3;
// const HIGH_SIMILARITY_THRESHOLD = 0.8;
// const MEDIUM_SIMILARITY_THRESHOLD = 0.5;

// ============================================================================
// Types
// ============================================================================

interface VideoInfo {
  duration: number;
  codec: string;
  width: number;
  height: number;
  hasAudio: boolean; // Whether the video has an audio stream
}

// Valid FFmpeg xfade transition types
// Supported: fade, fadeblack, fadewhite, distance, wipeleft, wiperight, wipeup, wipedown,
//            slideleft, slideright, slideup, slidedown, circlecrop, rectcrop
interface TransitionConfig {
  type: 'fade' | 'fadeblack' | 'fadewhite' | 'distance' | 'wipeleft' | 'wiperight' | 'none';
  duration: number;
}

interface TransitionOffset {
  videoIndex: number;
  startOffset: number; // Where to start trimming this video
  endOffset: number; // Where to end trimming this video
  transitionStart: number; // When transition starts in final timeline
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get video codec and resolution information, including audio stream detection
 */
async function getVideoInfo(videoPath: string): Promise<VideoInfo> {
  try {
    // Get video stream info
    const videoCommand = `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height:format=duration -of json "${videoPath}"`;
    const { stdout: videoStdout } = await execAsync(videoCommand);
    const videoInfo = JSON.parse(videoStdout);

    const stream = videoInfo.streams?.[0] || {};
    const format = videoInfo.format || {};

    // Check if audio stream exists
    let hasAudio = false;
    try {
      const audioCommand = `ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of json "${videoPath}"`;
      const { stdout: audioStdout } = await execAsync(audioCommand);
      const audioInfo = JSON.parse(audioStdout);
      hasAudio = !!(audioInfo.streams && audioInfo.streams.length > 0);
    } catch {
      // No audio stream found, which is fine
      hasAudio = false;
    }

    return {
      codec: stream.codec_name || 'unknown',
      width: parseInt(stream.width || '0', 10),
      height: parseInt(stream.height || '0', 10),
      duration: parseFloat(format.duration || '0'),
      hasAudio,
    };
  } catch (error: any) {
    throw new Error(`Failed to get video info for ${videoPath}: ${error.message}`);
  }
}

/**
 * Get video frame rate
 */
async function getVideoFrameRate(videoPath: string): Promise<number> {
  try {
    const command = `ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of json "${videoPath}"`;
    const { stdout } = await execAsync(command);
    const info = JSON.parse(stdout);
    const frameRate = info.streams?.[0]?.r_frame_rate;
    if (frameRate) {
      const [num, den] = frameRate.split('/').map(Number);
      // Validate numbers to prevent division by zero or NaN
      if (den && den > 0 && !isNaN(num) && !isNaN(den)) {
        return num / den;
      }
    }
    return 30; // Default fallback
  } catch {
    return 30; // Default fallback
  }
}

// Cache for hardware encoder detection to avoid repeated checks
let cachedEncoder: string | null = null;

/**
 * Detect available hardware encoder with fallback to software encoding
 * Result is cached after first detection for performance
 */
async function detectHardwareEncoder(): Promise<string> {
  // Return cached result if available
  if (cachedEncoder) {
    return cachedEncoder;
  }
  
  // Try VideoToolbox (macOS)
  try {
    await execAsync(`ffmpeg -hide_banner -encoders 2>&1 | grep h264_videotoolbox`);
    console.log('[VideoStitcher] Using VideoToolbox hardware acceleration');
    cachedEncoder = 'h264_videotoolbox -b:v 5M';
    return cachedEncoder;
  } catch {}
  
  // Try NVENC (NVIDIA)
  try {
    await execAsync(`ffmpeg -hide_banner -encoders 2>&1 | grep h264_nvenc`);
    console.log('[VideoStitcher] Using NVENC hardware acceleration');
    cachedEncoder = 'h264_nvenc -preset p4 -cq 23';
    return cachedEncoder;
  } catch {}
  
  // Fallback to software encoding
  console.log('[VideoStitcher] Using software encoding (no hardware acceleration available)');
  cachedEncoder = 'libx264 -preset faster -crf 23';
  return cachedEncoder;
}

/**
 * Extract a single frame from a video at a specific timestamp
 */
async function extractFrame(
  videoPath: string,
  timestamp: number,
  outputPath: string
): Promise<void> {
  try {
    // Extract frame at specific timestamp
    // -ss: seek to timestamp
    // -vframes 1: extract only 1 frame
    // -q:v 2: high quality
    const command = `ffmpeg -ss ${timestamp} -i "${videoPath}" -vframes 1 -q:v 2 -y "${outputPath}"`;
    await execAsync(command);
  } catch (error: any) {
    throw new Error(`Failed to extract frame from ${videoPath} at ${timestamp}s: ${error.message}`);
  }
}

// ============================================================================
// DISABLED FOR PERFORMANCE OPTIMIZATION
// The following functions are commented out to speed up video stitching.
// They were used for automatic transition selection based on scene similarity.
// ============================================================================

/**
 * DISABLED: Compare two frames using FFmpeg's SSIM filter
 * Returns similarity score between 0 (completely different) and 1 (identical)
 * 
 * Note: This function is no longer used to improve stitching performance.
 * We now use simple fade transitions instead of analyzing scene similarity.
 */
/*
async function compareFramesWithSSIM(
  frame1Path: string,
  frame2Path: string
): Promise<number> {
  try {
    // Use FFmpeg's ssim filter to compare frames
    // SSIM outputs to stderr in format: "n:1 All:0.xxxxx"
    const command = `ffmpeg -i "${frame1Path}" -i "${frame2Path}" -lavfi "ssim" -f null - 2>&1`;
    
    const { stderr } = await execAsync(command);
    
    // Parse SSIM value from output (format: "n:1 All:0.xxxxx")
    const ssimMatch = stderr.match(/All:([0-9.]+)/);
    
    if (ssimMatch && ssimMatch[1]) {
      const ssimValue = parseFloat(ssimMatch[1]);
      
      // SSIM returns a value between 0 and 1, where 1 is identical
      if (!isNaN(ssimValue) && ssimValue >= 0 && ssimValue <= 1) {
        return ssimValue;
      }
    }
    
    console.warn(`[VideoStitcher] SSIM comparison failed to parse output, defaulting to 0.5 similarity`);
    return 0.5;
  } catch (error: any) {
    console.warn(`[VideoStitcher] SSIM comparison error: ${error.message}, defaulting to 0.5 similarity`);
    return 0.5; // Default to medium similarity on error
  }
}
*/

/**
 * DISABLED: Analyze similarity between two videos by comparing their boundary frames
 * Compares last frame of video1 with first frame of video2
 * 
 * Note: This function is no longer used to improve stitching performance.
 * We now use simple fade transitions instead of analyzing scene similarity.
 */
/*
async function analyzeVideoSimilarity(
  video1Path: string,
  video2Path: string,
  tempDir: string
): Promise<number> {
  try {
    // Get video durations
    const video1Info = await getVideoInfo(video1Path);
    const video2Info = await getVideoInfo(video2Path);
    
    // Extract last frame of video1 (0.1 seconds before end to avoid edge cases)
    const video1LastFrameTime = Math.max(0, video1Info.duration - 0.1);
    const frame1Path = path.join(tempDir, 'frame1_compare.png');
    await extractFrame(video1Path, video1LastFrameTime, frame1Path);
    
    // Extract first frame of video2
    const frame2Path = path.join(tempDir, 'frame2_compare.png');
    await extractFrame(video2Path, 0, frame2Path);
    
    // Compare frames using SSIM
    const similarity = await compareFramesWithSSIM(frame1Path, frame2Path);
    
    // Clean up temporary frames
    try {
      await fs.unlink(frame1Path);
      await fs.unlink(frame2Path);
    } catch {
      // Ignore cleanup errors
    }
    
    return similarity;
  } catch (error: any) {
    console.warn(`[VideoStitcher] Similarity analysis failed: ${error.message}, defaulting to 0.5`);
    return 0.5; // Default to medium similarity on error
  }
}
*/

/**
 * DISABLED: Select appropriate transition type and duration based on similarity score
 * 
 * Note: This function is no longer used to improve stitching performance.
 * We now use simple fade transitions instead of analyzing scene similarity.
 */
/*
function selectTransition(similarity: number): TransitionConfig {
  if (similarity >= HIGH_SIMILARITY_THRESHOLD) {
    // Very similar videos - use subtle fade
    return {
      type: 'fade',
      duration: MIN_TRANSITION_DURATION,
    };
  } else if (similarity >= MEDIUM_SIMILARITY_THRESHOLD) {
    // Moderately similar - use fade (crossfade effect achieved with fade + audio crossfade)
    return {
      type: 'fade',
      duration: DEFAULT_TRANSITION_DURATION,
    };
  } else {
    // Different videos - use distance transition for smooth blending
    // "distance" creates a smooth dissolve-like effect
    return {
      type: 'distance',
      duration: MAX_TRANSITION_DURATION,
    };
  }
}
*/

/**
 * Create a video segment from an image (for logo display)
 * @param imagePath - Path to the logo image
 * @param duration - Duration in seconds for the logo display
 * @param outputPath - Path where the video segment should be saved
 * @param width - Video width (default: 1920)
 * @param height - Video height (default: 1080)
 */
async function createLogoVideoSegment(
  imagePath: string,
  duration: number,
  outputPath: string,
  width: number = 1920,
  height: number = 1080
): Promise<void> {
  try {
    // Create a video from the logo image
    // -loop 1: loop the image
    // -t duration: set duration
    // -vf: scale and pad to maintain aspect ratio on black background
    // -pix_fmt yuv420p: ensure compatibility
    const command = `ffmpeg -loop 1 -i "${imagePath}" -vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black" -c:v libx264 -t ${duration} -pix_fmt yuv420p -r 30 -y "${outputPath}"`;
    await execAsync(command);
    console.log(`[VideoStitcher] Created logo video segment: ${outputPath}`);
  } catch (error: any) {
    throw new Error(`Failed to create logo video segment: ${error.message}`);
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
 * Calculate transition offsets for each video based on durations and transitions
 * For xfade, we don't need to trim videos - xfade handles the overlap automatically
 * We just need to calculate when transitions should occur in the final timeline
 */
function calculateTransitionOffsets(
  videoDurations: number[],
  transitions: TransitionConfig[]
): TransitionOffset[] {
  const offsets: TransitionOffset[] = [];
  let currentTime = 0;

  for (let i = 0; i < videoDurations.length; i++) {
    const duration = videoDurations[i];
    
    // Don't trim videos - use full duration
    // xfade will handle the overlap automatically
    const startOffset = 0;
    const endOffset = duration;

    offsets.push({
      videoIndex: i,
      startOffset,
      endOffset,
      transitionStart: currentTime,
    });

    // Calculate next video start time
    // Each video contributes its full duration, but transitions overlap
    // So total time = sum of durations - sum of transition durations
    if (i < videoDurations.length - 1) {
      // Current video plays fully, then transition overlaps with next video
      currentTime += duration - transitions[i].duration;
    } else {
      // Last video plays fully
      currentTime += duration;
    }
  }

  return offsets;
}

/**
 * Build FFmpeg filter_complex string for video transitions
 * Returns the filter complex string and output labels
 */
async function buildTransitionFilter(
  videoCount: number,
  videoPaths: string[],
  videoDurations: number[],
  transitions: TransitionConfig[],
  offsets: TransitionOffset[],
  hasAudioStreams: boolean[] // Array indicating which videos have audio
): Promise<{ filterComplex: string; videoOutputLabel: string; audioOutputLabel: string | null }> {
  const filters: string[] = [];
  const anyHasAudio = hasAudioStreams.some(has => has);

  // Pre-fetch all video frame rates in parallel for better performance
  console.log('[VideoStitcher] Detecting frame rates for all videos...');
  const videoFrameRates = await Promise.all(
    videoPaths.map(vp => getVideoFrameRate(vp))
  );

  // Step 1: Normalize each video (don't trim - xfade handles overlap)
  // Normalize frame rate to 30fps with conditional interpolation based on source fps
  // Scale to common resolution for xfade compatibility
  // OPTIMIZED: Use fast fps filter for 30fps videos, minterpolate only for other frame rates
  for (let i = 0; i < videoCount; i++) {
    const hasAudio = hasAudioStreams[i];
    const videoDuration = videoDurations[i];

    // Use pre-fetched frame rate
    const videoFps = videoFrameRates[i];
    const fpsFilter = (videoFps >= 28 && videoFps <= 32)
      ? 'fps=30'  // Fast filter for videos already at 30fps
      : 'minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1:scd=none';  // Smooth interpolation for other frame rates

    console.log(
      `[VideoStitcher] Video ${i}: detected ${videoFps.toFixed(2)}fps, using ${(videoFps >= 28 && videoFps <= 32) ? 'fast fps' : 'minterpolate'} filter, full duration ${videoDuration.toFixed(2)}s (no trimming)`
    );

    // Don't trim videos - use full duration
    // xfade will handle the overlap automatically
    // Use conditional fps/minterpolate filter based on source frame rate
    // Use bilinear scaling for faster processing (instead of default bicubic)
    // Scale to 1920x1080 (or maintain aspect ratio)
    // xfade requires inputs to have the same resolution and frame rate
    filters.push(
      `[${i}:v]setpts=PTS-STARTPTS,${fpsFilter},scale=1920:1080:force_original_aspect_ratio=decrease:flags=bilinear,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black[v${i}]`
    );
    
    // Only process audio if this video has an audio stream
    // If no videos have audio, we skip audio processing entirely
    if (anyHasAudio) {
      if (hasAudio) {
        // Use full audio - no trimming
        filters.push(`[${i}:a]asetpts=PTS-STARTPTS,aresample=44100:async=1[a${i}]`);
      } else {
        // Generate silent audio track for videos without audio (to match videos with audio)
        filters.push(`anullsrc=channel_layout=stereo:sample_rate=44100,atrim=0:${videoDuration},asetpts=PTS-STARTPTS[a${i}]`);
      }
    }
  }

  // Step 2: Apply fade effects and prepare for concat
  // Instead of chaining xfade (which has timing issues), use fadein/fadeout + concat
  const fadeFilters: string[] = [];
  const concatVideoLabels: string[] = [];
  const concatAudioLabels: string[] = [];
  
  for (let i = 0; i < videoCount; i++) {
    const hasAudio = hasAudioStreams[i];
    const videoDuration = videoDurations[i];
    const videoLabel = `v${i}`;
    const audioLabel = anyHasAudio ? `a${i}` : null;
    
    // Apply fadeout to all videos except the last
    // Apply fadein to all videos except the first
    // The fade duration should match the transition duration
    let processedVideoLabel = videoLabel;
    let processedAudioLabel = audioLabel;
    
    if (i === 0 && videoCount > 1) {
      // First video: fadeout at the end
      const transition = transitions[0];
      const fadeStart = Math.max(0, videoDuration - transition.duration);
      processedVideoLabel = `vf${i}`;
      fadeFilters.push(
        `[${videoLabel}]fade=t=out:st=${fadeStart}:d=${transition.duration}[${processedVideoLabel}]`
      );
      if (anyHasAudio && audioLabel) {
        processedAudioLabel = `af${i}`;
        fadeFilters.push(
          `[${audioLabel}]afade=t=out:st=${fadeStart}:d=${transition.duration}[${processedAudioLabel}]`
        );
      }
    } else if (i === videoCount - 1 && videoCount > 1) {
      // Last video: fadein at the start
      const transition = transitions[i - 1];
      processedVideoLabel = `vf${i}`;
      fadeFilters.push(
        `[${videoLabel}]fade=t=in:st=0:d=${transition.duration}[${processedVideoLabel}]`
      );
      if (anyHasAudio && audioLabel) {
        processedAudioLabel = `af${i}`;
        fadeFilters.push(
          `[${audioLabel}]afade=t=in:st=0:d=${transition.duration}[${processedAudioLabel}]`
        );
      }
    } else if (videoCount > 2) {
      // Middle videos: both fadein and fadeout
      const prevTransition = transitions[i - 1];
      const nextTransition = transitions[i];
      processedVideoLabel = `vf${i}`;
      const tempLabel = `vt${i}`;
      // First fadein
      fadeFilters.push(
        `[${videoLabel}]fade=t=in:st=0:d=${prevTransition.duration}[${tempLabel}]`
      );
      // Then fadeout
      const fadeStart = Math.max(prevTransition.duration, videoDuration - nextTransition.duration);
      fadeFilters.push(
        `[${tempLabel}]fade=t=out:st=${fadeStart}:d=${nextTransition.duration}[${processedVideoLabel}]`
      );
      if (anyHasAudio && audioLabel) {
        processedAudioLabel = `af${i}`;
        const tempAudioLabel = `at${i}`;
        fadeFilters.push(
          `[${audioLabel}]afade=t=in:st=0:d=${prevTransition.duration}[${tempAudioLabel}]`
        );
        fadeFilters.push(
          `[${tempAudioLabel}]afade=t=out:st=${fadeStart}:d=${nextTransition.duration}[${processedAudioLabel}]`
        );
      }
    }
    
    concatVideoLabels.push(`[${processedVideoLabel}]`);
    
    // For concat with audio, ALL videos must have audio streams
    // If anyHasAudio is true, we must have an audio label for every video
    if (anyHasAudio) {
      // Determine the final audio label to use
      // Priority: processedAudioLabel (if we applied fades) > audioLabel (original) > a{i} (fallback)
      let finalAudioLabel: string;
      if (processedAudioLabel) {
        // We processed audio with fades
        finalAudioLabel = processedAudioLabel;
      } else if (audioLabel) {
        // Use the original audio label (either from video or generated silent)
        finalAudioLabel = audioLabel;
      } else {
        // Fallback: should never happen if anyHasAudio is true, but just in case
        finalAudioLabel = `a${i}`;
      }
      concatAudioLabels.push(`[${finalAudioLabel}]`);
      console.log(`[VideoStitcher] Video ${i}: video=[${processedVideoLabel}], audio=[${finalAudioLabel}]`);
    }
  }
  
  // Step 3: Add fade filters to the filter complex (must be before concat)
  // The fade filters create the labels that concat will use
  filters.push(...fadeFilters);
  
  // Step 4: Concatenate all videos
  const concatInputs = concatVideoLabels.length;
  
  // Validate that we have the right number of audio streams if audio is enabled
  if (anyHasAudio && concatAudioLabels.length !== concatVideoLabels.length) {
    console.error(`[VideoStitcher] Audio stream count mismatch: ${concatVideoLabels.length} video streams but ${concatAudioLabels.length} audio streams`);
    console.error(`[VideoStitcher] Video labels: ${concatVideoLabels.join(', ')}`);
    console.error(`[VideoStitcher] Audio labels: ${concatAudioLabels.join(', ')}`);
    throw new Error(
      `Audio stream count mismatch: ${concatVideoLabels.length} video streams but ${concatAudioLabels.length} audio streams`
    );
  }
  
  // Concat filter syntax for v=1:a=1: inputs must be interleaved (video, audio, video, audio, ...)
  // NOT all videos then all audio!
  // Format: [v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[vout][aout]
  let concatInputString = '';
  if (anyHasAudio) {
    // Interleave video and audio inputs
    for (let i = 0; i < concatInputs; i++) {
      concatInputString += concatVideoLabels[i] + concatAudioLabels[i];
    }
  } else {
    // No audio, just video inputs
    concatInputString = concatVideoLabels.join('');
  }
  
  const concatFilter = `concat=n=${concatInputs}:v=1${anyHasAudio ? ':a=1' : ''}`;
  const concatOutput = `[vout]${anyHasAudio ? '[aout]' : ''}`;
  
  const concatFilterString = `${concatInputString}${concatFilter}${concatOutput}`;
  filters.push(concatFilterString);
  
  console.log(`[VideoStitcher] Using concat method with ${concatInputs} videos`);
  console.log(`[VideoStitcher] Concat filter: ${concatFilterString.substring(0, 300)}...`);

  // Step 5: Return the final labels for mapping
  return {
    filterComplex: filters.join(';'),
    videoOutputLabel: 'vout',
    audioOutputLabel: anyHasAudio ? 'aout' : null,
  };
}

/**
 * Stitch videos with smooth transitions using FFmpeg filter_complex
 */
async function stitchVideosWithTransitions(
  videoPaths: string[],
  outputPath: string,
  transitions: TransitionConfig[],
  videoDurations: number[],
  hasAudioStreams: boolean[],
  textOverlays?: TextOverlay[],
  style?: 'whimsical' | 'luxury' | 'offroad' | null
): Promise<void> {
  try {
    // Calculate transition offsets
    const offsets = calculateTransitionOffsets(videoDurations, transitions);

    // Detect hardware encoder (with fallback to software encoding)
    const encoderSettings = await detectHardwareEncoder();

    // Build filter complex
    let { filterComplex, videoOutputLabel, audioOutputLabel } = await buildTransitionFilter(
      videoPaths.length,
      videoPaths,
      videoDurations,
      transitions,
      offsets,
      hasAudioStreams
    );

    // Add LUT filter if style is whimsical
    if (style === 'whimsical') {
      const lutPath = path.join(process.cwd(), 'public', 'luts', 'Asteroid_lut_pablolarah.cube');
      // Check if LUT file exists
      try {
        await fs.access(lutPath);
        const escapedLutPath = lutPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
        const lutFilter = `[${videoOutputLabel}]lut3d='${escapedLutPath}'[vlut]`;
        filterComplex += ';' + lutFilter;
        videoOutputLabel = 'vlut';
        console.log(`[VideoStitcher] Applied Whimsical LUT: ${lutPath}`);
      } catch (error) {
        console.warn(`[VideoStitcher] Warning: Whimsical LUT file not found at ${lutPath}, skipping LUT application`);
      }
    }

    // Add text overlays if provided
    if (textOverlays && textOverlays.length > 0) {
      const { filterChain: textFilterChain, outputLabel: textOutputLabel } = buildTextOverlaysFilter(
        textOverlays,
        1920, // Standard video width
        1080, // Standard video height
        videoOutputLabel
      );

      if (textFilterChain) {
        filterComplex += ';' + textFilterChain;
        videoOutputLabel = textOutputLabel;
        console.log(`[VideoStitcher] Added ${textOverlays.length} text overlays to filter complex`);
      }
    }

    // Build input arguments - escape paths properly
    const inputArgs = videoPaths
      .map((vp) => {
        const escapedPath = vp.replace(/"/g, '\\"');
        return `-i "${escapedPath}"`;
      })
      .join(' ');

    // FFmpeg command with filter_complex
    // Note: Do NOT use -shortest here - it will truncate the output to the shortest stream
    // The filter_complex already handles timing correctly
    // OPTIMIZED: Use -threads 0 for automatic optimal thread count
    // OPTIMIZED: Use -filter_complex_threads 0 for parallel filter processing
    // OPTIMIZED: Use hardware acceleration (detected above) with fallback to software
    // Use -fps_mode cfr (constant frame rate) to prevent stuttering (replaces deprecated -vsync)
    // Use -async 1 to sync audio properly (only if we have audio)
    // Use -r 30 to ensure output is exactly 30fps
    // Map the final output labels from the filter chain
    const mapArgs = audioOutputLabel
      ? `-map "[${videoOutputLabel}]" -map "[${audioOutputLabel}]" -c:a aac -b:a 192k -async 1`
      : `-map "[${videoOutputLabel}]" -an`; // -an means no audio

    const command = `ffmpeg -threads 0 ${inputArgs} -filter_complex "${filterComplex}" -filter_complex_threads 0 ${mapArgs} -c:v ${encoderSettings} -r 30 -fps_mode cfr -y "${outputPath}"`;

    console.log(`[VideoStitcher] Stitching ${videoPaths.length} videos with transitions...`);
    console.log(`[VideoStitcher] Encoder: ${encoderSettings}`);
    console.log(`[VideoStitcher] Full filter complex: ${filterComplex}`);
    console.log(`[VideoStitcher] Full FFmpeg command: ${command}`);
    await execAsync(command);
  } catch (error: any) {
    throw new Error(`FFmpeg transition stitching failed: ${error.message}`);
  }
}

// ============================================================================
// Text Overlay Functions
// ============================================================================

/**
 * Escape text for FFmpeg drawtext filter
 * FFmpeg requires special escaping for certain characters
 */
function escapeTextForFFmpeg(text: string): string {
  return text
    .replace(/\\/g, '\\\\\\\\')  // Backslash
    .replace(/'/g, "'\\\\\\''")  // Single quote
    .replace(/:/g, '\\:')         // Colon
    .replace(/\[/g, '\\[')        // Opening bracket
    .replace(/\]/g, '\\]')        // Closing bracket
    .replace(/,/g, '\\,');        // Comma
}

/**
 * Convert hex color to RGB for FFmpeg
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 255, g: 255, b: 255 };
}

/**
 * Build FFmpeg drawtext filter for a single text overlay
 */
function buildTextOverlayFilter(
  overlay: TextOverlay,
  videoWidth: number = 1920,
  videoHeight: number = 1080,
  inputLabel: string = 'vout',
  outputLabel: string = 'vtext'
): string {
  const escapedText = escapeTextForFFmpeg(overlay.text);

  // Calculate actual pixel positions from percentages
  const xPos = Math.round(overlay.x * videoWidth);
  const yPos = Math.round(overlay.y * videoHeight);

  // Parse font color
  const fontColor = hexToRgb(overlay.fontColor);
  const fontColorStr = `0x${overlay.fontColor.replace('#', '')}`;

  // Build base drawtext filter
  let filter = `drawtext=text='${escapedText}'`;
  filter += `:fontfile=/System/Library/Fonts/Supplemental/${overlay.fontFamily}.ttf`;
  filter += `:fontsize=${overlay.fontSize}`;
  filter += `:fontcolor=${fontColorStr}@${overlay.opacity}`;
  filter += `:x=${xPos}`;
  filter += `:y=${yPos}`;

  // Add text alignment
  if (overlay.textAlign === 'center') {
    filter += `:x=${xPos}-(tw/2)`;
  } else if (overlay.textAlign === 'right') {
    filter += `:x=${xPos}-tw`;
  }

  // Add border/outline
  if (overlay.borderWidth > 0 && overlay.borderColor) {
    const borderColor = `0x${overlay.borderColor.replace('#', '')}`;
    filter += `:borderw=${overlay.borderWidth}`;
    filter += `:bordercolor=${borderColor}`;
  }

  // Add shadow
  if (overlay.shadowEnabled) {
    const shadowColor = hexToRgb(overlay.shadowColor);
    filter += `:shadowcolor=${`0x${overlay.shadowColor.replace('#', '')}`}@0.8`;
    filter += `:shadowx=${overlay.shadowOffsetX}`;
    filter += `:shadowy=${overlay.shadowOffsetY}`;
  }

  // Add background box
  if (overlay.backgroundColor && overlay.backgroundOpacity > 0) {
    const bgColor = `0x${overlay.backgroundColor.replace('#', '')}`;
    filter += `:box=1`;
    filter += `:boxcolor=${bgColor}@${overlay.backgroundOpacity}`;
    filter += `:boxborderw=10`;
  }

  // Add timing - enable only during overlay's time range
  filter += `:enable='between(t,${overlay.startTime},${overlay.endTime})'`;

  // Return complete filter with input/output labels
  return `[${inputLabel}]${filter}[${outputLabel}]`;
}

/**
 * Build complete text overlay filter chain for all overlays
 */
function buildTextOverlaysFilter(
  textOverlays: TextOverlay[],
  videoWidth: number = 1920,
  videoHeight: number = 1080,
  inputLabel: string = 'vout'
): { filterChain: string; outputLabel: string } {
  if (!textOverlays || textOverlays.length === 0) {
    return { filterChain: '', outputLabel: inputLabel };
  }

  // Sort overlays by order (z-index)
  const sortedOverlays = [...textOverlays].sort((a, b) => a.order - b.order);

  const filters: string[] = [];
  let currentLabel = inputLabel;

  sortedOverlays.forEach((overlay, index) => {
    const nextLabel = index === sortedOverlays.length - 1 ? 'vfinal' : `vtext${index}`;
    const filter = buildTextOverlayFilter(
      overlay,
      videoWidth,
      videoHeight,
      currentLabel,
      nextLabel
    );
    filters.push(filter);
    currentLabel = nextLabel;
  });

  return {
    filterChain: filters.join(';'),
    outputLabel: currentLabel
  };
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Stitch multiple video clips into a single MP4 file with fast fade transitions
 *
 * OPTIMIZED: Uses simple fade transitions without similarity analysis for faster processing.
 * Removed motion interpolation to significantly speed up stitching time.
 *
 * @param videoPaths - Array of paths to video files to stitch (in order)
 * @param projectId - Project ID for organizing output files
 * @param textOverlays - Optional array of text overlays to render on the video
 * @param style - Optional visual style for applying LUTs ('whimsical' | 'luxury' | 'offroad')
 * @param companyLogoPath - Optional path to company logo image for end transition
 * @returns Path to the stitched output video file
 *
 * @throws Error if video files don't exist, are invalid, or stitching fails
 */
export async function stitchVideos(
  videoPaths: string[],
  projectId: string,
  textOverlays?: TextOverlay[],
  style?: 'whimsical' | 'luxury' | 'offroad' | null,
  companyLogoPath?: string
): Promise<{ localPath: string; s3Url: string; s3Key?: string; storedFile: StoredFile }> {
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

  // Create temporary directory for frame comparison
  const tempDir = path.join(outputDir, 'temp_analysis');
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // If company logo is provided, create a logo video segment
    let logoVideoPath: string | null = null;
    const LOGO_DURATION = 2.0; // 2 seconds for logo display
    const LOGO_FADE_DURATION = 0.5; // 0.5 second fade in

    if (companyLogoPath) {
      logoVideoPath = path.join(tempDir, 'logo_segment.mp4');
      console.log('[VideoStitcher] Creating company logo video segment...');
      await createLogoVideoSegment(companyLogoPath, LOGO_DURATION, logoVideoPath);
    }

    // Get video info (including durations and audio stream detection)
    console.log('[VideoStitcher] Analyzing videos...');
    const allVideoPaths = logoVideoPath ? [...videoPaths, logoVideoPath] : videoPaths;
    const videoInfos = await Promise.all(
      allVideoPaths.map((vp) => getVideoInfo(vp))
    );
    const videoDurations = videoInfos.map((info) => info.duration);
    const hasAudioStreams = videoInfos.map((info) => info.hasAudio);

    console.log(`[VideoStitcher] Video durations: ${videoDurations.map((d, i) => `Video ${i}: ${d.toFixed(2)}s`).join(', ')}`);
    console.log(`[VideoStitcher] Total duration: ${videoDurations.reduce((a, b) => a + b, 0).toFixed(2)}s`);
    console.log(`[VideoStitcher] Audio streams detected: ${hasAudioStreams.filter(h => h).length}/${allVideoPaths.length} videos have audio`);

    // Handle single video case (no transitions needed)
    if (allVideoPaths.length === 1) {
      console.log('[VideoStitcher] Single video, copying without transitions...');
      const command = `ffmpeg -i "${allVideoPaths[0]}" -c copy -y "${outputPath}"`;
      await execAsync(command);
    } else {
      // OPTIMIZED: Use default transitions without similarity analysis for faster processing
      console.log('[VideoStitcher] Using default transitions (skipping similarity analysis for speed)...');
      const transitions: TransitionConfig[] = [];

      for (let i = 0; i < allVideoPaths.length - 1; i++) {
        let transition: TransitionConfig;

        // If this is the transition to the logo (last transition), use a fade
        if (logoVideoPath && i === allVideoPaths.length - 2) {
          console.log('[VideoStitcher] Adding fade transition to company logo...');
          transition = {
            type: 'fade',
            duration: LOGO_FADE_DURATION,
          };
        } else {
          // Use default fade transition for all scene transitions
          transition = {
            type: 'fade',
            duration: DEFAULT_TRANSITION_DURATION,
          };
        }

        transitions.push(transition);

        console.log(
          `[VideoStitcher] Videos ${i}→${i + 1}: transition=${transition.type} (${transition.duration}s)`
        );
      }

      // Stitch videos with transitions
      console.log('[VideoStitcher] Stitching videos with transitions...');
      await stitchVideosWithTransitions(
        allVideoPaths,
        outputPath,
        transitions,
        videoDurations,
        hasAudioStreams,
        textOverlays,
        style
      );
    }

    // Verify output file was created
    try {
      await fs.access(outputPath);
    } catch {
      throw new Error('Stitched video file was not created');
    }

    // Clean up temporary files
    try {
      const tempFiles = await fs.readdir(tempDir);
      for (const file of tempFiles) {
        await fs.unlink(path.join(tempDir, file));
      }
      await fs.rmdir(tempDir);
    } catch {
      // Ignore cleanup errors
    }

    // Upload to S3
    console.log('[VideoStitcher] Uploading stitched video to S3...');
    const storageService = getStorageService();
    const storedFile = await storageService.storeFromLocalPath(outputPath, {
      projectId,
      category: 'final',
      mimeType: 'video/mp4',
      customFilename: 'final.mp4',
    }, {
      keepLocal: true, // Keep local for quick access
      deleteSource: false,
    });

    console.log('[VideoStitcher] Video stitching completed successfully');
    console.log(`[VideoStitcher] S3 Key: ${storedFile.s3Key}`);

    return {
      localPath: storedFile.localPath,
      s3Url: storedFile.url,
      s3Key: storedFile.s3Key,
      storedFile,
    };
  } catch (error: any) {
    // Clean up on error
    try {
      const tempFiles = await fs.readdir(tempDir).catch(() => []);
      for (const file of tempFiles) {
        await fs.unlink(path.join(tempDir, file)).catch(() => {});
      }
      await fs.rmdir(tempDir).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }
    try {
      await fs.unlink(outputPath).catch(() => {});
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

