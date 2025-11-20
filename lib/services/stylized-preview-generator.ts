/**
 * Stylized Preview Generator Service
 * Handles batch generation of stylized preview videos
 */

import { generateVideo } from '@/lib/video/generator';
import { enhancePromptsForStyles, generateDefaultBasePrompt } from '@/lib/utils/stylized-prompt-enhancer';
import { PRESET_STYLES, type StylizedPreview } from '@/lib/types/stylized';
import { getS3Url } from '@/lib/storage/s3-uploader';
import { uploadToS3 } from '@/lib/storage/s3-uploader';
import { convertToPublicUrl } from '@/lib/utils/url-converter';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { processImageForStyle } from '@/lib/services/style-image-processor';
import fs from 'fs/promises';
import path from 'path';

/**
 * Generates multiple stylized preview videos
 * 
 * @param subjectImageUrl - URL to the subject image (car)
 * @param selectedStyles - Array of style IDs to generate
 * @param basePrompt - Optional base prompt (auto-generated if not provided)
 * @returns Array of preview objects with status and metadata
 */
export async function generateStylizedPreviews(
  subjectImageUrl: string,
  selectedStyles: string[],
  basePrompt?: string
): Promise<StylizedPreview[]> {
  const logPrefix = '[StylizedPreviewGenerator]';
  console.log(`${logPrefix} ========================================`);
  console.log(`${logPrefix} Starting batch generation`);
  console.log(`${logPrefix} Subject Image: ${subjectImageUrl}`);
  console.log(`${logPrefix} Selected Styles: ${selectedStyles.join(', ')}`);
  console.log(`${logPrefix} Base Prompt: ${basePrompt || '(auto-generated)'}`);

  // Validate inputs
  if (!subjectImageUrl) {
    throw new Error('Subject image URL is required');
  }

  if (!selectedStyles || selectedStyles.length === 0) {
    throw new Error('At least one style must be selected');
  }

  // Validate style IDs
  const validStyles = selectedStyles.filter(styleId => 
    PRESET_STYLES.some(style => style.id === styleId)
  );

  if (validStyles.length === 0) {
    throw new Error('No valid styles selected');
  }

  // Use only style enhancement - no base prompt
  // The style enhancement contains all the necessary information
  const enhancedPrompts = new Map<string, string>();
  
  for (const styleId of validStyles) {
    const style = PRESET_STYLES.find(s => s.id === styleId);
    if (style) {
      // Use only the style's promptEnhancement - no base prompt
      enhancedPrompts.set(styleId, style.promptEnhancement);
    }
  }

  // Create project ID for this batch
  const projectId = `stylized-preview-${Date.now()}`;

  // Generate previews sequentially to avoid rate limits
  const previews: StylizedPreview[] = [];
  const baseTimestamp = Date.now();

  for (let i = 0; i < validStyles.length; i++) {
    const styleId = validStyles[i];
    const style = PRESET_STYLES.find(s => s.id === styleId)!;
    const enhancedPrompt = enhancedPrompts.get(styleId)!;

    // Generate unique ID using base timestamp + index + random component
    const previewId = `preview-${styleId}-${baseTimestamp}-${i}-${Math.random().toString(36).substring(2, 9)}`;
    
    console.log(`${logPrefix} Generating preview ${i + 1}/${validStyles.length}: ${style.name}`);
    console.log(`${logPrefix}   Prompt: "${enhancedPrompt}"`);

    const preview: StylizedPreview = {
      id: previewId,
      styleId,
      styleName: style.name,
      subjectImageUrl,
      prompt: enhancedPrompt,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    // Push preview to array once before processing
    previews.push(preview);

    try {
      // Update status to processing
      preview.status = 'processing';

      // Step 1: Apply style-specific color grading and lighting to the image
      console.log(`${logPrefix} Applying style-specific color grading and lighting...`);
      let processedImageUrl: string;
      try {
        processedImageUrl = await processImageForStyle(subjectImageUrl, styleId, projectId);
        console.log(`${logPrefix} ✓ Style processing complete: ${processedImageUrl}`);
      } catch (styleError: any) {
        console.warn(`${logPrefix} Style processing failed, using original image: ${styleError.message}`);
        processedImageUrl = subjectImageUrl;
      }

      // Step 2: Convert processed image URL to publicly accessible format
      // For S3 URLs, download using AWS SDK and convert to base64 (works even if bucket isn't public)
      let publicImageUrl: string = processedImageUrl;
      
      // Check if it's an S3 URL - download directly using AWS SDK to avoid 403 errors
      if (processedImageUrl.includes('s3.amazonaws.com') || processedImageUrl.includes('s3.')) {
        console.log(`${logPrefix} Detected S3 URL, downloading using AWS SDK and converting to base64...`);
        try {
          // Extract S3 key and bucket from URL
          // Pattern: https://bucket.s3.region.amazonaws.com/key
          const urlMatch = processedImageUrl.match(/https?:\/\/([^/]+)\.s3[^/]*\.amazonaws\.com\/(.+)$/);
          if (!urlMatch || !urlMatch[1] || !urlMatch[2]) {
            throw new Error('Could not parse S3 URL');
          }
          
          const bucket = urlMatch[1];
          const s3Key = decodeURIComponent(urlMatch[2]);
          
          console.log(`${logPrefix}   Bucket: ${bucket}`);
          console.log(`${logPrefix}   Key: ${s3Key}`);
          
          // Check AWS credentials
          if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
            throw new Error('AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.');
          }
          
          // Download using AWS SDK
          const s3Client = new S3Client({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
          });
          
          const command = new GetObjectCommand({
            Bucket: bucket,
            Key: s3Key,
          });
          
          console.log(`${logPrefix}   Downloading from S3...`);
          const response = await s3Client.send(command);
          
          if (!response.Body) {
            throw new Error('S3 response body is empty');
          }
          
          const arrayBuffer = await response.Body.transformToByteArray();
          const buffer = Buffer.from(arrayBuffer);
          const base64Image = buffer.toString('base64');
          
          // Determine MIME type from S3 key or Content-Type header
          let mimeType = 'image/jpeg';
          if (s3Key.endsWith('.png')) {
            mimeType = 'image/png';
          } else if (s3Key.endsWith('.webp')) {
            mimeType = 'image/webp';
          } else if (response.ContentType) {
            mimeType = response.ContentType;
          }
          
          publicImageUrl = `data:${mimeType};base64,${base64Image}`;
          console.log(`${logPrefix} ✓ Downloaded S3 file and converted to base64 (${(base64Image.length / 1024).toFixed(2)} KB)`);
        } catch (s3Error: any) {
          console.error(`${logPrefix} ✗ Failed to download S3 file: ${s3Error.message}`);
          throw new Error(`Failed to access S3 image: ${s3Error.message}. Please check AWS credentials and S3 bucket permissions.`);
        }
      } else if (!processedImageUrl.startsWith('http://') && !processedImageUrl.startsWith('https://')) {
        // For local paths or relative URLs, use convertToPublicUrl
        try {
          publicImageUrl = await convertToPublicUrl(processedImageUrl, projectId);
          console.log(`${logPrefix} Converted local/relative URL to public format`);
        } catch (urlError: any) {
          console.warn(`${logPrefix} Failed to convert URL, using original: ${urlError.message}`);
        }
      }

      // Generate video using existing generator
      // Use sceneIndex = i to organize files
      // Skip automotive enhancement to preserve style-specific instructions
      const localVideoPath = await generateVideo(
        publicImageUrl,
        enhancedPrompt,
        undefined, // No seed frame for previews
        projectId,
        i,
        true // skipAutomotiveEnhancement = true for stylized previews
      );

      // Upload video to S3 for public access
      console.log(`${logPrefix} Uploading video to S3...`);
      const s3Key = await uploadToS3(localVideoPath, projectId, {
        contentType: 'video/mp4',
        metadata: {
          'stylized-preview': 'true',
          'style-id': styleId,
          'style-name': style.name,
        },
      });

      const videoUrl = getS3Url(s3Key);

      // Update preview with success
      preview.status = 'completed';
      preview.videoUrl = videoUrl;
      preview.completedAt = new Date().toISOString();

      console.log(`${logPrefix} ✓ ${style.name} preview completed`);
      console.log(`${logPrefix}   Video URL: ${videoUrl}`);

      // Clean up local file
      try {
        await fs.unlink(localVideoPath);
      } catch (error) {
        console.warn(`${logPrefix} Failed to clean up local file: ${localVideoPath}`, error);
      }

    } catch (error) {
      // Handle generation failure
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`${logPrefix} ✗ ${style.name} preview failed: ${errorMessage}`);

      preview.status = 'failed';
      preview.error = errorMessage;
      // Preview is already in the array, just update its status
    }

    // Add delay between generations to avoid rate limits (except after last one)
    if (i < validStyles.length - 1) {
      const delay = 2000; // 2 seconds
      console.log(`${logPrefix} Waiting ${delay}ms before next generation...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  const successful = previews.filter(p => p.status === 'completed').length;
  const failed = previews.filter(p => p.status === 'failed').length;

  console.log(`${logPrefix} ========================================`);
  console.log(`${logPrefix} Batch generation complete`);
  console.log(`${logPrefix}   Total: ${previews.length}`);
  console.log(`${logPrefix}   Successful: ${successful}`);
  console.log(`${logPrefix}   Failed: ${failed}`);
  console.log(`${logPrefix} ========================================`);

  return previews;
}

