#!/usr/bin/env tsx

/**
 * Car Media Upload Script
 *
 * Uploads car model media files from local filesystem to S3 and tracks them
 * in the database using the CarMedia model.
 *
 * Expected folder structure:
 * input-folder/
 *   ├── Mustang/
 *   │   ├── 2024-GT/
 *   │   │   ├── exterior/
 *   │   │   │   ├── front.jpg
 *   │   │   │   └── side.jpg
 *   │   │   └── interior/
 *   │   │       └── dashboard.jpg
 *   │   └── 2024-Base/
 *   │       └── exterior/
 *   │           └── front.jpg
 *
 * Usage:
 * npx tsx scripts/upload-car-media.ts --input ./path/to/cars --company-id <uuid> [--dry-run]
 */

import { PrismaClient, CarMediaType, Prisma } from '@prisma/client';
import { uploadToS3, uploadBufferToS3, getS3Url } from '@/lib/storage/s3-uploader';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

// ============================================================================
// Types
// ============================================================================

interface ParsedArgs {
  input: string;
  companyId: string;
  dryRun: boolean;
  help: boolean;
}

interface MediaFile {
  filePath: string;
  modelName: string;
  variantInfo: {
    year: number;
    trim: string;
  };
  mediaType: CarMediaType;
  filename: string;
  size: number;
  mimeType: string;
}

interface UploadResult {
  success: boolean;
  filePath: string;
  s3Key?: string;
  error?: string;
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const parsed: Partial<ParsedArgs> = {
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--input':
      case '-i':
        parsed.input = args[i + 1];
        i++; // Skip next arg
        break;
      case '--company-id':
      case '-c':
        parsed.companyId = args[i + 1];
        i++; // Skip next arg
        break;
      case '--dry-run':
      case '-d':
        parsed.dryRun = true;
        break;
      case '--help':
      case '-h':
        parsed.help = true;
        break;
      default:
        if (arg.startsWith('--')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }

  return parsed as ParsedArgs;
}

function validateArgs(args: ParsedArgs): void {
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.input) {
    console.error('Error: --input is required');
    printHelp();
    process.exit(1);
  }

  if (!args.companyId) {
    console.error('Error: --company-id is required');
    printHelp();
    process.exit(1);
  }

