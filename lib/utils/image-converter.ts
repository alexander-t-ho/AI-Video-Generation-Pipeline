/**
 * Image Converter Utility
 * 
 * Provides helper functions for converting image formats before upload
 */

import sharp from 'sharp';

export interface ConvertedImage {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  extension: string;
}

/**
 * Converts a webp image to PNG
 * 
 * @param buffer - The webp image buffer
 * @returns The converted PNG buffer
 */
export async function convertWebpToPng(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer).png().toBuffer();
}

/**
 * Checks if a file is a webp image based on mime type or extension
 * 
 * @param mimeType - The file's mime type
 * @param filename - The file's name
 * @returns True if the file is webp
 */
export function isWebpImage(mimeType: string, filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return mimeType === 'image/webp' || ext === 'webp';
}

/**
 * Converts webp to PNG if needed, otherwise returns original
 * 
 * @param buffer - The image buffer
 * @param mimeType - The original mime type
 * @param filename - The original filename
 * @returns Converted image data or original if no conversion needed
 */
export async function convertWebpIfNeeded(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<ConvertedImage> {
  if (isWebpImage(mimeType, filename)) {
    console.log(`Converting webp to PNG: ${filename}`);
    
    const convertedBuffer = await convertWebpToPng(buffer);
    const newFilename = filename.replace(/\.webp$/i, '.png');
    
    return {
      buffer: convertedBuffer,
      mimeType: 'image/png',
      filename: newFilename,
      extension: 'png',
    };
  }
  
  // Return original
  const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
  return {
    buffer,
    mimeType,
    filename,
    extension: ext,
  };
}

