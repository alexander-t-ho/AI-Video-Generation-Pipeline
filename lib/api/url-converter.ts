/**
 * URL Converter - Unified URL conversion for API routes
 * Handles conversion of local paths, S3 URLs (presigned with base64 fallback), and API URLs
 * 
 * BACKWARD COMPATIBLE: Maintains existing API while adding presigned URL support
 */

import { uploadToS3, getS3Url, getPresignedUrl } from '@/lib/storage/s3-uploader';
import path from 'path';

const NGROK_URL = process.env.NGROK_URL || 'http://localhost:3000';
const USE_PRESIGNED_URLS = process.env.USE_PRESIGNED_URLS !== 'false'; // Default to true

// ============================================================================
// MIME Type Detection
// ============================================================================

export function getContentType(url: string): string {
  const ext = path.extname(url).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  return mimeTypes[ext] || 'image/png';
}

// ============================================================================
// URL Conversion
// ============================================================================

/**
 * Helper to extract S3 key from S3 URL
 */
function extractS3Key(s3Url: string): string | null {
  try {
    const url = new URL(s3Url);
    
    // Pattern: bucket.s3.region.amazonaws.com/key
    if (url.hostname.includes('.s3.') && url.hostname.includes('.amazonaws.com')) {
      return url.pathname.substring(1);
    }
    
    // Pattern: s3.region.amazonaws.com/bucket/key
    if (url.hostname.startsWith('s3.') && url.hostname.includes('.amazonaws.com')) {
      const parts = url.pathname.substring(1).split('/');
      if (parts.length > 1) {
        return parts.slice(1).join('/');
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Converts any URL/path to a publicly accessible format
 * BACKWARD COMPATIBLE: Tries presigned URL first, falls back to base64
 */
export async function convertToPublicUrl(url: string, projectId: string): Promise<string> {
  // S3 URLs - try presigned URL first, fall back to base64
  if (url.includes('s3.amazonaws.com') || url.includes('s3.')) {
    // Try presigned URL first (if enabled)
    if (USE_PRESIGNED_URLS) {
      try {
        const s3Key = extractS3Key(url);
        if (s3Key) {
          console.log(`[URL Converter] Generating presigned URL for S3 key: ${s3Key.substring(0, 50)}...`);
          const presignedUrl = await getPresignedUrl(s3Key, 3600);
          console.log(`[URL Converter] Successfully generated presigned URL`);
          return presignedUrl;
        }
      } catch (presignedError: any) {
        console.warn(`[URL Converter] Failed to generate presigned URL, falling back to base64:`, presignedError.message);
      }
    }
    
    // Fall back to base64 conversion
    try {
      console.log(`[URL Converter] Downloading S3 image for base64 conversion: ${url.substring(0, 80)}...`);
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[URL Converter] Failed to download S3 image (${response.status}), using ngrok fallback`);
        return `${NGROK_URL}/api/serve-image?path=${encodeURIComponent(url)}`;
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Image = buffer.toString('base64');
      const mimeType = url.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const dataUrl = `data:${mimeType};base64,${base64Image}`;
      console.log(`[URL Converter] Converted S3 to base64 (${(base64Image.length / 1024).toFixed(2)} KB)`);
      return dataUrl;
    } catch (error: any) {
      console.error(`[URL Converter] Failed to convert S3 URL:`, error.message);
      return `${NGROK_URL}/api/serve-image?path=${encodeURIComponent(url)}`;
    }
  }
  
  // Already a public URL (external, non-S3)
  if (url.startsWith('https://') || (url.startsWith('http://') && !url.includes('localhost'))) {
    return url;
  }
  
  // Local file paths - convert to base64
  if (url.startsWith('/tmp') || url.startsWith('./') || (!url.startsWith('/api') && !url.startsWith('http'))) {
    try {
      const fs = await import('fs/promises');
      const fileBuffer = await fs.readFile(url);
      const base64Image = fileBuffer.toString('base64');
      const mimeType = url.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const dataUrl = `data:${mimeType};base64,${base64Image}`;
      console.log(`[URL Converter] Converted local path to base64: ${url.substring(0, 50)}... (${(base64Image.length / 1024).toFixed(2)} KB)`);
      return dataUrl;
    } catch (localError: any) {
      console.warn(`[URL Converter] Failed to read local file, trying S3 upload: ${localError.message}`);
      
      // Fallback: S3 upload
      try {
        const s3Key = await uploadToS3(url, projectId, {
          contentType: getContentType(url),
        });
        const s3Url = getS3Url(s3Key);
        console.log(`[URL Converter] Uploaded to S3: ${url.substring(0, 50)}... -> ${s3Url.substring(0, 80)}...`);
        
        // Recursively convert S3 URL to base64
        return convertToPublicUrl(s3Url, projectId);
      } catch (s3Error: any) {
        const publicUrl = `${NGROK_URL}/api/serve-image?path=${encodeURIComponent(url)}`;
        console.warn(`[URL Converter] S3 upload failed, using fallback: ${s3Error.message}`);
        return publicUrl;
      }
    }
  }
  
  // API paths - make absolute
  if (url.startsWith('/api/')) {
    const publicUrl = `${NGROK_URL}${url}`;
    if (publicUrl.includes('localhost')) {
      console.warn(`[URL Converter] WARNING: Using localhost URL - external services may not access it: ${publicUrl}`);
    }
    return publicUrl;
  }
  
  return url;
}

/**
 * Converts multiple URLs in parallel
 */
export async function convertUrlsToPublic(
  urls: string[],
  projectId: string
): Promise<string[]> {
  return Promise.all(urls.map(url => convertToPublicUrl(url, projectId)));
}

/**
 * Formats URL for logging (truncates base64)
 */
export function formatUrlForLogging(url: string, maxLength: number = 80): string {
  if (url.startsWith('data:')) {
    return `[base64 data, ${(url.length / 1024).toFixed(2)} KB]`;
  }
  return url.length > maxLength ? url.substring(0, maxLength) + '...' : url;
}

