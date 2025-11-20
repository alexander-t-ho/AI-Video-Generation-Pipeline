/**
 * Thumbnail Service - Generates and caches image thumbnails
 *
 * Uses Sharp for efficient image resizing and caches thumbnails locally
 * to improve media drawer performance.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';

// ============================================================================
// Constants
// ============================================================================

const THUMBNAIL_CACHE_DIR = '/tmp/thumbnails';

// Thumbnail sizes for different use cases
export const THUMBNAIL_SIZES = {
  small: { width: 150, height: 150 },   // Grid thumbnails
  medium: { width: 300, height: 300 },  // Larger grid items
  large: { width: 600, height: 600 },   // Preview modal
} as const;

export type ThumbnailSize = keyof typeof THUMBNAIL_SIZES;

// Default quality for JPEG thumbnails
const THUMBNAIL_QUALITY = 80;

// ============================================================================
// Types
// ============================================================================

interface ThumbnailOptions {
  size?: ThumbnailSize;
  format?: 'jpeg' | 'webp' | 'png';
  quality?: number;
}

interface ThumbnailResult {
  path: string;
  width: number;
  height: number;
  size: number;
  format: string;
  cached: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a hash for the source file to use as cache key
 */
function generateCacheKey(sourcePath: string, options: ThumbnailOptions): string {
  const size = options.size || 'medium';
  const format = options.format || 'jpeg';

  // Use file path + mtime for cache invalidation
  const hash = crypto
    .createHash('md5')
    .update(`${sourcePath}-${size}-${format}`)
    .digest('hex');

  return `${hash}-${size}.${format}`;
}

/**
 * Ensure cache directory exists
 */
async function ensureCacheDir(projectId?: string): Promise<string> {
  const cacheDir = projectId
    ? path.join(THUMBNAIL_CACHE_DIR, projectId)
    : THUMBNAIL_CACHE_DIR;

  await fs.mkdir(cacheDir, { recursive: true });
  return cacheDir;
}

/**
 * Check if cached thumbnail exists and is valid
 */
async function getCachedThumbnail(
  cachePath: string,
  sourceModTime?: Date
): Promise<boolean> {
  try {
    const stats = await fs.stat(cachePath);

    // If source mod time is provided, check if cache is stale
    if (sourceModTime && stats.mtime < sourceModTime) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Generate a thumbnail for an image
 * Returns cached version if available, otherwise generates and caches
 */
export async function generateThumbnail(
  sourcePath: string,
  projectId?: string,
  options: ThumbnailOptions = {}
): Promise<ThumbnailResult> {
  const size = options.size || 'medium';
  const format = options.format || 'jpeg';
  const quality = options.quality || THUMBNAIL_QUALITY;

  const dimensions = THUMBNAIL_SIZES[size];

  // Generate cache key and path
  const cacheKey = generateCacheKey(sourcePath, options);
  const cacheDir = await ensureCacheDir(projectId);
  const cachePath = path.join(cacheDir, cacheKey);

  // Check if we have a valid cached version
  let sourceStats;
  try {
    sourceStats = await fs.stat(sourcePath);
  } catch {
    throw new Error(`Source image not found: ${sourcePath}`);
  }

  const isCached = await getCachedThumbnail(cachePath, sourceStats.mtime);

  if (isCached) {
    const cachedStats = await fs.stat(cachePath);
    return {
      path: cachePath,
      width: dimensions.width,
      height: dimensions.height,
      size: cachedStats.size,
      format,
      cached: true,
    };
  }

  // Generate new thumbnail
  try {
    let pipeline = sharp(sourcePath)
      .resize(dimensions.width, dimensions.height, {
        fit: 'cover',
        position: 'center',
      });

    // Apply format-specific options
    if (format === 'jpeg') {
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
    } else if (format === 'webp') {
      pipeline = pipeline.webp({ quality });
    } else if (format === 'png') {
      pipeline = pipeline.png({ compressionLevel: 9 });
    }

    // Write to cache
    await pipeline.toFile(cachePath);

    const newStats = await fs.stat(cachePath);

    return {
      path: cachePath,
      width: dimensions.width,
      height: dimensions.height,
      size: newStats.size,
      format,
      cached: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to generate thumbnail: ${errorMessage}`);
  }
}

/**
 * Get thumbnail path if it exists, without generating
 */
export async function getThumbnailPath(
  sourcePath: string,
  projectId?: string,
  options: ThumbnailOptions = {}
): Promise<string | null> {
  const cacheKey = generateCacheKey(sourcePath, options);
  const cacheDir = projectId
    ? path.join(THUMBNAIL_CACHE_DIR, projectId)
    : THUMBNAIL_CACHE_DIR;
  const cachePath = path.join(cacheDir, cacheKey);

  try {
    await fs.access(cachePath);
    return cachePath;
  } catch {
    return null;
  }
}

/**
 * Clear thumbnail cache for a project
 */
export async function clearProjectThumbnails(projectId: string): Promise<number> {
  const cacheDir = path.join(THUMBNAIL_CACHE_DIR, projectId);

  try {
    const files = await fs.readdir(cacheDir);

    for (const file of files) {
      await fs.unlink(path.join(cacheDir, file));
    }

    await fs.rmdir(cacheDir);
    return files.length;
  } catch {
    return 0;
  }
}

/**
 * Clear all thumbnail cache
 */
export async function clearAllThumbnails(): Promise<number> {
  let totalCleared = 0;

  try {
    const entries = await fs.readdir(THUMBNAIL_CACHE_DIR, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(THUMBNAIL_CACHE_DIR, entry.name);

      if (entry.isDirectory()) {
        const files = await fs.readdir(fullPath);
        for (const file of files) {
          await fs.unlink(path.join(fullPath, file));
          totalCleared++;
        }
        await fs.rmdir(fullPath);
      } else {
        await fs.unlink(fullPath);
        totalCleared++;
      }
    }
  } catch {
    // Directory might not exist
  }

  return totalCleared;
}

/**
 * Get thumbnail cache stats
 */
export async function getThumbnailCacheStats(): Promise<{
  totalFiles: number;
  totalBytes: number;
  byProject: Record<string, { files: number; bytes: number }>;
}> {
  const stats = {
    totalFiles: 0,
    totalBytes: 0,
    byProject: {} as Record<string, { files: number; bytes: number }>,
  };

  try {
    const entries = await fs.readdir(THUMBNAIL_CACHE_DIR, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(THUMBNAIL_CACHE_DIR, entry.name);

      if (entry.isDirectory()) {
        const projectStats = { files: 0, bytes: 0 };
        const files = await fs.readdir(fullPath);

        for (const file of files) {
          const filePath = path.join(fullPath, file);
          const fileStats = await fs.stat(filePath);
          projectStats.files++;
          projectStats.bytes += fileStats.size;
        }

        stats.byProject[entry.name] = projectStats;
        stats.totalFiles += projectStats.files;
        stats.totalBytes += projectStats.bytes;
      }
    }
  } catch {
    // Directory might not exist
  }

  return stats;
}

// ============================================================================
// Export
// ============================================================================

export default {
  generateThumbnail,
  getThumbnailPath,
  clearProjectThumbnails,
  clearAllThumbnails,
  getThumbnailCacheStats,
  THUMBNAIL_SIZES,
};
