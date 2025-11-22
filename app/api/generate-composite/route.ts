import { NextRequest, NextResponse } from 'next/server';
import { generateImage } from '@/lib/ai/image-generator';
import { setRuntimeImageModel } from '@/lib/ai/image-generator';
import { getStorageService } from '@/lib/storage/storage-service';
import fs from 'fs/promises';
import path from 'path';

interface CompositeImageRequest {
  referenceImageUrl: string; // The subject/car image (foreground)
  backgroundImageUrl: string; // The background image
  prompt?: string; // Optional: Custom prompt for composition
  projectId: string;
  sceneIndex: number;
  seed?: number;
}

interface CompositeImageResponse {
  success: boolean;
  image?: {
    id: string;
    url: string;
    localPath: string;
    s3Key?: string;
    prompt: string;
    replicateId: string;
    createdAt: string;
  };
  error?: string;
  code?: string;
}

/**
 * Check if a URL is an S3 URL
 */
function isS3Url(url: string): boolean {
  const s3UrlPattern = /^https:\/\/[^.]+\.s3\.[^.]+\.amazonaws\.com\//;
  return s3UrlPattern.test(url);
}

/**
 * Upload a local file to S3 and return the S3 URL
 * Required for localhost URLs that Replicate cannot access
 */
async function uploadLocalFileToS3(url: string, projectId: string): Promise<string> {
  try {
    // Parse the URL to get the path
    const urlObj = new URL(url);

    // Only process localhost URLs
    if (!urlObj.hostname.includes('localhost') && !urlObj.hostname.includes('127.0.0.1')) {
      return url; // Not a local URL, return as-is
    }

    // Extract the file path from the URL
    let filePath: string;
    let filename: string;

    if (urlObj.pathname.startsWith('/sample-backgrounds/')) {
      // Public background - read from public directory
      filename = urlObj.pathname.replace('/sample-backgrounds/', '');
      filePath = path.join(process.cwd(), 'public', 'sample-backgrounds', filename);
    } else if (urlObj.pathname.startsWith('/api/serve-image')) {
      // Local file served through API - extract path from query string
      const pathParam = urlObj.searchParams.get('path');
      if (!pathParam) {
        console.warn('[S3 Upload] Could not extract path from serve-image URL');
        return url;
      }
      filePath = pathParam;
      filename = path.basename(pathParam);
    } else {
      // Other local path
      filename = path.basename(urlObj.pathname);
      filePath = path.join(process.cwd(), 'public', urlObj.pathname);
    }

    console.log(`[S3 Upload] Uploading local file to S3: ${filePath}`);

    // Read the file
    const fileBuffer = await fs.readFile(filePath);

    // Detect MIME type from extension
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    };
    const mimeType = mimeTypes[ext] || 'image/jpeg';

    // Upload to S3 using storage service
    const storageService = getStorageService();

    const storedFile = await storageService.storeFile(fileBuffer, {
      projectId: projectId,
      category: 'uploads' as any, // Use uploads category for public backgrounds
      mimeType: mimeType,
      customFilename: `public-bg-${filename}`,
    });

    console.log(`[S3 Upload] Uploaded to S3 successfully: ${storedFile.s3Key}`);

    // Return pre-signed URL
    const s3Url = await storageService.getPreSignedUrl(storedFile.s3Key, 3600); // 1 hour expiry
    console.log(`[S3 Upload] Pre-signed URL generated`);

    return s3Url;
  } catch (error) {
    console.error('[S3 Upload] Failed to upload local file to S3:', error);
    return url; // Return original URL on error
  }
}

