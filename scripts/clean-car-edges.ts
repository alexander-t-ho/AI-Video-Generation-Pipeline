/**
 * Script to clean edges on all Mazda, Miata, and Jeep images in the database
 *
 * This script:
 * 1. Fetches all Mazda, Miata, and Jeep car variants from the database
 * 2. Processes each image through the clean-edges API
 * 3. Updates the database with the cleaned image S3 keys
 *
 * Usage: npx tsx scripts/clean-car-edges.ts
 */

import prisma from '../lib/db/prisma';
import { getStorageService } from '../lib/storage/storage-service';

// API endpoint for edge cleanup
const getCleanEdgesUrl = () => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    // Add https:// if not present
    const fullUrl = appUrl.startsWith('http') ? appUrl : `https://${appUrl}`;
    return `${fullUrl}/api/clean-edges`;
  }
  return 'http://localhost:3000/api/clean-edges';
};

const CLEAN_EDGES_API = getCleanEdgesUrl();

interface CleanEdgesResponse {
  success: boolean;
  processedImages?: Array<{
    id: string;
    url: string;
    s3Key?: string;
  }>;
  error?: string;
}

/**
 * Clean edges for a single image
 */
async function cleanImageEdges(imageUrl: string, projectId: string): Promise<string | null> {
  try {
    console.log(`  Cleaning edges for: ${imageUrl.substring(0, 80)}...`);

    const response = await fetch(CLEAN_EDGES_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageUrls: [imageUrl],
        projectId: projectId,
        iterations: 1,
      }),
    });

    const data: CleanEdgesResponse = await response.json();

    if (!response.ok || !data.success || !data.processedImages || data.processedImages.length === 0) {
      throw new Error(data.error || 'Failed to clean edges');
    }

    const cleanedImage = data.processedImages[0];
    console.log(`  ✓ Cleaned successfully. New S3 key: ${cleanedImage.s3Key}`);

    return cleanedImage.s3Key || null;

  } catch (error) {
    console.error(`  ✗ Failed to clean image:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚗 Starting car image edge cleanup...');
  console.log(`📡 API Endpoint: ${CLEAN_EDGES_API}\n`);

  const storageService = getStorageService();

  // Fetch all car models that are Mazda, Miata, Jeep, or Wrangler
  const carModels = await prisma.carModel.findMany({
    where: {
      OR: [
        { name: { contains: 'Mazda', mode: 'insensitive' } },
        { name: { contains: 'Miata', mode: 'insensitive' } },
        { name: { contains: 'Jeep', mode: 'insensitive' } },
        { name: { contains: 'Wrangler', mode: 'insensitive' } },
      ],
    },
    include: {
      variants: {
        include: {
          media: true,
        },
      },
    },
  });

  if (carModels.length === 0) {
    console.log('No Mazda, Miata, Jeep, or Wrangler models found in database.');
    return;
  }

  console.log(`Found ${carModels.length} car model(s):\n`);

  let totalImages = 0;
  let successfulCleanups = 0;
  let failedCleanups = 0;

  // Process each car model
  for (const model of carModels) {
    console.log(`\n📦 Processing: ${model.name}`);
    console.log(`   Found ${model.variants.length} variant(s)\n`);

    // Process each variant
    for (const variant of model.variants) {
      console.log(`  🔧 Variant: ${variant.trim} (${variant.year})`);
      console.log(`     Media items: ${variant.media.length}`);

      // Process each media item
      for (const media of variant.media) {
        totalImages++;

        // Generate signed URL for the original image
        let imageUrl = media.s3Key;

        if (!media.s3Key.startsWith('http')) {
          try {
            imageUrl = await storageService.getPreSignedUrl(media.s3Key, 3600);
          } catch (e) {
            console.warn(`     ⚠ Failed to generate signed URL for ${media.s3Key}, using key directly`);
            // Try direct S3 URL as fallback
            const bucket = process.env.AWS_S3_BUCKET || 'ai-video-pipeline-outputs';
            const region = process.env.AWS_REGION || 'us-east-1';
            imageUrl = `https://${bucket}.s3.${region}.amazonaws.com/${media.s3Key}`;
          }
        }

        // Clean the image edges
        const cleanedS3Key = await cleanImageEdges(
          imageUrl,
          `edge-cleanup-${model.id}-${variant.id}`
        );

        if (cleanedS3Key) {
          // Update the database with the new S3 key
          try {
            await prisma.carMedia.update({
              where: { id: media.id },
              data: { s3Key: cleanedS3Key },
            });
            console.log(`     ✓ Database updated with new S3 key`);
            successfulCleanups++;
          } catch (updateError) {
            console.error(`     ✗ Failed to update database:`, updateError);
            failedCleanups++;
          }
        } else {
          failedCleanups++;
        }

        // Add a small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  console.log('\n\n' + '='.repeat(60));
  console.log('✨ Edge cleanup complete!');
  console.log('='.repeat(60));
  console.log(`Total images processed: ${totalImages}`);
  console.log(`Successful cleanups: ${successfulCleanups}`);
  console.log(`Failed cleanups: ${failedCleanups}`);
  console.log('='.repeat(60) + '\n');
}

// Run the script
main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
