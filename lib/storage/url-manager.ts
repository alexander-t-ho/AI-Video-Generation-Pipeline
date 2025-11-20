/**
 * URL Manager - Centralized URL generation and management
 *
 * This module provides consistent URL generation for all file types,
 * handling both S3 URLs and local serving endpoints.
 */

import { getStorageService } from './storage-service';

// ============================================================================
// Types
// ============================================================================

export interface FileReference {
  s3Key?: string | null;
  localPath?: string | null;
  url?: string | null;
}

export type UrlFormat = 's3' | 'presigned' | 'api' | 'local';

// ============================================================================
// Configuration
// ============================================================================

const S3_BUCKET = process.env.AWS_S3_BUCKET || 'ai-video-pipeline-outputs';
const S3_REGION = process.env.AWS_REGION || 'us-east-1';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';

// ============================================================================
// URL Generation
// ============================================================================

/**
 * Get the public URL for a file
 * Priority: S3 URL > existing URL > API endpoint
 */
export function getPublicUrl(file: FileReference): string {
  // If we have an S3 key, use S3 URL
  if (file.s3Key) {
    return getS3Url(file.s3Key);
  }

  // If we have an existing URL that's already public, use it
  if (file.url && isPublicUrl(file.url)) {
    return file.url;
  }

  // If we have a local path, use the API endpoint
  if (file.localPath) {
    return getApiUrl(file.localPath);
  }

  // Fallback to whatever URL we have
  return file.url || '';
}

/**
 * Get S3 URL for a key
 */
export function getS3Url(s3Key: string): string {
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${s3Key}`;
}

/**
 * Get API endpoint URL for serving local files
 */
export function getApiUrl(localPath: string, type: 'image' | 'video' = 'image'): string {
  const endpoint = type === 'video' ? '/api/serve-video' : '/api/serve-image';
  const encodedPath = encodeURIComponent(localPath);
  return `${APP_URL}${endpoint}?path=${encodedPath}`;
}

/**
 * Get pre-signed URL for temporary access
 */
export async function getPreSignedUrl(s3Key: string, expiresIn: number = 3600): Promise<string> {
  const storageService = getStorageService();
  return storageService.getPreSignedUrl(s3Key, expiresIn);
}

// ============================================================================
// URL Validation
// ============================================================================

/**
 * Check if a URL is already public (S3 or HTTP)
 */
export function isPublicUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * Check if a URL is an S3 URL
 */
export function isS3Url(url: string): boolean {
  return url.includes('.s3.') && url.includes('.amazonaws.com');
}

/**
 * Check if a URL is a local path
 */
export function isLocalPath(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('/api/');
}

/**
 * Check if a URL is an API endpoint
 */
export function isApiUrl(url: string): boolean {
  return url.includes('/api/serve-');
}

// ============================================================================
// URL Conversion
// ============================================================================

/**
 * Extract S3 key from an S3 URL
 */
export function extractS3KeyFromUrl(url: string): string | null {
  if (!isS3Url(url)) return null;

  try {
    const urlObj = new URL(url);
    // Remove leading slash
    return urlObj.pathname.substring(1);
  } catch {
    return null;
  }
}

/**
 * Extract local path from an API URL
 */
export function extractLocalPathFromApiUrl(url: string): string | null {
  if (!isApiUrl(url)) return null;

  try {
    const urlObj = new URL(url, APP_URL);
    const pathParam = urlObj.searchParams.get('path');
    return pathParam ? decodeURIComponent(pathParam) : null;
  } catch {
    return null;
  }
}

/**
 * Convert any file reference to the best available URL
 */
export function normalizeUrl(file: FileReference, preferredFormat?: UrlFormat): string {
  switch (preferredFormat) {
    case 's3':
      if (file.s3Key) return getS3Url(file.s3Key);
      break;
    case 'api':
      if (file.localPath) return getApiUrl(file.localPath);
      break;
    case 'local':
      if (file.localPath) return file.localPath;
      break;
  }

  // Default behavior
  return getPublicUrl(file);
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Convert multiple file references to public URLs
 */
export function getPublicUrls(files: FileReference[]): string[] {
  return files.map(getPublicUrl);
}

/**
 * Normalize URLs in an object (recursively)
 */
export function normalizeUrlsInObject<T extends Record<string, any>>(
  obj: T,
  urlFields: string[] = ['url', 's3Key', 'localPath', 'imageUrl', 'videoUrl']
): T {
  const result: Record<string, any> = { ...obj };

  for (const key of Object.keys(result)) {
    const value = result[key];

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively process nested objects
      result[key] = normalizeUrlsInObject(value, urlFields);
    } else if (Array.isArray(value)) {
      // Process arrays
      result[key] = value.map(item =>
        typeof item === 'object' && item !== null
          ? normalizeUrlsInObject(item, urlFields)
          : item
      );
    }
  }

  // If this object has URL fields, normalize them
  if (result.s3Key || result.localPath || result.url) {
    const publicUrl = getPublicUrl({
      s3Key: result.s3Key,
      localPath: result.localPath,
      url: result.url,
    });

    // Update the url field to the normalized public URL
    if ('url' in result) {
      result.url = publicUrl;
    }
  }

  return result as T;
}

// ============================================================================
// URL Type Detection
// ============================================================================

export type UrlType = 's3' | 'api' | 'local' | 'external' | 'unknown';

/**
 * Detect the type of a URL
 */
export function detectUrlType(url: string): UrlType {
  if (!url) return 'unknown';
  if (isS3Url(url)) return 's3';
  if (isApiUrl(url)) return 'api';
  if (isLocalPath(url)) return 'local';
  if (isPublicUrl(url)) return 'external';
  return 'unknown';
}

// ============================================================================
// Migration Helpers
// ============================================================================

/**
 * Check if a file needs to be migrated to S3
 * Returns true if the file has a local path but no S3 key
 */
export function needsS3Migration(file: FileReference): boolean {
  return !!(file.localPath && !file.s3Key);
}

/**
 * Generate S3 key from local path
 * Converts /tmp/projects/{projectId}/{category}/... to projects/{projectId}/{category}/...
 */
export function generateS3KeyFromLocalPath(localPath: string): string | null {
  const match = localPath.match(/\/tmp\/projects\/(.+)/);
  if (match) {
    return `projects/${match[1]}`;
  }
  return null;
}

export default {
  getPublicUrl,
  getS3Url,
  getApiUrl,
  getPreSignedUrl,
  isPublicUrl,
  isS3Url,
  isLocalPath,
  isApiUrl,
  extractS3KeyFromUrl,
  extractLocalPathFromApiUrl,
  normalizeUrl,
  getPublicUrls,
  normalizeUrlsInObject,
  detectUrlType,
  needsS3Migration,
  generateS3KeyFromLocalPath,
};