/**
 * POST /api/generate-composite
 * Generates a composite image by inserting a reference/subject image into a background
 * using google/nano-banana-pro model
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body: CompositeImageRequest = await request.json();

    // Validate request
    if (!body.referenceImageUrl || !body.backgroundImageUrl || !body.projectId || body.sceneIndex === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: referenceImageUrl, backgroundImageUrl, projectId, sceneIndex',
          code: 'VALIDATION_ERROR',
        } as CompositeImageResponse,
        { status: 400 }
      );
    }

    // Set model to nano-banana-pro for compositing
    setRuntimeImageModel('google/nano-banana-pro');
    console.log(`[Composite API] Using google/nano-banana-pro model for image composition`);

    // Create default or use custom prompt
    const prompt = body.prompt ||
      'Insert the foreground subject into this background scene. Match the lighting, shadows, and perspective. Make it look natural and photorealistic. Preserve all details of the subject.';

    // Use provided seed or generate a random one
    const seed = body.seed !== undefined ? body.seed : Math.floor(Math.random() * 10000);

    console.log(`[Composite API] Starting composition process`);
    console.log(`[Composite API] Reference (foreground): ${body.referenceImageUrl.substring(0, 80)}...`);
    console.log(`[Composite API] Background: ${body.backgroundImageUrl.substring(0, 80)}...`);
    console.log(`[Composite API] Seed: ${seed}${body.seed !== undefined ? ' (user-specified)' : ' (random)'}`);
    console.log(`[Composite API] Prompt: "${prompt}"`);

    // Ensure both images are accessible (generate pre-signed URLs if needed)
    const storageService = getStorageService();

    let referenceUrl = body.referenceImageUrl;
    let backgroundUrl = body.backgroundImageUrl;

    // Get the base URL from the request for converting relative URLs to absolute
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const host = request.headers.get('host') || 'localhost:3000';
    const baseUrl = `${protocol}://${host}`;

    // Convert relative URLs to absolute URLs
    if (referenceUrl.startsWith('/')) {
      referenceUrl = `${baseUrl}${referenceUrl}`;
      console.log(`[Composite API] Converted reference URL to absolute: ${referenceUrl}`);
    }

    if (backgroundUrl.startsWith('/')) {
      backgroundUrl = `${baseUrl}${backgroundUrl}`;
      console.log(`[Composite API] Converted background URL to absolute: ${backgroundUrl}`);
    }

    // Upload localhost files to S3 (Replicate cannot access localhost)
    referenceUrl = await uploadLocalFileToS3(referenceUrl, body.projectId);
    backgroundUrl = await uploadLocalFileToS3(backgroundUrl, body.projectId);

    // Generate pre-signed URLs for S3 images that aren't already pre-signed
    // (Skip if URL already has AWS signature parameters from uploadLocalFileToS3)
    if (isS3Url(referenceUrl) && !referenceUrl.includes('X-Amz-Signature')) {
      try {
        // Extract S3 key from URL (before any query parameters)
        const s3Key = referenceUrl.split('.amazonaws.com/')[1]?.split('?')[0];
        if (s3Key) {
          referenceUrl = await storageService.getPreSignedUrl(s3Key, 3600);
          console.log(`[Composite API] Generated pre-signed URL for reference image`);
        }
      } catch (error) {
        console.warn(`[Composite API] Failed to generate pre-signed URL for reference:`, error);
      }
    }

    if (isS3Url(backgroundUrl) && !backgroundUrl.includes('X-Amz-Signature')) {
      try {
        // Extract S3 key from URL (before any query parameters)
        const s3Key = backgroundUrl.split('.amazonaws.com/')[1]?.split('?')[0];
        if (s3Key) {
          backgroundUrl = await storageService.getPreSignedUrl(s3Key, 3600);
          console.log(`[Composite API] Generated pre-signed URL for background image`);
        }
      } catch (error) {
        console.warn(`[Composite API] Failed to generate pre-signed URL for background:`, error);
      }
    }

    // Generate composite image using google/nano-banana-pro
    // The reference image (foreground/car) is the seed image
    // The background is passed as a reference image
    // nano-banana-pro will composite them together
    const generatedImage = await generateImage(
      prompt,
      body.projectId,
      body.sceneIndex,
      referenceUrl, // Reference/foreground as seed image
      [backgroundUrl], // Background as reference image
      undefined, // No IP adapter scale override
      seed // Seed for reproducibility
    );

    const endTime = Date.now();
    console.log(`[Composite API] Composition completed in ${(endTime - startTime) / 1000}s`);
    console.log(`[Composite API] Seed used: ${seed} (save this to reproduce results)`);

    // Generate a pre-signed URL for the result to ensure it's accessible immediately
    let accessibleUrl = generatedImage.url;
    try {
      if (generatedImage.s3Key) {
        accessibleUrl = await storageService.getPreSignedUrl(generatedImage.s3Key, 3600); // 1 hour expiry
        console.log(`[Composite API] Generated pre-signed URL for composite image`);
      }
    } catch (error) {
      console.warn(`[Composite API] Failed to generate pre-signed URL:`, error);
    }

    return NextResponse.json({
      success: true,
      image: {
        ...generatedImage,
        url: accessibleUrl
      },
    } as CompositeImageResponse);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('[Composite API] Error:', errorMessage);

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        code: 'GENERATION_FAILED',
      } as CompositeImageResponse,
      { status: 500 }
    );
  }
}
