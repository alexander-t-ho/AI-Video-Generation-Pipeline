/**
 * Video Stitcher - FFmpeg Integration with Automatic Transition Smoothing
 * 
 * This module handles concatenating multiple video clips into a single MP4 file
 * with automatic smooth transitions based on video similarity analysis.
 * Uses FFmpeg's filter_complex with xfade transitions for smooth clip blending.
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
const DEFAULT_TRANSITION_DURATION = 0.2; // seconds - reduced for more subtle transitions
const MIN_TRANSITION_DURATION = 0.15; // reduced for more subtle transitions
const MAX_TRANSITION_DURATION = 0.3; // reduced for more subtle transitions

// Transition thresholds based on similarity (0-1 scale)
const HIGH_SIMILARITY_THRESHOLD = 0.8; // Use subtle fade
const MEDIUM_SIMILARITY_THRESHOLD = 0.5; // Use crossfade
// Below 0.5: Use more pronounced transition

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

/**
 * Compare two frames using FFmpeg's SSIM filter
 * Returns similarity score between 0 (completely different) and 1 (identical)
 */
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

/**
 * Analyze similarity between two videos by comparing their boundary frames
 * Compares last frame of video1 with first frame of video2
 */
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

/**
 * Select appropriate transition type and duration based on similarity score
 * 
 * Note: FFmpeg's xfade filter supports: fade, fadeblack, fadewhite, distance, 
 * wipeleft, wiperight, wipeup, wipedown, slideleft, slideright, slideup, slidedown, etc.
 * "crossfade" and "dissolve" are not valid - using "fade" and "distance" instead.
 */
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
function buildTransitionFilter(
  videoCount: number,
  videoDurations: number[],
  transitions: TransitionConfig[],
  offsets: TransitionOffset[],
  hasAudioStreams: boolean[] // Array indicating which videos have audio
): { filterComplex: string; videoOutputLabel: string; audioOutputLabel: string | null } {
  const filters: string[] = [];
  const anyHasAudio = hasAudioStreams.some(has => has);

  // Step 1: Normalize each video (don't trim - xfade handles overlap)
  // Normalize frame rate to 30fps with motion interpolation for smooth playback
  // Scale to common resolution for xfade compatibility
  for (let i = 0; i < videoCount; i++) {
    const hasAudio = hasAudioStreams[i];
    const videoDuration = videoDurations[i];

    console.log(
      `[VideoStitcher] Video ${i}: using full duration ${videoDuration.toFixed(2)}s (no trimming)`
    );

    // Don't trim videos - use full duration
    // xfade will handle the overlap automatically
    // Use minterpolate for smooth frame interpolation, normalize frame rate to 30fps
    // minterpolate creates intermediate frames for smoother motion, reducing stuttering
    // mi_mode=mci: motion-compensated interpolation for smooth transitions
    // mc_mode=aobmc: adaptive overlapped block motion compensation
    // me_mode=bidir: bidirectional motion estimation for better accuracy
    // vsbmc=1: variable-size block motion compensation enabled
    // Scale to 1920x1080 (or maintain aspect ratio)
    // xfade requires inputs to have the same resolution and frame rate
    // Note: If minterpolate fails, fallback to fps filter (handled by FFmpeg error handling)
    filters.push(
      `[${i}:v]setpts=PTS-STARTPTS,minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1:scd=none,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[v${i}]`
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
  hasAudioStreams: boolean[]
): Promise<void> {
  try {
    // Calculate transition offsets
    const offsets = calculateTransitionOffsets(videoDurations, transitions);

    // Build filter complex
    const { filterComplex, videoOutputLabel, audioOutputLabel } = buildTransitionFilter(
      videoPaths.length,
      videoDurations,
      transitions,
      offsets,
      hasAudioStreams
    );

    // Build input arguments - escape paths properly
    const inputArgs = videoPaths
      .map((vp) => {
        const escapedPath = vp.replace(/"/g, '\\"');
        return `-i "${escapedPath}"`;
      })
      .join(' ');

    // FFmpeg command with filter_complex
    // Note: Do NOT use -shortest here - it will truncate the output to the shortest stream
    // The filter_complex with xfade already handles timing correctly
    // Use -fps_mode cfr (constant frame rate) to prevent stuttering (replaces deprecated -vsync)
    // Use -async 1 to sync audio properly (only if we have audio)
    // Use -r 30 to ensure output is exactly 30fps
    // Map the final output labels from the filter chain
    const mapArgs = audioOutputLabel 
      ? `-map "[${videoOutputLabel}]" -map "[${audioOutputLabel}]" -c:a aac -b:a 192k -async 1`
      : `-map "[${videoOutputLabel}]" -an`; // -an means no audio
    
    const command = `ffmpeg ${inputArgs} -filter_complex "${filterComplex}" ${mapArgs} -c:v libx264 -preset medium -crf 23 -r 30 -fps_mode cfr -y "${outputPath}"`;

    console.log(`[VideoStitcher] Stitching ${videoPaths.length} videos with transitions...`);
    console.log(`[VideoStitcher] Full filter complex: ${filterComplex}`);
    console.log(`[VideoStitcher] Full FFmpeg command: ${command}`);
    await execAsync(command);
  } catch (error: any) {
    throw new Error(`FFmpeg transition stitching failed: ${error.message}`);
  }
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Stitch multiple video clips into a single MP4 file with automatic smooth transitions
 * 
 * Automatically analyzes similarity between consecutive videos and applies appropriate
 * transitions (fade, crossfade, dissolve) based on visual similarity.
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

  // Create temporary directory for frame comparison
  const tempDir = path.join(outputDir, 'temp_analysis');
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // Get video info (including durations and audio stream detection)
    console.log('[VideoStitcher] Analyzing videos...');
    const videoInfos = await Promise.all(
      videoPaths.map((vp) => getVideoInfo(vp))
    );
    const videoDurations = videoInfos.map((info) => info.duration);
    const hasAudioStreams = videoInfos.map((info) => info.hasAudio);
    
    console.log(`[VideoStitcher] Video durations: ${videoDurations.map((d, i) => `Video ${i}: ${d.toFixed(2)}s`).join(', ')}`);
    console.log(`[VideoStitcher] Total duration: ${videoDurations.reduce((a, b) => a + b, 0).toFixed(2)}s`);
    console.log(`[VideoStitcher] Audio streams detected: ${hasAudioStreams.filter(h => h).length}/${videoPaths.length} videos have audio`);

    // Handle single video case (no transitions needed)
    if (videoPaths.length === 1) {
      console.log('[VideoStitcher] Single video, copying without transitions...');
      const command = `ffmpeg -i "${videoPaths[0]}" -c copy -y "${outputPath}"`;
      await execAsync(command);
    } else {
      // Analyze similarity between consecutive video pairs
      console.log('[VideoStitcher] Analyzing video similarity for transition selection...');
      const similarities: number[] = [];
      const transitions: TransitionConfig[] = [];

      for (let i = 0; i < videoPaths.length - 1; i++) {
        const similarity = await analyzeVideoSimilarity(
          videoPaths[i],
          videoPaths[i + 1],
          tempDir
        );
        similarities.push(similarity);

        const transition = selectTransition(similarity);
        transitions.push(transition);

        console.log(
          `[VideoStitcher] Videos ${i}→${i + 1}: similarity=${similarity.toFixed(3)}, transition=${transition.type} (${transition.duration}s)`
        );
      }

      // Stitch videos with transitions
      console.log('[VideoStitcher] Stitching videos with smooth transitions...');
      await stitchVideosWithTransitions(
        videoPaths,
        outputPath,
        transitions,
        videoDurations,
        hasAudioStreams
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

    console.log('[VideoStitcher] Video stitching completed successfully');
    return outputPath;
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

