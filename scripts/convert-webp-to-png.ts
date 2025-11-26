/**
 * Convert WebP Images to PNG in Database
 *
 * This script finds all images stored as .webp in the database,
 * converts them to PNG format, uploads to S3, and updates the database records.
 */

import { PrismaClient } from '@prisma/client';
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import path from 'path';

const prisma = new PrismaClient();

interface ConversionStats {
  converted: number;
  deleted: number;
  failed: number;
}

// ============================================================================
// S3 Client Setup
// ============================================================================

function createS3Client(): S3Client {
  const region = process.env.AWS_REGION || 'us-east-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS credentials not found in environment variables');
  }

  return new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
}

const BUCKET = process.env.AWS_S3_BUCKET || 'ai-video-pipeline-outputs';

// ============================================================================
// Helper Functions
// ============================================================================

async function checkS3ObjectExists(s3Key: string): Promise<boolean> {
  const s3Client = createS3Client();
  
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
    });
    await s3Client.send(command);
    return true;
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

async function downloadFromS3(s3Key: string): Promise<Buffer> {
  const s3Client = createS3Client();
  
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
  });

  const response = await s3Client.send(command);
  const stream = response.Body;

  if (!stream) {
    throw new Error(`Failed to download from S3: ${s3Key}`);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of stream as any) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function uploadToS3(buffer: Buffer, s3Key: string, mimeType: string): Promise<void> {
  const s3Client = createS3Client();

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    Body: buffer,
    ContentType: mimeType,
  });

  await s3Client.send(command);
}

async function convertWebpToPng(webpBuffer: Buffer): Promise<Buffer> {
  return sharp(webpBuffer)
    .png()
    .toBuffer();
}

function replaceExtension(s3Key: string, newExt: string): string {
  const parsed = path.parse(s3Key);
  return path.join(parsed.dir, parsed.name + newExt);
}

// ============================================================================
// Conversion Functions
// ============================================================================

async function convertCarMedia(dryRun: boolean): Promise<ConversionStats> {
  console.log('\n📸 Processing CarMedia table...');
  console.log('─'.repeat(60));

  const webpMedia = await prisma.carMedia.findMany({
    where: {
      mimeType: 'image/webp',
    },
  });

  console.log(`Found ${webpMedia.length} .webp images in CarMedia`);

  if (webpMedia.length === 0) {
    return { converted: 0, deleted: 0, failed: 0 };
  }

  const stats: ConversionStats = { converted: 0, deleted: 0, failed: 0 };

  for (const media of webpMedia) {
    try {
      console.log(`\n  Processing: ${media.filename} (${media.s3Key})`);

      // Check if S3 object exists
      const exists = await checkS3ObjectExists(media.s3Key);
      
      if (!exists) {
        console.log(`    ⚠️  S3 file not found - removing from database`);
        
        if (!dryRun) {
          await prisma.carMedia.delete({
            where: { id: media.id },
          });
          console.log(`    🗑️  Deleted database record`);
        } else {
          console.log(`    [DRY RUN] Would delete database record`);
        }
        
        stats.deleted++;
        continue;
      }

      if (!dryRun) {
        // Download from S3
        const webpBuffer = await downloadFromS3(media.s3Key);
        console.log(`    Downloaded: ${(webpBuffer.length / 1024).toFixed(2)} KB`);

        // Convert to PNG
        const pngBuffer = await convertWebpToPng(webpBuffer);
        console.log(`    Converted: ${(pngBuffer.length / 1024).toFixed(2)} KB`);

        // Generate new S3 key with .png extension
        const newS3Key = replaceExtension(media.s3Key, '.png');
        const newFilename = replaceExtension(media.filename, '.png');

        // Upload to S3
        await uploadToS3(pngBuffer, newS3Key, 'image/png');
        console.log(`    Uploaded to: ${newS3Key}`);

        // Update database record
        await prisma.carMedia.update({
          where: { id: media.id },
          data: {
            s3Key: newS3Key,
            filename: newFilename,
            mimeType: 'image/png',
            size: pngBuffer.length,
          },
        });

        console.log(`    ✅ Updated database record`);
      } else {
        console.log(`    [DRY RUN] Would convert to PNG`);
      }

      stats.converted++;
    } catch (error: any) {
      console.error(`    ❌ Failed: ${error.message}`);
      stats.failed++;
    }
  }

  return stats;
}

