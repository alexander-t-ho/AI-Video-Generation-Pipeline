/**
 * Upload Style Videos to S3
 * 
 * This script uploads the three style reference videos to S3 at assets/style/
 */

import { uploadBufferToS3 } from '../lib/storage/s3-uploader';
import fs from 'fs/promises';
import path from 'path';

const STYLE_VIDEOS = [
  {
    localPath: '/Users/alexismanyrath/Code/AI-Video-Generation-Pipeline/alexis-docs/wes anderson/wes-anderson.mp4',
    s3Key: 'assets/style/wes-anderson.mp4',
    name: 'Whimsical (Wes Anderson)',
  },
  {
    localPath: '/Users/alexismanyrath/Code/AI-Video-Generation-Pipeline/alexis-docs/porsheluxurytest.mp4',
    s3Key: 'assets/style/porsheluxurytest.mp4',
    name: 'Luxury',
  },
  {
    localPath: '/Users/alexismanyrath/Code/AI-Video-Generation-Pipeline/alexis-docs/porsheoffroad.mp4',
    s3Key: 'assets/style/porsheoffroad.mp4',
    name: 'Offroad',
  },
];

async function uploadStyleVideos() {
  console.log('Starting style video uploads to S3...\n');

  for (const video of STYLE_VIDEOS) {
    try {
      console.log(`Uploading: ${video.name}`);
      console.log(`  Local: ${video.localPath}`);
      console.log(`  S3 Key: ${video.s3Key}`);

      // Check if file exists
      try {
        await fs.access(video.localPath);
      } catch {
        console.error(`  ERROR: File not found at ${video.localPath}`);
        continue;
      }

      // Read file buffer
      const fileBuffer = await fs.readFile(video.localPath);
      const fileSizeMB = (fileBuffer.length / 1024 / 1024).toFixed(2);
      console.log(`  Size: ${fileSizeMB} MB`);

      // Upload to S3
      await uploadBufferToS3(fileBuffer, video.s3Key, 'video/mp4', {
        'style-name': video.name,
        'uploaded-by': 'upload-style-videos-script',
      });

      console.log(`  ✓ Successfully uploaded ${video.name}\n`);
    } catch (error) {
      console.error(`  ERROR uploading ${video.name}:`, error);
      console.error();
    }
  }

  console.log('Style video upload complete!');
}

// Run the upload
uploadStyleVideos().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

