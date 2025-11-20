/**
 * URL Converter - Advanced URL Processing for AI Services
 *
 * This module handles URL conversion for AI image generation services,
 * including S3 to base64 conversion, local file handling, and parallel processing.
 */

import path from 'path';
import { uploadToS3, getS3Url } from '../storage/s3-uploader';

const NGROK_URL = process.env.NGROK_URL || 'http://localhost:3000';

// ============================================================================
// MIME Type Detection
// ============================================================================

/**
 * Gets MIME type from file extension
 * OPTIMIZATION: Centralized function instead of inline conditionals
 */
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
// URL Conversion Functions
// ============================================================================

/**
 * Converts local paths to public URLs (S3 or ngrok)
 * OPTIMIZATION: Extracted from handler to avoid recreation on every request
 *
 * @param url Original URL or local path
 * @param projectId Project ID for S3 organization
 * @returns Public URL accessible by external services (Replicate, etc.)
 */
export async function convertToPublicUrl(url: string, projectId: string): Promise<string> {
  // S3 URLs may not be publicly accessible (403 errors)
  // Download and convert to base64 data URL for Replicate
  if (url.includes('s3.amazonaws.com') || url.includes('s3.')) {
    try {
      console.log(`[URL Converter] Downloading S3 image for base64 conversion: ${url.substring(0, 80)}...`);
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[URL Converter] Failed to download S3 image (${response.status}), will try ngrok fallback`);
        // Fallback to ngrok URL if available
        return `${NGROK_URL}/api/serve-image?path=${encodeURIComponent(url)}`;
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Image = buffer.toString('base64');
      const mimeType = url.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const dataUrl = `data:${mimeType};base64,${base64Image}`;
      console.log(`[URL Converter] Successfully converted S3 image to base64 (${(base64Image.length / 1024).toFixed(2)} KB)`);
      return dataUrl;
    } catch (error: any) {
      console.error(`[URL Converter] Failed to convert S3 URL to base64:`, error.message);
      // Last resort: try ngrok URL
      return `${NGROK_URL}/api/serve-image?path=${encodeURIComponent(url)}`;
    }
  }

  // If it's already a public URL (external, non-S3), use it as-is
  if (url.startsWith('https://') || (url.startsWith('http://') && !url.includes('localhost'))) {
    return url;
  }

  // If it's a local path, try to upload to S3 first, then convert to base64
  if (url.startsWith('/tmp') || url.startsWith('./') || (!url.startsWith('/api') && !url.startsWith('http'))) {
    try {
      // Read file and convert to base64 directly
      const fs = await import('fs/promises');
      const fileBuffer = await fs.readFile(url);
      const base64Image = fileBuffer.toString('base64');
      const mimeType = url.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const dataUrl = `data:${mimeType};base64,${base64Image}`;
      console.log(`[URL Converter] Converted local path to base64: ${url.substring(0, 50)}... (${(base64Image.length / 1024).toFixed(2)} KB)`);
      return dataUrl;
    } catch (localError: any) {
      console.warn(`[URL Converter] Failed to read local file, trying S3 upload: ${localError.message}`);

      // Fallback: try S3 upload
      try {
        const s3Key = await uploadToS3(url, projectId, {
          contentType: getContentType(url),
        });
        const s3Url = getS3Url(s3Key);
        console.log(`[URL Converter] Uploaded to S3: ${url.substring(0, 50)}... -> ${s3Url.substring(0, 80)}...`);

        // Now convert the S3 URL to base64 (recursive call)
        return convertToPublicUrl(s3Url, projectId);
      } catch (s3Error: any) {
        const publicUrl = `${NGROK_URL}/api/serve-image?path=${encodeURIComponent(url)}`;
        console.warn(`[URL Converter] S3 upload failed, using fallback URL: ${s3Error.message}`);
        return publicUrl;
      }
    }
  }

  // If it's already a relative API path, make it absolute
  if (url.startsWith('/api/')) {
    const publicUrl = `${NGROK_URL}${url}`;
    if (publicUrl.includes('localhost')) {
      console.warn(`[URL Converter] WARNING: Using localhost URL - Replicate may not be able to access it: ${publicUrl}`);
    }
    return publicUrl;
  }

  return url;
}

/**
 * Converts multiple URLs in parallel for optimal performance
 * OPTIMIZATION: Parallel processing instead of sequential
 *
 * @param urls Array of URLs to convert
 * @param projectId Project ID for S3 organization
 * @returns Array of converted public URLs in the same order
 */
export async function convertUrlsInParallel(urls: string[], projectId: string): Promise<string[]> {
  console.log(`[URL Converter] Converting ${urls.length} URLs in parallel`);

  const convertedUrls = await Promise.all(
    urls.map(url => convertToPublicUrl(url, projectId))
  );

  const allPublic = convertedUrls.every(url =>
    url.startsWith('http://') || url.startsWith('https://')
  );
  console.log(`[URL Converter] All URLs converted. Public: ${allPublic}`);

  return convertedUrls;
}






