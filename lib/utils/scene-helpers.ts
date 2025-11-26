/**
 * Scene Helper Utilities
 *
 * Shared utilities for scene card operations including image lookups,
 * URL formatting, and constants.
 */

import { GeneratedImage, SeedFrame } from '@/lib/types';
import { UploadedImage, ProcessedImage } from '@/lib/storage/image-storage';
import { getPublicUrl, FileReference } from '@/lib/storage/url-manager';

// ============================================================================
// Constants
// ============================================================================

export const SCENE_CONSTANTS = {
  INITIAL_VISIBLE_CARDS: 10, // Increased to 10 to support up to 10 scenes without lazy loading
  LAZY_LOAD_MARGIN: '50px',
  LAZY_LOAD_THRESHOLD: 0.01,
  MAX_REFERENCE_IMAGES: 3,
  IMAGE_POLL_INTERVAL: 2000,
  IMAGE_GENERATION_TIMEOUT: 600000, // 10 minutes
  VIDEO_POLL_INTERVAL: 5000,
  VIDEO_GENERATION_TIMEOUT: 1200000, // 20 minutes
} as const;

// ============================================================================
// Types
// ============================================================================

export type ImageSource = UploadedImage | ProcessedImage | GeneratedImage | SeedFrame;

export interface ImageSearchContext {
  uploadedImages?: UploadedImage[];
  scenes: Array<{
    generatedImages?: GeneratedImage[];
    seedFrames?: SeedFrame[];
  }>;
}

// ============================================================================
// URL Utilities
// ============================================================================

/**
 * Formats an image object to a serveable URL
 * Always proxies through API for consistent access (S3 URLs may not be publicly accessible)
 */
export function formatImageUrl(image: ImageSource | FileReference): string {
  // Handle objects with url/localPath/s3Key
  if ('url' in image || 'localPath' in image || 's3Key' in image) {
    // Priority: localPath > url > s3Key
    if (image.localPath) {
      // Use local path through API
      return `/api/serve-image?path=${encodeURIComponent(image.localPath)}`;
    } else if (image.url) {
      // Check if it's already an API URL
      if (image.url.startsWith('/api')) {
        return image.url;
      }
      // Check if it's a remote URL (S3, Replicate, etc.)
      if (image.url.startsWith('http://') || image.url.startsWith('https://')) {
        // Proxy through API using 'url' parameter for remote URLs
        return `/api/serve-image?url=${encodeURIComponent(image.url)}`;
      }
      // Relative path - treat as local file
      return `/api/serve-image?path=${encodeURIComponent(image.url)}`;
    } else if (image.s3Key) {
      // Convert S3 key to full S3 URL and proxy through API
      const s3Url = `https://${process.env.AWS_S3_BUCKET || 'ai-video-pipeline-outputs'}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${image.s3Key}`;
      return `/api/serve-image?url=${encodeURIComponent(s3Url)}`;
    }
  }

  console.warn('[formatImageUrl] Could not format image URL - no valid url/localPath/s3Key found:', image);
  return '';
}

/**
 * Validates and formats a URL string
 * Converts local paths to serveable URLs
 */
export function validateAndFormatUrl(url: string | undefined | null): string | undefined {
  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    return undefined;
  }

  const trimmedUrl = url.trim();

  // Already a public URL or API endpoint
  if (
    trimmedUrl.startsWith('http://') ||
    trimmedUrl.startsWith('https://') ||
    trimmedUrl.startsWith('/api')
  ) {
    return trimmedUrl;
  }

  // Local path - convert to API endpoint
  return `/api/serve-image?path=${encodeURIComponent(trimmedUrl)}`;
}

// ============================================================================
// Image Search Utilities
// ============================================================================

/**
 * Finds an image by ID across multiple sources
 * Searches: uploaded images → processed versions → generated images
 */
export function findImageById(
  imageId: string,
  context: ImageSearchContext
): ImageSource | null {
  // Search uploaded images and their processed versions
  if (context.uploadedImages) {
    for (const uploadedImage of context.uploadedImages) {
      if (uploadedImage.id === imageId) {
        return uploadedImage;
      }

      // Check processed versions
      if (uploadedImage.processedVersions) {
        const processed = uploadedImage.processedVersions.find(
          (p) => p.id === imageId
        );
        if (processed) {
          return processed;
        }
      }
    }
  }

  // Search generated images from all scenes
  for (const scene of context.scenes) {
    if (scene.generatedImages) {
      const foundImg = scene.generatedImages.find((img) => img.id === imageId);
      if (foundImg) {
        return foundImg;
      }
    }

    // Also check seed frames
    if (scene.seedFrames) {
      const foundFrame = scene.seedFrames.find((frame) => frame.id === imageId);
      if (foundFrame) {
        return foundFrame;
      }
    }
  }

  return null;
}

/**
 * Finds an image by ID and returns its formatted URL
 */
export function findImageUrlById(
  imageId: string,
  context: ImageSearchContext
): string | null {
  const image = findImageById(imageId, context);
  if (!image) {
    return null;
  }
  return formatImageUrl(image);
}

// ============================================================================
// Scene Number Formatting
// ============================================================================

/**
 * Formats a scene order number for display
 * Handles both integer and decimal scene orders
 *
 * @example
 * formatSceneNumber(0) => "1"
 * formatSceneNumber(1.5) => "2.5"
 */
export function formatSceneNumber(order: number): string {
  if (order % 1 === 0) {
    return String(order + 1);
  }
  return `${Math.floor(order) + 1}.${Math.round((order % 1) * 10)}`;
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validates an array of custom image URLs
 * Returns only valid, formatted URLs
 */
export function validateCustomImageUrls(urls: (string | null | undefined)[]): string[] {
  const validUrls: string[] = [];

  for (const url of urls) {
    const formatted = validateAndFormatUrl(url);
    if (formatted) {
      validUrls.push(formatted);
    }
  }

  return validUrls;
}
