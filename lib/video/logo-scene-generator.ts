/**
 * Logo Scene Generator
 *
 * Creates a final scene that fades the last video frame to black
 * and displays the company logo
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const execAsync = promisify(exec);

// ============================================================================
// Constants
// ============================================================================

const LOGO_SCENE_DURATION = 3; // seconds - how long to show the logo
const FADE_TO_BLACK_DURATION = 1; // seconds - fade from last frame to black
const LOGO_DISPLAY_DURATION = 2; // seconds - how long to show logo on black

// ============================================================================
// Types
// ============================================================================

interface LogoSceneConfig {
  lastVideoPath: string;       // Path to the last video in the sequence
  logoS3Key?: string;           // S3 key for company logo
  logoLocalPath?: string;       // Or local path to logo
  outputPath: string;           // Where to save the generated scene
  videoWidth?: number;          // Video dimensions (default: 1920x1080)
  videoHeight?: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create S3 client
 */
function createS3Client(): S3Client {
  const region = process.env.AWS_REGION || 'us-east-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS credentials not found');
  }

  return new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
}

/**
 * Download logo from S3
 */
async function downloadLogoFromS3(s3Key: string, outputPath: string): Promise<void> {
  const s3Client = createS3Client();
  const bucket = process.env.AWS_S3_BUCKET || 'ai-video-pipeline-outputs';

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      throw new Error('No data received from S3');
    }

    // Convert stream to buffer
    const stream = response.Body as Readable;
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }

    const buffer = Buffer.concat(chunks);
    await fs.writeFile(outputPath, buffer);
  } catch (error: any) {
    throw new Error(`Failed to download logo from S3: ${error.message}`);
  }
}

/**
 * Extract the last frame from a video
 */
async function extractLastFrame(
  videoPath: string,
  outputPath: string
): Promise<void> {
  try {
    // Get video duration first
    const probeCommand = `ffprobe -v error -show_entries format=duration -of json "${videoPath}"`;
    const { stdout } = await execAsync(probeCommand);
    const probeData = JSON.parse(stdout);
    const duration = parseFloat(probeData.format?.duration || '0');

    if (!duration || duration <= 0) {
      throw new Error('Could not determine video duration');
    }

    // Extract last frame (0.1s before end to avoid edge cases)
    const timestamp = Math.max(0, duration - 0.1);
    const command = `ffmpeg -ss ${timestamp} -i "${videoPath}" -vframes 1 -q:v 2 -y "${outputPath}"`;
    await execAsync(command);
  } catch (error: any) {
    throw new Error(`Failed to extract last frame: ${error.message}`);
  }
}

/**
 * Get logo dimensions and aspect ratio
 */
async function getLogoDimensions(logoPath: string): Promise<{ width: number; height: number }> {
  try {
    const command = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of json "${logoPath}"`;
    const { stdout } = await execAsync(command);
    const data = JSON.parse(stdout);
    const stream = data.streams?.[0];

    return {
      width: parseInt(stream?.width || '0', 10),
      height: parseInt(stream?.height || '0', 10),
    };
  } catch (error: any) {
    throw new Error(`Failed to get logo dimensions: ${error.message}`);
  }
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Generate a logo scene that:
 * 1. Shows the last frame of the last video
 * 2. Fades to black
 * 3. Shows the company logo on black background
 *
 * @param config Configuration for logo scene generation
 * @returns Path to the generated logo scene video
 */
export async function generateLogoScene(config: LogoSceneConfig): Promise<string> {
  const {
    lastVideoPath,
    logoS3Key,
    logoLocalPath,
    outputPath,
    videoWidth = 1920,
    videoHeight = 1080,
  } = config;

  console.log('[LogoSceneGenerator] Starting logo scene generation...');

  // Create temporary directory for intermediate files
  const tempDir = path.join(path.dirname(outputPath), 'logo_temp');
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // Step 1: Download logo if S3 key is provided
    let logoPath = logoLocalPath;

    if (!logoPath && logoS3Key) {
      logoPath = path.join(tempDir, 'logo.png');
      console.log(`[LogoSceneGenerator] Downloading logo from S3: ${logoS3Key}`);
      await downloadLogoFromS3(logoS3Key, logoPath);
    }

    if (!logoPath) {
      throw new Error('No logo provided (neither S3 key nor local path)');
    }

    // Verify logo exists
    await fs.access(logoPath);

    // Step 2: Extract last frame from last video
    const lastFramePath = path.join(tempDir, 'last_frame.png');
    console.log('[LogoSceneGenerator] Extracting last frame from video...');
    await extractLastFrame(lastVideoPath, lastFramePath);

    // Step 3: Get logo dimensions and calculate scaling
    const logoDims = await getLogoDimensions(logoPath);

    // Scale logo to fit within 40% of video width while maintaining aspect ratio
    const maxLogoWidth = videoWidth * 0.4;
    const logoScale = maxLogoWidth / logoDims.width;
    const scaledLogoWidth = Math.floor(logoDims.width * logoScale);
    const scaledLogoHeight = Math.floor(logoDims.height * logoScale);

    console.log(`[LogoSceneGenerator] Logo dimensions: ${logoDims.width}x${logoDims.height}`);
    console.log(`[LogoSceneGenerator] Scaled logo: ${scaledLogoWidth}x${scaledLogoHeight}`);

    // Step 4: Create the logo scene video using FFmpeg
    // Complex filter breakdown:
    // 1. Create black background video (3 seconds)
    // 2. Overlay last frame, fade it out to black
    // 3. Overlay logo on black background, fade it in
    const command = `ffmpeg \
      -loop 1 -framerate 30 -t ${LOGO_SCENE_DURATION} -i "${lastFramePath}" \
      -loop 1 -framerate 30 -t ${LOGO_SCENE_DURATION} -i "${logoPath}" \
      -f lavfi -t ${LOGO_SCENE_DURATION} -i color=black:s=${videoWidth}x${videoHeight}:r=30 \
      -filter_complex "\
        [0:v]scale=${videoWidth}:${videoHeight}:force_original_aspect_ratio=decrease,pad=${videoWidth}:${videoHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=out:st=0:d=${FADE_TO_BLACK_DURATION}[lastframe];\
        [1:v]scale=${scaledLogoWidth}:${scaledLogoHeight}:force_original_aspect_ratio=decrease,format=rgba,colorchannelmixer=aa=0.9[logo];\
        [2:v][lastframe]overlay=0:0:enable='between(t,0,${FADE_TO_BLACK_DURATION})'[base];\
        [base][logo]overlay=(W-w)/2:(H-h)/2:enable='gte(t,${FADE_TO_BLACK_DURATION})',fade=t=in:st=${FADE_TO_BLACK_DURATION}:d=0.5[out]\
      " \
      -map "[out]" \
      -c:v libx264 -preset medium -crf 23 -r 30 -pix_fmt yuv420p \
      -y "${outputPath}"`;

    console.log('[LogoSceneGenerator] Generating logo scene...');
    console.log(`[LogoSceneGenerator] Command: ${command.substring(0, 200)}...`);

    await execAsync(command);

    // Verify output was created
    await fs.access(outputPath);
    const stats = await fs.stat(outputPath);
    console.log(`[LogoSceneGenerator] Logo scene generated successfully: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // Clean up temp files
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }

    return outputPath;
  } catch (error: any) {
    // Clean up on error
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
    throw new Error(`Logo scene generation failed: ${error.message}`);
  }
}

// ============================================================================
// Export
// ============================================================================

export default {
  generateLogoScene,
};
