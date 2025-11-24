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
  INITIAL_VISIBLE_CARDS: 3,
  LAZY_LOAD_MARGIN: '50px',
  LAZY_LOAD_THRESHOLD: 0.01,
  MAX_REFERENCE_IMAGES: 3,
  IMAGE_POLL_INTERVAL: 2000,
  IMAGE_GENERATION_TIMEOUT: 300000, // 5 minutes
  VIDEO_POLL_INTERVAL: 5000,
  VIDEO_GENERATION_TIMEOUT: 600000, // 10 minutes
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
 * Uses the centralized getPublicUrl utility for consistency
 */
export function formatImageUrl(image: ImageSource | FileReference): string {
  // Handle objects with url/localPath/s3Key
  if ('url' in image || 'localPath' in image || 's3Key' in image) {
    return getPublicUrl({
      s3Key: image.s3Key,
      localPath: image.localPath,
      url: image.url,
    });
  }

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
export function formatSceneNumber(order: number, fallbackIndex?: number): string {
  // Handle NaN, undefined, or invalid values
  if (typeof order !== 'number' || isNaN(order) || order < 0) {
    if (fallbackIndex !== undefined) {
      return String(fallbackIndex + 1);
    }
    return '?';
  }
  
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
