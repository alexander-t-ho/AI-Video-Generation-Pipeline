/**
 * Script to generate a video using Runway Gen-4 Turbo with a specific prompt
 * Usage: tsx scripts/generate-runway-video.ts <imagePathOrUrl>
 * 
 * Can accept:
 * - Local file path: ./path/to/image.jpg
 * - HTTP/HTTPS URL: https://example.com/image.jpg
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { generateVideo } from '@/lib/video/generator';
import { setRuntimeVideoModel } from '@/lib/video/generator';
import { uploadBufferToS3, getS3Url } from '@/lib/storage/s3-uploader';

// Load environment variables
dotenv.config({ path: '.env.local' });

const PROMPT = `Camera stays fixed, white Porsche drives faster and makes a sharp turn through muddy terrain, car accelerates and sharply turns causing massive mud explosion from the ground, wheels spin and grip mud violently as vehicle executes aggressive turn, wet mud and dirt explode upward and outward in dramatic sprays from under the car and wheels, mud erupts from ground in all directions as car powers through sharp turn, intense forward motion with sharp turning movement, mud explodes from ground in dramatic bursts`;

async function uploadLocalImage(imagePath: string): Promise<string> {
  console.log('Uploading local image to S3...');
  
  // Read the file
  const fileBuffer = await fs.readFile(imagePath);
  const filename = path.basename(imagePath);
  
  // Determine content type
  let contentType = 'image/jpeg';
  if (filename.endsWith('.png')) {
    contentType = 'image/png';
  } else if (filename.endsWith('.webp')) {
    contentType = 'image/webp';
  }
  
  // Upload to S3
  const projectId = `runway-video-${Date.now()}`;
  const s3Key = `uploads/${projectId}/${filename}`;
  
  await uploadBufferToS3(fileBuffer, s3Key, contentType, {
    'upload-type': 'runway-video-input',
    'original-filename': filename,
  });
  
  const s3Url = getS3Url(s3Key);
  console.log(`✓ Image uploaded to S3: ${s3Url}`);
  
  return s3Url;
}

async function main() {
  const imagePathOrUrl = process.argv[2];

  if (!imagePathOrUrl) {
    console.error('Usage: tsx scripts/generate-runway-video.ts <imagePathOrUrl>');
    console.error('');
    console.error('Examples:');
    console.error('  tsx scripts/generate-runway-video.ts ./path/to/car.jpg');
    console.error('  tsx scripts/generate-runway-video.ts https://example.com/car.jpg');
    process.exit(1);
  }

  let imageUrl: string;

  // Check if it's a URL or local file path
  if (imagePathOrUrl.startsWith('http://') || imagePathOrUrl.startsWith('https://')) {
    // It's already a URL
    imageUrl = imagePathOrUrl;
    console.log('Using provided image URL');
  } else {
    // It's a local file path - upload it first
    try {
      // Check if file exists
      await fs.access(imagePathOrUrl);
      imageUrl = await uploadLocalImage(imagePathOrUrl);
    } catch (error: any) {
      console.error(`Error: File not found: ${imagePathOrUrl}`);
      console.error('');
      console.error('Please provide either:');
      console.error('  - A valid local file path');
      console.error('  - A valid HTTP/HTTPS URL');
      process.exit(1);
    }
  }

  console.log('');
  console.log('========================================');
  console.log('Runway Gen-4 Turbo Video Generation');
  console.log('========================================');
  console.log('');
  console.log('Image:', imagePathOrUrl);
  console.log('Image URL:', imageUrl);
  console.log('Model: Runway Gen-4 Turbo');
  console.log('Duration: 5 seconds');
  console.log('');
  console.log('Prompt:');
  console.log(PROMPT);
  console.log('');
  console.log('========================================');
  console.log('');

  try {
    // Set model to Runway Gen-4 Turbo
    setRuntimeVideoModel('runwayml/gen4-turbo');
    console.log('✓ Model set to Runway Gen-4 Turbo');

    // Generate video
    const projectId = `runway-video-${Date.now()}`;
    const sceneIndex = 0;
    const duration = 5;

    console.log('Starting video generation...');
    console.log('This may take several minutes...');
    console.log('');

    const result = await generateVideo(
      imageUrl,
      PROMPT,
      undefined, // No seed frame
      projectId,
      sceneIndex,
      undefined // sceneId - not needed for this script
    );
    const videoPath = result.localPath;

    console.log('');
    console.log('========================================');
    console.log('✓ Video generation complete!');
    console.log('========================================');
    console.log('');
    console.log('Video saved to:');
    console.log(videoPath);
    console.log('');
    console.log('You can find it in the "video testing" folder');
    console.log('');
  } catch (error: any) {
    console.error('');
    console.error('========================================');
    console.error('✗ Video generation failed');
    console.error('========================================');
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    if (error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();