async function convertCompanyAssets(dryRun: boolean): Promise<ConversionStats> {
  console.log('\n🏢 Processing CompanyAsset table...');
  console.log('─'.repeat(60));

  const webpAssets = await prisma.companyAsset.findMany({
    where: {
      mimeType: 'image/webp',
    },
  });

  console.log(`Found ${webpAssets.length} .webp images in CompanyAsset`);

  if (webpAssets.length === 0) {
    return { converted: 0, deleted: 0, failed: 0 };
  }

  const stats: ConversionStats = { converted: 0, deleted: 0, failed: 0 };

  for (const asset of webpAssets) {
    try {
      console.log(`\n  Processing: ${asset.filename || 'unnamed'} (${asset.s3Key || 'no key'})`);

      if (!asset.s3Key) {
        console.log(`    ⚠️  No S3 key - removing from database`);
        
        if (!dryRun) {
          await prisma.companyAsset.delete({
            where: { id: asset.id },
          });
          console.log(`    🗑️  Deleted database record`);
        } else {
          console.log(`    [DRY RUN] Would delete database record`);
        }
        
        stats.deleted++;
        continue;
      }

      // Check if S3 object exists
      const exists = await checkS3ObjectExists(asset.s3Key);
      
      if (!exists) {
        console.log(`    ⚠️  S3 file not found - removing from database`);
        
        if (!dryRun) {
          await prisma.companyAsset.delete({
            where: { id: asset.id },
          });
          console.log(`    🗑️  Deleted database record`);
        } else {
          console.log(`    [DRY RUN] Would delete database record`);
        }
        
        stats.deleted++;
        continue;
      }

      if (!dryRun) {
        // Download from S3
        const webpBuffer = await downloadFromS3(asset.s3Key);
        console.log(`    Downloaded: ${(webpBuffer.length / 1024).toFixed(2)} KB`);

        // Convert to PNG
        const pngBuffer = await convertWebpToPng(webpBuffer);
        console.log(`    Converted: ${(pngBuffer.length / 1024).toFixed(2)} KB`);

        // Generate new S3 key with .png extension
        const newS3Key = replaceExtension(asset.s3Key, '.png');
        const newFilename = asset.filename ? replaceExtension(asset.filename, '.png') : null;

        // Upload to S3
        await uploadToS3(pngBuffer, newS3Key, 'image/png');
        console.log(`    Uploaded to: ${newS3Key}`);

        // Update database record
        await prisma.companyAsset.update({
          where: { id: asset.id },
          data: {
            s3Key: newS3Key,
            filename: newFilename,
            mimeType: 'image/png',
            size: pngBuffer.length,
          },
        });

        console.log(`    ✅ Updated database record`);
      } else {
        console.log(`    [DRY RUN] Would convert to PNG`);
      }

      stats.converted++;
    } catch (error: any) {
      console.error(`    ❌ Failed: ${error.message}`);
      stats.failed++;
    }
  }

  return stats;
}

async function convertFileStorage(dryRun: boolean): Promise<ConversionStats> {
  console.log('\n📦 Processing FileStorage table...');
  console.log('─'.repeat(60));

  const webpFiles = await prisma.fileStorage.findMany({
    where: {
      mimeType: 'image/webp',
      isDeleted: false,
    },
  });

  console.log(`Found ${webpFiles.length} .webp images in FileStorage`);

  if (webpFiles.length === 0) {
    return { converted: 0, deleted: 0, failed: 0 };
  }

  const stats: ConversionStats = { converted: 0, deleted: 0, failed: 0 };

  for (const file of webpFiles) {
    try {
      console.log(`\n  Processing: ${file.s3Key}`);

      // Check if S3 object exists
      const exists = await checkS3ObjectExists(file.s3Key);
      
      if (!exists) {
        console.log(`    ⚠️  S3 file not found - marking as deleted in database`);
        
        if (!dryRun) {
          await prisma.fileStorage.update({
            where: { id: file.id },
            data: {
              isDeleted: true,
              deletedAt: new Date(),
            },
          });
          console.log(`    🗑️  Marked as deleted in database`);
        } else {
          console.log(`    [DRY RUN] Would mark as deleted`);
        }
        
        stats.deleted++;
        continue;
      }

      if (!dryRun) {
        // Download from S3
        const webpBuffer = await downloadFromS3(file.s3Key);
        console.log(`    Downloaded: ${(webpBuffer.length / 1024).toFixed(2)} KB`);

        // Convert to PNG
        const pngBuffer = await convertWebpToPng(webpBuffer);
        console.log(`    Converted: ${(pngBuffer.length / 1024).toFixed(2)} KB`);

        // Generate new S3 key with .png extension
        const newS3Key = replaceExtension(file.s3Key, '.png');
        const newLocalPath = file.localPath ? replaceExtension(file.localPath, '.png') : null;

        // Upload to S3
        await uploadToS3(pngBuffer, newS3Key, 'image/png');
        console.log(`    Uploaded to: ${newS3Key}`);

        // Update database record
        await prisma.fileStorage.update({
          where: { id: file.id },
          data: {
            s3Key: newS3Key,
            localPath: newLocalPath,
            mimeType: 'image/png',
            size: pngBuffer.length,
          },
        });

        console.log(`    ✅ Updated database record`);
      } else {
        console.log(`    [DRY RUN] Would convert to PNG`);
      }

      stats.converted++;
    } catch (error: any) {
      console.error(`    ❌ Failed: ${error.message}`);
      stats.failed++;
    }
  }

  return stats;
}

