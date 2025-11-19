/**
 * Example: Using S3 Background Removal Caching
 * 
 * This example demonstrates how to use the background removal API
 * with S3 caching to avoid reprocessing the same images.
 */

// Example 1: Removing background with S3 caching
async function removeBackgroundWithCaching() {
  // Assume we have an image already in S3
  const imageUrl = 'https://my-bucket.s3.us-east-1.amazonaws.com/uploads/project-123/abc123def456.jpg';
  const s3Key = 'uploads/project-123/abc123def456.jpg';

  // First call - will process and cache
  console.log('First call - processing image...');
  const response1 = await fetch('/api/remove-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageUrls: [imageUrl],
      s3Keys: [s3Key],  // This enables caching
    }),
  });

  const data1 = await response1.json();
  console.log('Processed:', data1.processedImages[0].url);
  // Output: https://my-bucket.s3.us-east-1.amazonaws.com/uploads/project-123/abc123def456-nobg.png
  // This took 5-30 seconds

  // Second call - will use cached version
  console.log('Second call - using cache...');
  const response2 = await fetch('/api/remove-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageUrls: [imageUrl],
      s3Keys: [s3Key],  // Same S3 key
    }),
  });

  const data2 = await response2.json();
  console.log('Cached:', data2.processedImages[0].url);
  // Output: Same URL as above
  // This returned instantly!
}

// Example 2: Removing background without caching
async function removeBackgroundWithoutCaching() {
  // For generated images or external URLs, just pass the URL
  const imageUrl = 'https://replicate.delivery/pbxt/abc123.png';

  const response = await fetch('/api/remove-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageUrls: [imageUrl],
      // No s3Keys - will always process
    }),
  });

  const data = await response.json();
  console.log('Processed:', data.processedImages[0].url);
  // This will always take 5-30 seconds
}

// Example 3: Batch processing with mixed caching
async function batchProcessWithMixedCaching() {
  const images = [
    {
      url: 'https://my-bucket.s3.us-east-1.amazonaws.com/uploads/proj-1/img1.jpg',
      s3Key: 'uploads/proj-1/img1.jpg',  // Has S3 key - will cache
    },
    {
      url: 'https://my-bucket.s3.us-east-1.amazonaws.com/uploads/proj-1/img2.jpg',
      s3Key: 'uploads/proj-1/img2.jpg',  // Has S3 key - will cache
    },
    {
      url: 'https://external-site.com/image.jpg',
      s3Key: undefined,  // No S3 key - won't cache
    },
  ];

  const response = await fetch('/api/remove-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageUrls: images.map(img => img.url),
      s3Keys: images.map(img => img.s3Key).filter(Boolean),  // Filter out undefined
    }),
  });

  const data = await response.json();
  console.log('Processed images:', data.processedImages.length);
}

// Example 4: Direct usage from server-side code
import { removeBackground } from '@/lib/services/background-remover';

async function serverSideRemoveBackground() {
  // With caching
  const urlWithCache = await removeBackground(
    'https://my-bucket.s3.us-east-1.amazonaws.com/uploads/proj-1/image.jpg',
    'uploads/proj-1/image.jpg'  // S3 key enables caching
  );

  // Without caching
  const urlNoCache = await removeBackground(
    'https://some-external-url.com/image.jpg'
    // No S3 key - always processes
  );

  return { urlWithCache, urlNoCache };
}

// Example 5: Integration with image upload flow
async function uploadAndRemoveBackground(file: File, projectId: string) {
  // Step 1: Upload image to get S3 info
  const formData = new FormData();
  formData.append('images', file);
  formData.append('projectId', projectId);
  formData.append('enableBackgroundRemoval', 'false'); // We'll do it manually

  const uploadResponse = await fetch('/api/upload-images', {
    method: 'POST',
    body: formData,
  });

  const uploadData = await uploadResponse.json();
  const uploadedImage = uploadData.images[0];

  console.log('Uploaded image:', {
    url: uploadedImage.url,
    s3Key: uploadedImage.s3Key,
  });

  // Step 2: Remove background with caching enabled
  const bgResponse = await fetch('/api/remove-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageUrls: [uploadedImage.url],
      s3Keys: uploadedImage.s3Key ? [uploadedImage.s3Key] : undefined,
    }),
  });

  const bgData = await bgResponse.json();
  const processedUrl = bgData.processedImages[0].url;

  console.log('Background removed:', processedUrl);

  // Step 3: Use the same image again later - it will be cached!
  // ... time passes ...
  const cachedResponse = await fetch('/api/remove-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageUrls: [uploadedImage.url],
      s3Keys: uploadedImage.s3Key ? [uploadedImage.s3Key] : undefined,
    }),
  });
  // This returns instantly from cache!

  return processedUrl;
}

// Example 6: Checking if cached version exists (internal use)
import { findBackgroundRemovedVersion, getS3Url } from '@/lib/storage/s3-uploader';

async function checkIfBackgroundRemovedExists(originalS3Key: string) {
  const cachedKey = await findBackgroundRemovedVersion(originalS3Key);

  if (cachedKey) {
    const cachedUrl = getS3Url(cachedKey);
    console.log('Cached version exists:', cachedUrl);
    return { exists: true, url: cachedUrl };
  } else {
    console.log('No cached version found');
    return { exists: false };
  }
}

export {
  removeBackgroundWithCaching,
  removeBackgroundWithoutCaching,
  batchProcessWithMixedCaching,
  serverSideRemoveBackground,
  uploadAndRemoveBackground,
  checkIfBackgroundRemovedExists,
};

