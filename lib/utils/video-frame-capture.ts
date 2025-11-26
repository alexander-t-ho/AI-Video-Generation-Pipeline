/**
 * Video Frame Capture Utilities
 * 
 * Provides functionality to capture frames from HTML video elements using Canvas API
 * and upload them to S3 storage.
 */

/**
 * Captures the current frame from a video element as a PNG blob
 * 
 * @param videoElement - The HTML video element to capture from
 * @returns Promise resolving to a Blob containing the captured frame as PNG
 * @throws Error if canvas context cannot be created or blob conversion fails
 */
export async function captureVideoFrame(videoElement: HTMLVideoElement): Promise<Blob> {
  // Validate video element
  if (!videoElement) {
    throw new Error('Video element is required');
  }

  // Check if video has loaded dimensions
  if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
    throw new Error('Video has not loaded yet or has invalid dimensions');
  }

  // Create canvas with video dimensions
  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;

  // Get canvas context
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas 2D context');
  }

  // Draw the current video frame to the canvas
  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

  // Convert canvas to blob (PNG format, max quality)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to blob'));
        }
      },
      'image/png',
      1.0 // Maximum quality
    );
  });
}

/**
 * Uploads a frame blob to S3 storage
 * 
 * @param frameBlob - The blob containing the captured frame
 * @param projectId - Project ID for organizing the upload
 * @returns Promise resolving to S3 URL and key
 * @throws Error if upload fails
 */
export async function uploadFrameToS3(
  frameBlob: Blob,
  projectId: string
): Promise<{ s3Url: string; s3Key: string; preSignedUrl: string }> {
  // Convert blob to base64
  const base64 = await blobToBase64(frameBlob);

  // Upload via API
  const response = await fetch('/api/upload-blob-s3', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      imageData: base64,
      projectId,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Failed to upload frame to S3');
  }

  const data = await response.json();
  return data.data;
}

/**
 * Converts a Blob to base64 string
 * 
 * @param blob - The blob to convert
 * @returns Promise resolving to base64 string
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        // Remove data URL prefix (e.g., "data:image/png;base64,")
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error('Failed to convert blob to base64'));
      }
    };
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