async function convertProcessedImageVersions(dryRun: boolean): Promise<ConversionStats> {
  console.log('\n🎨 Processing ProcessedImageVersion table...');
  console.log('─'.repeat(60));

  const webpVersions = await prisma.processedImageVersion.findMany({
    where: {
      mimeType: 'image/webp',
    },
  });

  console.log(`Found ${webpVersions.length} .webp images in ProcessedImageVersion`);

  if (webpVersions.length === 0) {
    return { converted: 0, deleted: 0, failed: 0 };
  }

  const stats: ConversionStats = { converted: 0, deleted: 0, failed: 0 };

  for (const version of webpVersions) {
    try {
      console.log(`\n  Processing: ${version.s3Key}`);

      // Check if S3 object exists
      const exists = await checkS3ObjectExists(version.s3Key);
      
      if (!exists) {
        console.log(`    ⚠️  S3 file not found - removing from database`);
        
        if (!dryRun) {
          await prisma.processedImageVersion.delete({
            where: { id: version.id },
          });
          console.log(`    🗑️  Deleted database record`);
        } else {
          console.log(`    [DRY RUN] Would delete database record`);
        }
        
        stats.deleted++;
        continue;
      }

      if (!dryRun) {
        // Download from S3
        const webpBuffer = await downloadFromS3(version.s3Key);
        console.log(`    Downloaded: ${(webpBuffer.length / 1024).toFixed(2)} KB`);

        // Convert to PNG
        const pngBuffer = await convertWebpToPng(webpBuffer);
        console.log(`    Converted: ${(pngBuffer.length / 1024).toFixed(2)} KB`);

        // Generate new S3 key with .png extension
        const newS3Key = replaceExtension(version.s3Key, '.png');
        const newLocalPath = version.localPath ? replaceExtension(version.localPath, '.png') : null;

        // Upload to S3
        await uploadToS3(pngBuffer, newS3Key, 'image/png');
        console.log(`    Uploaded to: ${newS3Key}`);

        // Update database record
        await prisma.processedImageVersion.update({
          where: { id: version.id },
          data: {
            s3Key: newS3Key,
            localPath: newLocalPath,
            mimeType: 'image/png',
            size: pngBuffer.length,
          },
        });

        console.log(`    ✅ Updated database record`);
      } else {
        console.log(`    [DRY RUN] Would convert to PNG`);
      }

      stats.converted++;
    } catch (error: any) {
      console.error(`    ❌ Failed: ${error.message}`);
      stats.failed++;
    }
  }

  return stats;
}

// ============================================================================
// Main Function
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('🔄 WebP to PNG Conversion Script');
  console.log('═'.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`S3 Bucket: ${BUCKET}`);
  console.log('═'.repeat(60));

  if (dryRun) {
    console.log('\n⚠️  DRY RUN MODE - No actual changes will be made\n');
  }

  try {
    const carMediaStats = await convertCarMedia(dryRun);
    const companyAssetStats = await convertCompanyAssets(dryRun);
    const fileStorageStats = await convertFileStorage(dryRun);
    const processedImageStats = await convertProcessedImageVersions(dryRun);

    const totalConverted = carMediaStats.converted + companyAssetStats.converted + 
                          fileStorageStats.converted + processedImageStats.converted;
    const totalDeleted = carMediaStats.deleted + companyAssetStats.deleted + 
                        fileStorageStats.deleted + processedImageStats.deleted;
    const totalFailed = carMediaStats.failed + companyAssetStats.failed + 
                       fileStorageStats.failed + processedImageStats.failed;

    // Summary
    console.log('\n');
    console.log('═'.repeat(60));
    console.log('🏁 Processing Complete!');
    console.log('═'.repeat(60));
    console.log('\nCarMedia:');
    console.log(`  Converted: ${carMediaStats.converted}`);
    console.log(`  Deleted: ${carMediaStats.deleted}`);
    console.log(`  Failed: ${carMediaStats.failed}`);
    
    console.log('\nCompanyAsset:');
    console.log(`  Converted: ${companyAssetStats.converted}`);
    console.log(`  Deleted: ${companyAssetStats.deleted}`);
    console.log(`  Failed: ${companyAssetStats.failed}`);
    
    console.log('\nFileStorage:');
    console.log(`  Converted: ${fileStorageStats.converted}`);
    console.log(`  Deleted: ${fileStorageStats.deleted}`);
    console.log(`  Failed: ${fileStorageStats.failed}`);
    
    console.log('\nProcessedImageVersion:');
    console.log(`  Converted: ${processedImageStats.converted}`);
    console.log(`  Deleted: ${processedImageStats.deleted}`);
    console.log(`  Failed: ${processedImageStats.failed}`);
    
    console.log('\n' + '─'.repeat(60));
    console.log('TOTALS:');
    console.log(`  Converted: ${totalConverted}`);
    console.log(`  Deleted/Marked as Deleted: ${totalDeleted}`);
    console.log(`  Failed: ${totalFailed}`);
    console.log('═'.repeat(60));

    if (dryRun) {
      console.log('\n💡 Run without --dry-run to actually perform the operations');
    }
  } catch (error) {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('\n✨ All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });

