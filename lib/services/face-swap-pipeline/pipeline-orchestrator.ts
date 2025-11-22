/**
 * Pipeline Orchestrator Service
 * Main orchestration function that coordinates all phases
 */

import { v4 as uuidv4 } from 'uuid';
import { ProcessingJob, ProcessingOptions, FrameMetadata, PipelinePhase } from '@/lib/types/face-swap-pipeline';
import { extractFrames, getVideoMetadata } from './frame-extractor';
import { detectKeyFrames } from './key-frame-detector';
import { classifyFrames } from './scene-classifier';
import { batchSwapFaces } from './face-swapper';
import { assembleVideo, extractAudio } from './video-assembler';
import { uploadToS3, getS3Url } from '@/lib/storage/s3-uploader';
import { join } from 'path';
import { existsSync } from 'fs';

const logPrefix = '[PipelineOrchestrator]';

// In-memory job storage (in production, use database)
const jobs = new Map<string, ProcessingJob>();

/**
 * Create a new processing job
 */
export function createJob(jobId: string, projectId: string, options: ProcessingOptions): ProcessingJob {
  const now = new Date().toISOString();

  const job: ProcessingJob = {
    id: jobId,
    projectId,
    phase: 'idle',
    progress: 0,
    totalFrames: 0,
    processedFrames: 0,
    frames: [],
    keyFrames: [],
    errors: [],
    createdAt: now,
    updatedAt: now,
  };

  jobs.set(jobId, job);
  return job;
}

/**
 * Get job by ID
 */
export function getJob(jobId: string): ProcessingJob | null {
  return jobs.get(jobId) || null;
}

/**
 * Update job status
 */
function updateJob(jobId: string, updates: Partial<ProcessingJob>): void {
  const job = jobs.get(jobId);
  if (job) {
    Object.assign(job, updates, { updatedAt: new Date().toISOString() });
    jobs.set(jobId, job);
  }
}

/**
 * Main pipeline orchestration function
 * @param videoPath - Path to video file
 * @param projectId - Project ID
 * @param referenceImages - Reference images (face, person, car)
 * @param options - Processing options
 * @returns Job ID for status tracking
 */
export async function processVideoPipeline(
  videoPath: string,
  projectId: string,
  referenceImages: {
    face?: string; // URL or path
    person?: string;
    car?: string;
  },
  options: ProcessingOptions
): Promise<string> {
  const jobId = uuidv4();
  const job = createJob(jobId, projectId, options);

  console.log(`${logPrefix} ========================================`);
  console.log(`${logPrefix} Starting video pipeline`);
  console.log(`${logPrefix} Job ID: ${jobId}`);
  console.log(`${logPrefix} Video: ${videoPath}`);
  console.log(`${logPrefix} Project ID: ${projectId}`);
  console.log(`${logPrefix} ========================================`);

  // Run pipeline asynchronously
  runPipeline(jobId, videoPath, projectId, referenceImages, options).catch((error) => {
    console.error(`${logPrefix} Pipeline failed:`, error);
    updateJob(jobId, {
      phase: 'failed',
      errors: [...(jobs.get(jobId)?.errors || []), error.message],
    });
  });

  return jobId;
}

/**
 * Run the pipeline (async execution)
 */
