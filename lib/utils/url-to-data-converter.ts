/**
 * URL to Data Converter
 * 
 * Converts URLs (S3, local paths) to formats that AI models can access:
 * 1. Try presigned URL first (for S3 URLs)
 * 2. Fall back to base64 data URL if presigned URL fails or for local files
 */

import fs from 'fs';
import { getPresignedUrl } from '@/lib/storage/s3-uploader';

// ============================================================================
// Types
// ============================================================================

export interface ConversionResult {
  url: string;
  method: 'presigned' | 'base64' | 'direct';
  originalUrl: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract S3 key from an S3 URL
 * @param s3Url - S3 URL (e.g., https://bucket.s3.region.amazonaws.com/path/to/file)
 * @returns S3 key (e.g., path/to/file) or null if not a valid S3 URL
 */
function extractS3Key(s3Url: string): string | null {
  try {
    // Match S3 URL patterns:
    // - https://bucket.s3.region.amazonaws.com/key
    // - https://s3.region.amazonaws.com/bucket/key
    const url = new URL(s3Url);
    
    // Pattern 1: bucket.s3.region.amazonaws.com/key
    if (url.hostname.includes('.s3.') && url.hostname.includes('.amazonaws.com')) {
      return url.pathname.substring(1); // Remove leading slash
    }
    
    // Pattern 2: s3.region.amazonaws.com/bucket/key
    if (url.hostname.startsWith('s3.') && url.hostname.includes('.amazonaws.com')) {
      const parts = url.pathname.substring(1).split('/');
      if (parts.length > 1) {
        return parts.slice(1).join('/'); // Remove bucket name
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a URL is an S3 URL
 */
function isS3Url(url: string): boolean {
  return url.includes('s3.amazonaws.com') || url.includes('.s3.');
}

/**
 * Check if a URL is a local file path
 */
function isLocalPath(url: string): boolean {
  return url.startsWith('/tmp') || url.startsWith('./') || url.startsWith('../') || !url.startsWith('http');
}

/**
 * Get MIME type from file path or URL
 */
function getMimeType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg'; // Default
}

/**
 * Convert local file to base64 data URL
 */
function localFileToBase64(filePath: string): string {
  const imageBuffer = fs.readFileSync(filePath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = getMimeType(filePath);
  return `data:${mimeType};base64,${base64Image}`;
}

/**
 * Download URL and convert to base64 data URL
 */
async function urlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64Image = buffer.toString('base64');
  const mimeType = getMimeType(url);
  
  return `data:${mimeType};base64,${base64Image}`;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Convert URL to a format accessible by AI models
 * 
 * Strategy:
 * 1. For S3 URLs: Try presigned URL first, fall back to base64
 * 2. For local paths: Convert to base64
 * 3. For other URLs: Return as-is (assume publicly accessible)
 * 
 * @param url - URL or local path to convert
 * @param forceBase64 - Force base64 conversion even for S3 URLs
 * @returns Conversion result with URL and method used
 */
export async function convertUrlForAI(
  url: string,
  forceBase64: boolean = false
): Promise<ConversionResult> {
  const logPrefix = '[URLConverter]';
  
  // Handle local file paths
  if (isLocalPath(url)) {
    try {
      console.log(`${logPrefix} Converting local path to base64: ${url.substring(0, 50)}...`);
      const base64Url = localFileToBase64(url);
      return {
        url: base64Url,
        method: 'base64',
        originalUrl: url,
      };
    } catch (error) {
      console.error(`${logPrefix} Failed to convert local path to base64:`, error);
      throw new Error(`Failed to read local file: ${url}`);
    }
  }
  
  // Handle S3 URLs
  if (isS3Url(url)) {
    // If not forcing base64, try presigned URL first
    if (!forceBase64) {
      try {
        const s3Key = extractS3Key(url);
        if (s3Key) {
          console.log(`${logPrefix} Generating presigned URL for S3 key: ${s3Key.substring(0, 50)}...`);
          const presignedUrl = await getPresignedUrl(s3Key, 3600); // 1 hour expiration
          console.log(`${logPrefix} Successfully generated presigned URL`);
          return {
            url: presignedUrl,
            method: 'presigned',
            originalUrl: url,
          };
        }
      } catch (error) {
        console.warn(`${logPrefix} Failed to generate presigned URL, falling back to base64:`, error);
      }
    }
    
    // Fall back to base64 conversion
    try {
      console.log(`${logPrefix} Downloading S3 URL and converting to base64: ${url.substring(0, 50)}...`);
      const base64Url = await urlToBase64(url);
      console.log(`${logPrefix} Successfully converted to base64 (${(base64Url.length / 1024).toFixed(2)} KB)`);
      return {
        url: base64Url,
        method: 'base64',
        originalUrl: url,
      };
    } catch (error) {
      console.error(`${logPrefix} Failed to convert S3 URL to base64:`, error);
      throw new Error(`Failed to download and convert S3 URL: ${url}`);
    }
  }
  
  // For other URLs, assume they're publicly accessible
  console.log(`${logPrefix} Using URL directly (assumed publicly accessible): ${url.substring(0, 50)}...`);
  return {
    url,
    method: 'direct',
    originalUrl: url,
  };
}

/**
 * Convert multiple URLs in batch
 * 
 * @param urls - Array of URLs to convert
 * @param forceBase64 - Force base64 conversion even for S3 URLs
 * @returns Array of conversion results
 */
export async function convertUrlsForAI(
  urls: string[],
  forceBase64: boolean = false
): Promise<ConversionResult[]> {
  const results: ConversionResult[] = [];
  
  for (const url of urls) {
    try {
      const result = await convertUrlForAI(url, forceBase64);
      results.push(result);
    } catch (error) {
      console.error('[URLConverter] Failed to convert URL:', url, error);
      // Skip failed conversions rather than failing the entire batch
    }
  }
  
  return results;
}

/**
 * Validate that a URL can be accessed by AI models
 * Tests if a presigned URL or direct URL is accessible
 * 
 * @param url - URL to validate
 * @returns true if accessible, false otherwise
 */
export async function validateUrlAccess(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

