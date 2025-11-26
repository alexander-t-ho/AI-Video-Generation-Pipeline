/**
 * In-Memory Cache for Videos and Images
 * 
 * Provides caching for frequently accessed media files to reduce disk I/O
 * and improve performance. Includes LRU eviction and TTL expiration.
 */

interface CacheEntry {
  buffer: Buffer;
  timestamp: number;
  size: number;
}

interface ImageCacheEntry extends CacheEntry {
  contentType: string;
}

class MediaCache {
  private cache = new Map<string, CacheEntry>();
  private maxSizeBytes: number;
  private maxFileSize: number;
  private currentSizeBytes = 0;
  private ttl: number;

  constructor(maxSizeMB: number, maxFileSizeMB: number, ttlMinutes: number) {
    this.maxSizeBytes = maxSizeMB * 1024 * 1024;
    this.maxFileSize = maxFileSizeMB * 1024 * 1024;
    this.ttl = ttlMinutes * 60 * 1000;
  }

  get(path: string): Buffer | null {
    const entry = this.cache.get(path);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.delete(path);
      return null;
    }

    return entry.buffer;
  }

  set(path: string, buffer: Buffer): void {
    const fileSizeMB = buffer.length / 1024 / 1024;

    // Don't cache very large files
    if (buffer.length > this.maxFileSize) {
      console.log(`[MediaCache] Skipping: file too large (${fileSizeMB.toFixed(1)}MB)`);
      return;
    }

    // Remove old entry if exists
    this.delete(path);

    // Make room if needed (evict oldest until we have space)
    while (this.currentSizeBytes + buffer.length > this.maxSizeBytes && this.cache.size > 0) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) break; // Safety check (shouldn't happen since we check size > 0)
      const oldest = this.cache.get(oldestKey);
      if (oldest) {
        console.log(`[MediaCache] Evicting: ${oldestKey} (${(oldest.size / 1024 / 1024).toFixed(1)}MB)`);
      }
      this.delete(oldestKey);
    }

    // Only cache if it fits
    if (buffer.length <= this.maxSizeBytes) {
      this.cache.set(path, {
        buffer,
        timestamp: Date.now(),
        size: buffer.length,
      });
      this.currentSizeBytes += buffer.length;
      console.log(`[MediaCache] Cached: ${path} (${fileSizeMB.toFixed(1)}MB) - Total: ${(this.currentSizeBytes / 1024 / 1024).toFixed(1)}MB`);
    }
  }

  delete(path: string): void {
    const entry = this.cache.get(path);
    if (entry) {
      this.currentSizeBytes -= entry.size;
      this.cache.delete(path);
    }
  }

  getStats() {
    return {
      entries: this.cache.size,
      sizeBytes: this.currentSizeBytes,
      sizeMB: (this.currentSizeBytes / 1024 / 1024).toFixed(2),
      maxSizeMB: (this.maxSizeBytes / 1024 / 1024).toFixed(0),
    };
  }
}

class ImageCache {
  private cache = new Map<string, ImageCacheEntry>();
  private maxEntries = 100;
  private ttl = 15 * 60 * 1000; // 15 minutes

  get(key: string): { buffer: Buffer; contentType: string } | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return { buffer: entry.buffer, contentType: entry.contentType };
  }

  set(key: string, buffer: Buffer, contentType: string): void {
    // Simple FIFO eviction
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        console.log(`[ImageCache] Evicting: ${oldestKey}`);
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      buffer,
      contentType,
      timestamp: Date.now(),
      size: buffer.length,
    });
    console.log(`[ImageCache] Cached: ${key} (${(buffer.length / 1024).toFixed(1)}KB) - Total: ${this.cache.size} images`);
  }

  getStats() {
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += entry.buffer.length;
    }
    return {
      entries: this.cache.size,
      maxEntries: this.maxEntries,
      sizeBytes: totalSize,
      sizeMB: (totalSize / 1024 / 1024).toFixed(2),
    };
  }
}

// Singleton instances
export const videoCache = new MediaCache(500, 100, 10); // 500MB max, 100MB per file, 10min TTL
export const imageCache = new ImageCache();  // 100 entries max, 15min TTL