  // Validate UUID format for companyId
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(args.companyId)) {
    console.error('Error: --company-id must be a valid UUID');
    process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
Car Media Upload Script

Uploads car model media files from local filesystem to S3 and tracks them in the database.

Expected folder structure:
  input-folder/
    ├── Mustang/
    │   ├── 2024-GT/
    │   │   ├── exterior/
    │   │   │   ├── front.jpg
    │   │   │   └── side.jpg
    │   │   └── interior/
    │   │       └── dashboard.jpg
    │   └── 2024-Base/
    │       └── exterior/
    │           └── front.jpg

Usage:
  npx tsx scripts/upload-car-media.ts --input ./path/to/cars --company-id <uuid> [--dry-run]

Options:
  -i, --input <path>       Input directory containing car media folders
  -c, --company-id <uuid>  Company UUID for database tracking
  -d, --dry-run           Preview what would be uploaded without actually uploading
  -h, --help              Show this help message

Examples:
  npx tsx scripts/upload-car-media.ts --input ./car-photos --company-id 123e4567-e89b-12d3-a456-426614174000
  npx tsx scripts/upload-car-media.ts --input ./cars --company-id 123e4567-e89b-12d3-a456-426614174000 --dry-run
`);
}

// ============================================================================
// File System Operations
// ============================================================================

async function scanMediaFiles(inputDir: string): Promise<MediaFile[]> {
  const mediaFiles: MediaFile[] = [];

  async function scanDirectory(dirPath: string, currentPath: string[] = []): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await scanDirectory(fullPath, [...currentPath, entry.name]);
      } else if (entry.isFile()) {
        const mediaFile = await parseMediaFile(fullPath, [...currentPath, entry.name]);
        if (mediaFile) {
          mediaFiles.push(mediaFile);
        }
      }
    }
  }

  await scanDirectory(inputDir);
  return mediaFiles;
}

async function parseMediaFile(filePath: string, pathSegments: string[]): Promise<MediaFile | null> {
  // Expected path structure: [modelName, variantInfo, mediaType, filename]
  // e.g., ['Mustang', '2024-GT', 'exterior', 'front.jpg']

  if (pathSegments.length < 3) {
    console.warn(`Skipping ${filePath}: invalid path structure (expected at least 3 levels)`);
    return null;
  }

  const [modelName, variantStr, mediaTypeStr, ...rest] = pathSegments;
  const filename = rest.length > 0 ? path.join(...rest) : path.basename(filePath);

  // Parse variant info (year-trim format)
  const variantMatch = variantStr.match(/^(\d{4})-(.+)$/);
  if (!variantMatch) {
    console.warn(`Skipping ${filePath}: invalid variant format "${variantStr}" (expected "YYYY-Trim")`);
    return null;
  }

  const year = parseInt(variantMatch[1], 10);
  const trim = variantMatch[2];

  // Parse media type
  let mediaType: CarMediaType;
  switch (mediaTypeStr.toLowerCase()) {
    case 'exterior':
      mediaType = 'EXTERIOR';
      break;
    case 'interior':
      mediaType = 'INTERIOR';
      break;
    case 'sound':
      mediaType = 'SOUND';
      break;
    case 'three_d_model':
    case '3d_model':
    case '3d':
      mediaType = 'THREE_D_MODEL';
      break;
    default:
      console.warn(`Skipping ${filePath}: unknown media type "${mediaTypeStr}"`);
      return null;
  }

  // Validate file extension
  const ext = path.extname(filename).toLowerCase();
  const validExtensions = getValidExtensions(mediaType);
  if (!validExtensions.includes(ext)) {
    console.warn(`Skipping ${filePath}: invalid extension "${ext}" for type "${mediaType}" (valid: ${validExtensions.join(', ')})`);
    return null;
  }

  // Get file stats
  const stats = await fs.stat(filePath);
  const mimeType = getMimeType(ext);

  return {
    filePath,
    modelName,
    variantInfo: { year, trim },
    mediaType,
    filename,
    size: stats.size,
    mimeType,
  };
}

function getValidExtensions(mediaType: CarMediaType): string[] {
  switch (mediaType) {
    case 'EXTERIOR':
    case 'INTERIOR':
      return ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    case 'SOUND':
      return ['.mp3', '.wav', '.m4a', '.aac'];
    case 'THREE_D_MODEL':
      return ['.obj', '.fbx', '.gltf', '.glb', '.dae', '.blend'];
    default:
      return [];
  }
}

function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.obj': 'model/obj',
    '.fbx': 'application/octet-stream',
    '.gltf': 'model/gltf+json',
    '.glb': 'model/gltf-binary',
    '.dae': 'model/vnd.collada+xml',
    '.blend': 'application/octet-stream',
  };

  return mimeTypes[extension] || 'application/octet-stream';
}

// ============================================================================
// Database Operations
// ============================================================================

async function getOrCreateCarModel(
  prisma: PrismaClient,
  companyId: string,
  modelName: string
): Promise<string> {
  // Try to find existing model
  let model = await prisma.carModel.findFirst({
    where: {
      companyId,
      name: modelName,
    },
  });

  // Create if not found
  if (!model) {
    model = await prisma.carModel.create({
      data: {
        companyId,
        name: modelName,
      },
    });
    console.log(`Created car model: ${modelName} (${model.id})`);
  } else {
    console.log(`Found existing car model: ${modelName} (${model.id})`);
  }

  return model.id;
}

async function getOrCreateCarVariant(
  prisma: PrismaClient,
  modelId: string,
  year: number,
  trim: string
): Promise<string> {
  const variantKey = `${year}-${trim}`;

  // Try to find existing variant
  let variant = await prisma.carVariant.findFirst({
    where: {
      modelId,
      year,
      trim,
    },
  });

  // Create if not found
  if (!variant) {
    variant = await prisma.carVariant.create({
      data: {
        modelId,
        year,
        trim,
      },
    });
    console.log(`Created car variant: ${variantKey} (${variant.id})`);
  } else {
    console.log(`Found existing car variant: ${variantKey} (${variant.id})`);
  }

  return variant.id;
}

async function checkExistingMedia(
  prisma: PrismaClient,
  variantId: string,
  mediaType: CarMediaType,
  filename: string
): Promise<boolean> {
  const existing = await prisma.carMedia.findFirst({
    where: {
      variantId,
      type: mediaType,
      filename,
    },
  });

  return !!existing;
}

// ============================================================================
// Main Upload Logic
// ============================================================================

async function uploadMediaFile(
  prisma: PrismaClient,
  mediaFile: MediaFile,
  companyId: string,
  dryRun: boolean
): Promise<UploadResult> {
  const result: UploadResult = {
    success: false,
    filePath: mediaFile.filePath,
  };

  try {
    console.log(`Processing: ${mediaFile.modelName} > ${mediaFile.variantInfo.year}-${mediaFile.variantInfo.trim} > ${mediaFile.mediaType} > ${mediaFile.filename}`);

    if (dryRun) {
      console.log(`  Would create database records and upload to S3`);
      result.success = true;
      return result;
    }

    // Get or create car model
    const modelId = await getOrCreateCarModel(prisma, companyId, mediaFile.modelName);

    // Get or create car variant
    const variantId = await getOrCreateCarVariant(
      prisma,
      modelId,
      mediaFile.variantInfo.year,
      mediaFile.variantInfo.trim
    );

    // Check for existing media
    const exists = await checkExistingMedia(prisma, variantId, mediaFile.mediaType, mediaFile.filename);
    if (exists) {
      console.log(`  Skipping: media already exists in database`);
      result.success = true;
      return result;
    }

    // Upload to S3
    const timestamp = Date.now();
    const sanitizedFilename = mediaFile.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const bucket = process.env.AWS_S3_BUCKET || 'ai-video-pipeline-outputs';
    const s3Key = `cars/${companyId}/${modelId}/${variantId}/${mediaFile.mediaType.toLowerCase()}/${timestamp}-${sanitizedFilename}`;

    console.log(`  Uploading to S3 (Bucket: ${bucket}): ${s3Key}`);
    
    // Read file buffer
    const fileBuffer = await fs.readFile(mediaFile.filePath);
    
    await uploadBufferToS3(fileBuffer, s3Key, mediaFile.mimeType);

    // Create database record
    await prisma.carMedia.create({
      data: {
        variantId,
        type: mediaFile.mediaType,
        s3Key,
        filename: mediaFile.filename,
        mimeType: mediaFile.mimeType,
        size: mediaFile.size,
      },
    });

    console.log(`  Successfully uploaded and tracked in database`);
    result.success = true;
    result.s3Key = s3Key;

  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error';
    console.error(`  Error: ${errorMessage}`);
    result.error = errorMessage;
  }

  return result;
}

// ============================================================================
// Main Function
// ============================================================================

async function main() {
  const args = parseArgs();
  validateArgs(args);

  console.log('=== Car Media Upload Script ===\n');

  if (args.dryRun) {
    console.log('DRY RUN MODE - No actual uploads will be performed\n');
  }

  // Initialize Prisma client
  const prisma = new PrismaClient();

  try {
    // Verify company exists (skip in dry-run mode)
    if (!args.dryRun) {
      const company = await prisma.company.findUnique({
        where: { id: args.companyId },
      });

      if (!company) {
        console.error(`Error: Company with ID "${args.companyId}" not found`);
        process.exit(1);
      }

      console.log(`Using company: ${company.name} (${company.id})\n`);
    } else {
      console.log(`Using company ID: ${args.companyId} (dry-run mode)\n`);
    }

    // Scan media files
    console.log(`Scanning directory: ${args.input}`);
    const mediaFiles = await scanMediaFiles(args.input);
    console.log(`Found ${mediaFiles.length} media files\n`);

    if (mediaFiles.length === 0) {
      console.log('No valid media files found. Check your folder structure and file types.');
      return;
    }

    // Process each file
    const results: UploadResult[] = [];
    let processed = 0;

    for (const mediaFile of mediaFiles) {
      const result = await uploadMediaFile(prisma, mediaFile, args.companyId, args.dryRun);
      results.push(result);
      processed++;

      if (processed % 10 === 0 || processed === mediaFiles.length) {
        console.log(`Processed ${processed}/${mediaFiles.length} files...`);
      }
    }

    // Print summary
    console.log('\n=== Upload Summary ===');

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`Total files: ${results.length}`);
    console.log(`Successful: ${successful}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) {
      console.log('\nFailed files:');
      results
        .filter(r => !r.success)
        .forEach(r => {
          console.log(`  - ${r.filePath}: ${r.error}`);
        });
    }

    if (!args.dryRun && successful > 0) {
      console.log('\nNote: Files have been uploaded to S3 and tracked in the database.');
      console.log('Use the generated S3 URLs to access the uploaded media.');
    }

  } catch (error: any) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
