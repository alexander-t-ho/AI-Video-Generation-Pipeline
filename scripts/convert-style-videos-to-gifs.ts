/**
 * Convert Style Videos to Optimized GIFs
 * 
 * This script converts the three style videos to small, optimized GIFs
 * that can be served directly with the website for fast loading.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

interface VideoConfig {
  input: string;
  output: string;
  name: string;
  startTime?: string; // Optional: start time in format HH:MM:SS or SS
  duration?: string;  // Optional: duration in seconds
}

const VIDEOS: VideoConfig[] = [
  {
    name: 'Whimsical (Wes Anderson)',
    input: '/Users/alexismanyrath/Code/AI-Video-Generation-Pipeline/alexis-docs/wes anderson/wes-anderson.mp4',
    output: '/Users/alexismanyrath/Code/AI-Video-Generation-Pipeline/public/styles/whimsical.gif',
    duration: '5', // 5 seconds
  },
  {
    name: 'Luxury',
    input: '/Users/alexismanyrath/Code/AI-Video-Generation-Pipeline/alexis-docs/porsheluxurytest.mp4',
    output: '/Users/alexismanyrath/Code/AI-Video-Generation-Pipeline/public/styles/luxury.gif',
    duration: '5',
  },
  {
    name: 'Offroad',
    input: '/Users/alexismanyrath/Code/AI-Video-Generation-Pipeline/alexis-docs/porsheoffroad.mp4',
    output: '/Users/alexismanyrath/Code/AI-Video-Generation-Pipeline/public/styles/offroad.gif',
    duration: '5',
  },
];

async function convertToGif(config: VideoConfig): Promise<void> {
  console.log(`Converting: ${config.name}`);
  console.log(`  Input: ${config.input}`);
  console.log(`  Output: ${config.output}`);

  // Create output directory if it doesn't exist
  const outputDir = path.dirname(config.output);
  await fs.mkdir(outputDir, { recursive: true });

  // Build FFmpeg command for high-quality, optimized GIF
  // Uses:
  // - fps=15: 15 frames per second (good balance of smoothness and size)
  // - scale=480:-1: Width of 480px, height auto-calculated to maintain aspect ratio
  // - split for palette generation (creates better colors)
  // - flags=lanczos: High-quality scaling algorithm
  
  let ffmpegCmd = `ffmpeg -i "${config.input}"`;
  
  // Add start time if specified
  if (config.startTime) {
    ffmpegCmd += ` -ss ${config.startTime}`;
  }
  
  // Add duration if specified
  if (config.duration) {
    ffmpegCmd += ` -t ${config.duration}`;
  }
  
  // High-quality GIF generation with palette
  ffmpegCmd += ` -vf "fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" -loop 0 "${config.output}" -y`;

  try {
    console.log(`  Executing FFmpeg...`);
    const { stdout, stderr } = await execAsync(ffmpegCmd);
    
    // Get file size
    const stats = await fs.stat(config.output);
    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
    
    console.log(`  ✓ Successfully converted ${config.name}`);
    console.log(`  Size: ${fileSizeMB} MB\n`);
  } catch (error: any) {
    console.error(`  ERROR converting ${config.name}:`, error.message);
    console.error();
    throw error;
  }
}

async function main() {
  console.log('Converting style videos to optimized GIFs...\n');
  
  // Check if FFmpeg is available
  try {
    await execAsync('ffmpeg -version');
  } catch (error) {
    console.error('ERROR: FFmpeg is not installed or not in PATH');
    console.error('Please install FFmpeg: brew install ffmpeg');
    process.exit(1);
  }

  // Convert all videos
  for (const video of VIDEOS) {
    try {
      await convertToGif(video);
    } catch (error) {
      console.error(`Failed to convert ${video.name}, continuing with next video...`);
    }
  }

  console.log('Conversion complete!');
  console.log('\nGIFs are now available at:');
  VIDEOS.forEach(v => {
    const relativePath = path.relative(process.cwd(), v.output);
    console.log(`  - ${relativePath}`);
  });
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