async function runPipeline(
  jobId: string,
  videoPath: string,
  projectId: string,
  referenceImages: {
    face?: string;
    person?: string;
    car?: string;
  },
  options: ProcessingOptions
): Promise<void> {
  try {
    // Phase 1: Extract frames
    updateJob(jobId, { phase: 'extracting_frames', progress: 5 });
    console.log(`${logPrefix} Phase 1: Extracting frames...`);

    const frames = await extractFrames(videoPath, projectId, {
      frameRate: options.frameExtractionRate,
      timeInterval: options.extractByTimeInterval,
      maxFrames: 1000, // Limit for cost management
    });

    updateJob(jobId, {
      frames,
      totalFrames: frames.length,
      progress: 15,
    });

    console.log(`${logPrefix} ✓ Extracted ${frames.length} frames`);

    // Phase 1.5: Detect key frames
    if (options.processKeyFramesOnly) {
      updateJob(jobId, { phase: 'detecting_key_frames', progress: 20 });
      console.log(`${logPrefix} Detecting key frames...`);

      const keyFrameNumbers = await detectKeyFrames(videoPath, frames);
      updateJob(jobId, {
        keyFrames: keyFrameNumbers,
        progress: 25,
      });

      console.log(`${logPrefix} ✓ Detected ${keyFrameNumbers.length} key frames`);
    }

    // Phase 1.6: Classify frames
    updateJob(jobId, { phase: 'classifying_frames', progress: 30 });
    console.log(`${logPrefix} Classifying frames...`);

    const frameUrls = frames.map(f => f.url || f.path);
    const classifications = await classifyFrames(frameUrls);

    // Update frame classifications
    const updatedFrames = frames.map((frame, idx) => ({
      ...frame,
      classification: classifications[idx]?.classification,
    }));

    updateJob(jobId, {
      frames: updatedFrames,
      progress: 35,
    });

    console.log(`${logPrefix} ✓ Classified ${classifications.length} frames`);

    // Determine which frames to process
    let framesToProcess = updatedFrames;
    if (options.processKeyFramesOnly && updatedFrames.length > 0) {
      const keyFrameNumbers = jobs.get(jobId)?.keyFrames || [];
      framesToProcess = updatedFrames.filter(f => keyFrameNumbers.includes(f.frameNumber));
      console.log(`${logPrefix} Processing ${framesToProcess.length} key frames`);
    }

    // Phase 2: Face swapping (if enabled and reference provided)
    if (options.enableFaceSwap && referenceImages.face) {
      updateJob(jobId, { phase: 'swapping_faces', progress: 40 });
      console.log(`${logPrefix} Phase 2: Swapping faces...`);

      const faceFrames = framesToProcess.filter(
        f => f.classification === 'face_closeup' || !f.classification
      );

      if (faceFrames.length > 0) {
        const frameUrls = faceFrames.map(f => f.url || f.path);
        const swappedUrls = await batchSwapFaces(
          frameUrls,
          referenceImages.face,
          options.faceSwapModel || 'simple'
        );

        // Update frames with swapped URLs
        let swappedIdx = 0;
        const processedFrames = updatedFrames.map(frame => {
          if (faceFrames.some(f => f.frameNumber === frame.frameNumber)) {
            return {
              ...frame,
              url: swappedUrls[swappedIdx++],
            };
          }
          return frame;
        });

        updateJob(jobId, {
          frames: processedFrames,
          processedFrames: swappedUrls.length,
          progress: 50,
        });

        console.log(`${logPrefix} ✓ Swapped faces on ${swappedUrls.length} frames`);
      }
    }

    // Phase 3: Person replacement (if enabled)
    if (options.enablePersonReplacement && referenceImages.person) {
      updateJob(jobId, { phase: 'replacing_person', progress: 60 });
      console.log(`${logPrefix} Phase 3: Replacing persons...`);

      const currentFrames = jobs.get(jobId)?.frames || updatedFrames;
      const personFrames = framesToProcess.filter(
        f => f.classification === 'full_body' || !f.classification
      );

      if (personFrames.length > 0) {
        const { batchSegmentPersons } = await import('./person-segmenter');
        const { createPersonMask } = await import('./person-segmenter');
        const { batchInpaintPersons } = await import('./person-inpainter');

        const frameUrls = personFrames.map(f => f.url || f.path);
        
        // Step 1: Segment persons
        console.log(`${logPrefix} Segmenting persons...`);
        const segmentedUrls = await batchSegmentPersons(frameUrls);

        // Step 2: Create masks
        console.log(`${logPrefix} Creating person masks...`);
        const maskUrls = await Promise.all(
          frameUrls.map((frameUrl, idx) => 
            createPersonMask(frameUrl, segmentedUrls[idx])
          )
        );

        // Step 3: Inpaint new persons
        // Use custom prompt or default
        const prompt = options.personReplacementPrompt || `a person matching the style and pose of the reference person, high quality, detailed`;
        const inpaintData = frameUrls.map((frameUrl, idx) => ({
          frameUrl,
          maskUrl: maskUrls[idx],
          prompt,
        }));

        console.log(`${logPrefix} Inpainting new persons...`);
        const inpaintedUrls = await batchInpaintPersons(inpaintData);

        // Update frames with inpainted URLs
        let inpaintIdx = 0;
        const processedFrames = currentFrames.map(frame => {
          if (personFrames.some(f => f.frameNumber === frame.frameNumber)) {
            return {
              ...frame,
              url: inpaintedUrls[inpaintIdx++],
            };
          }
          return frame;
        });

        updateJob(jobId, {
          frames: processedFrames,
          processedFrames: (jobs.get(jobId)?.processedFrames || 0) + inpaintedUrls.length,
          progress: 65,
        });

        console.log(`${logPrefix} ✓ Replaced persons on ${inpaintedUrls.length} frames`);
      }
    }

    // Phase 4: Car replacement (if enabled)
    if (options.enableCarReplacement && referenceImages.car) {
      updateJob(jobId, { phase: 'replacing_car', progress: 70 });
      console.log(`${logPrefix} Phase 4: Replacing cars...`);

      const currentFrames = jobs.get(jobId)?.frames || updatedFrames;
      const carFrames = framesToProcess.filter(
        f => f.classification === 'car_visible' || !f.classification
      );

      if (carFrames.length > 0) {
        const { batchDetectAndMaskCars, extractSceneStructure } = await import('./car-processor');
        const { batchInpaintCars } = await import('./car-inpainter');

        const frameUrls = carFrames.map(f => f.url || f.path);
        
        // Step 1: Detect and mask cars
        console.log(`${logPrefix} Detecting and masking cars...`);
        const maskUrls = await batchDetectAndMaskCars(frameUrls);

        // Step 2: Extract scene structure (for ControlNet)
        console.log(`${logPrefix} Extracting scene structure...`);
        const structurePromises = frameUrls.map(url => extractSceneStructure(url));
        const structures = await Promise.all(structurePromises);

        // Step 3: Inpaint new cars
        // Use custom prompt or default
        const prompt = options.carReplacementPrompt || `a car matching the style and perspective of the reference car, high quality, detailed, realistic lighting`;
        const inpaintData = frameUrls.map((frameUrl, idx) => ({
          frameUrl,
          maskUrl: maskUrls[idx],
          prompt,
          useControlNet: true,
          controlImageUrl: structures[idx]?.edges,
        }));

        console.log(`${logPrefix} Inpainting new cars...`);
        const inpaintedUrls = await batchInpaintCars(inpaintData);

        // Update frames with inpainted URLs
        let inpaintIdx = 0;
        const processedFrames = currentFrames.map(frame => {
          if (carFrames.some(f => f.frameNumber === frame.frameNumber)) {
            return {
              ...frame,
              url: inpaintedUrls[inpaintIdx++],
            };
          }
          return frame;
        });

        updateJob(jobId, {
          frames: processedFrames,
          processedFrames: (jobs.get(jobId)?.processedFrames || 0) + inpaintedUrls.length,
          progress: 75,
        });

        console.log(`${logPrefix} ✓ Replaced cars on ${inpaintedUrls.length} frames`);
      }
    }

    // Phase 5: Enhancement
    if (options.enableEnhancement) {
      updateJob(jobId, { phase: 'enhancing', progress: 80 });
      console.log(`${logPrefix} Phase 5: Enhancing frames...`);

      const currentFrames = jobs.get(jobId)?.frames || [];
      let frameUrls = currentFrames.map(f => f.url || f.path).filter(url => url && (url.startsWith('http://') || url.startsWith('https://')));

      if (frameUrls.length === 0) {
        frameUrls = currentFrames.map(f => f.path).filter(path => path);
      }

      // Color matching for consistency
      if (options.enableColorMatching && frameUrls.length > 0) {
        console.log(`${logPrefix} Applying color matching...`);
        try {
          const { analyzeImageColors, applyColorMatching } = await import('@/lib/services/color-matcher');
          const { downloadImage } = await import('@/lib/services/style-image-processor');
          const { uploadBufferToS3, getS3Url } = await import('@/lib/storage/s3-uploader');

          // Analyze first frame as reference
          const referenceColors = await analyzeImageColors(frameUrls[0]);
          console.log(`${logPrefix} Reference colors:`, referenceColors);

          // Process each frame
          const colorMatchedUrls: string[] = [];
          for (let i = 0; i < frameUrls.length; i++) {
            try {
              const frameBuffer = await downloadImage(frameUrls[i]);
              const matchedBuffer = await applyColorMatching(frameBuffer, {
                tintColor: referenceColors.averageRgb,
                brightnessAdjust: (referenceColors.averageBrightness - 0.5) * 50,
              });

              // Upload matched frame
              const projectId = `color-match-${Date.now()}-${i}`;
              const s3Key = `face-swap-pipeline/${projectId}/color-matched-${i}.png`;
              await uploadBufferToS3(matchedBuffer, s3Key, 'image/png');
              const matchedUrl = getS3Url(s3Key);
              colorMatchedUrls.push(matchedUrl);
            } catch (error: any) {
              console.error(`${logPrefix} Failed to color-match frame ${i + 1}:`, error.message);
              colorMatchedUrls.push(frameUrls[i]); // Use original as fallback
            }
          }

          // Update frame URLs
          frameUrls = colorMatchedUrls;
          const colorMatchedFrames = currentFrames.map((frame, idx) => ({
            ...frame,
            url: colorMatchedUrls[idx] || frame.url,
          }));
          updateJob(jobId, { frames: colorMatchedFrames });
          console.log(`${logPrefix} ✓ Color matched ${colorMatchedUrls.length} frames`);
        } catch (error: any) {
          console.error(`${logPrefix} Color matching failed:`, error.message);
        }
      }

      // Upscaling
      if (options.enableUpscaling && frameUrls.length > 0) {
        console.log(`${logPrefix} Upscaling frames...`);
        const { batchUpscaleFrames } = await import('./frame-upscaler');
        const upscaledUrls = await batchUpscaleFrames(
          frameUrls,
          options.upscalingModel || 'real-esrgan',
          2
        );

        // Update frames
        const currentFramesAfterColor = jobs.get(jobId)?.frames || currentFrames;
        const enhancedFrames = currentFramesAfterColor.map((frame, idx) => ({
          ...frame,
          url: upscaledUrls[idx] || frame.url,
        }));

        updateJob(jobId, { frames: enhancedFrames });
        console.log(`${logPrefix} ✓ Upscaled ${upscaledUrls.length} frames`);
      }

      // Frame interpolation (if processing key frames only)
      if (options.enableFrameInterpolation && options.processKeyFramesOnly && frameUrls.length > 1) {
        console.log(`${logPrefix} Interpolating frames...`);
        try {
          const { interpolateMultipleFrames } = await import('./frame-interpolator');
          
          // Interpolate between consecutive frames
          const interpolatedFrameUrls: string[] = [];
          for (let i = 0; i < frameUrls.length - 1; i++) {
            interpolatedFrameUrls.push(frameUrls[i]); // Original frame
            
            // Generate 2 interpolated frames between each pair
            const interpolated = await interpolateMultipleFrames(frameUrls[i], frameUrls[i + 1], 2);
            interpolatedFrameUrls.push(...interpolated);
          }
          interpolatedFrameUrls.push(frameUrls[frameUrls.length - 1]); // Last frame

          // Update frames with interpolated frames
          const currentFramesAfterUpscale = jobs.get(jobId)?.frames || currentFrames;
          // Note: This would require updating frame metadata to include interpolated frames
          // For now, we'll just log the interpolation
          console.log(`${logPrefix} ✓ Generated ${interpolatedFrameUrls.length - frameUrls.length} interpolated frames`);
        } catch (error: any) {
          console.error(`${logPrefix} Frame interpolation failed:`, error.message);
        }
      }

      updateJob(jobId, { progress: 85 });
    }

    // Phase 6: Reconstruct video
    updateJob(jobId, { phase: 'reconstructing_video', progress: 90 });
    console.log(`${logPrefix} Phase 6: Reconstructing video...`);

    const finalFrames = jobs.get(jobId)?.frames || [];
    const finalFrameUrls = finalFrames.map(f => f.url || f.path);

    // Get video metadata
    const videoMetadata = await getVideoMetadata(videoPath);

    // Extract audio
    const audioPath = join(process.cwd(), 'tmp', 'face-swap-pipeline', projectId, 'audio.aac');
    let audioPathFinal: string | undefined;
    try {
      await extractAudio(videoPath, audioPath);
      audioPathFinal = audioPath;
    } catch (error: any) {
      console.warn(`${logPrefix} Failed to extract audio:`, error.message);
    }

    // Assemble video
    const outputPath = join(process.cwd(), 'tmp', 'face-swap-pipeline', projectId, 'output', 'final-video.mp4');
    
    // Get frame timestamps for proper duration calculation
    const frameTimestamps = finalFrames.map(f => f.timestamp);
    
    await assembleVideo(finalFrameUrls, outputPath, {
      duration: videoMetadata.duration,
      fps: videoMetadata.fps,
      width: videoMetadata.width,
      height: videoMetadata.height,
      audioPath: audioPathFinal,
    }, frameTimestamps);

    // Upload to S3
    const s3Key = await uploadToS3(outputPath, `face-swap-pipeline/${projectId}/final-video.mp4`);
    const videoUrl = getS3Url(s3Key);

    updateJob(jobId, {
      phase: 'completed',
      progress: 100,
      resultVideoUrl: videoUrl,
      completedAt: new Date().toISOString(),
    });

    console.log(`${logPrefix} ✓ Pipeline complete!`);
    console.log(`${logPrefix} Video URL: ${videoUrl}`);
    console.log(`${logPrefix} ========================================`);
  } catch (error: any) {
    console.error(`${logPrefix} Pipeline error:`, error);
    updateJob(jobId, {
      phase: 'failed',
      errors: [...(jobs.get(jobId)?.errors || []), error.message],
    });
    throw error;
  }
}

