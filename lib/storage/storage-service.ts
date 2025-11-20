/**
 * Storage Service - Unified abstraction layer for file storage
 *
 * This service provides a consistent interface for all file operations,
 * handling both local temp files (for FFmpeg) and S3 storage (for persistence).
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ============================================================================
// Types
// ============================================================================

export type FileCategory =
  | 'uploads'           // User uploaded reference images
  | 'generated-images'  // AI-generated images
  | 'generated-videos'  // AI-generated videos
  | 'frames'            // Extracted seed frames
  | 'processed'         // Background-removed, edge-cleaned, etc.
  | 'timeline-edits'    // Trimmed/edited clips
  | 'previews'          // Preview videos
  | 'final'             // Final stitched videos

export type ProcessingType =
  | 'original'
  | 'bg-removed'
  | 'edge-cleaned'
  | 'upscaled'
  | 'recolored'

export interface FileMetadata {
  projectId: string;
  sceneId?: string;
  category: FileCategory;
  processingType?: ProcessingType;
  iteration?: number;
  originalName?: string;
  mimeType: string;
  customFilename?: string;
}

export interface StoredFile {
  id: string;
  s3Key: string;
  localPath: string;
  url: string;
  size: number;
  mimeType: string;
  metadata: FileMetadata;
  createdAt: string;
}

export interface StorageConfig {
  useS3: boolean;
  keepLocalAfterUpload: boolean;  // Keep local files for FFmpeg operations
  localBasePath: string;
  s3Bucket: string;
  s3Region: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: StorageConfig = {
  useS3: true,
  keepLocalAfterUpload: true,  // Default to keeping local for FFmpeg
  localBasePath: '/tmp/projects',
  s3Bucket: process.env.AWS_S3_BUCKET || 'ai-video-pipeline-outputs',
  s3Region: process.env.AWS_REGION || 'us-east-1',
};

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;

// ============================================================================
// S3 Client Singleton
// ============================================================================

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.');
    }

    s3Client = new S3Client({
      region: DEFAULT_CONFIG.s3Region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return s3Client;
}

function isS3Configured(): boolean {
  return !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_S3_BUCKET
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateFileId(): string {
  return crypto.randomUUID();
}

function calculateHash(buffer: Buffer): string {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/**
 * Generate standardized S3 key based on file metadata
 * Format: projects/{projectId}/{category}/{sceneId?}/{filename}
 */
function generateS3Key(metadata: FileMetadata, filename: string): string {
  const parts = ['projects', metadata.projectId, metadata.category];

  if (metadata.sceneId) {
    parts.push(metadata.sceneId);
  }

  parts.push(filename);

  return parts.join('/');
}

/**
 * Generate local file path
 */
function generateLocalPath(metadata: FileMetadata, filename: string): string {
  const parts = [DEFAULT_CONFIG.localBasePath, metadata.projectId, metadata.category];

  if (metadata.sceneId) {
    parts.push(metadata.sceneId);
  }

  parts.push(filename);

  return path.join(...parts);
}

/**
 * Get content type from file extension
 */
function getContentType(filePath: string, providedType?: string): string {
  if (providedType) return providedType;

  const ext = path.extname(filePath).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.webm': 'video/webm',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.json': 'application/json',
    '.txt': 'text/plain',
  };
  return contentTypes[ext] || 'application/octet-stream';
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType: string): string {
  const extensions: Record<string, string> = {
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
  };
  return extensions[mimeType] || '';
}

// ============================================================================
// Core Storage Operations
// ============================================================================

/**
 * Save file to local storage
 */
async function saveToLocal(
  buffer: Buffer,
  localPath: string
): Promise<void> {
  const dir = path.dirname(localPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(localPath, buffer);
}

/**
 * Upload buffer to S3 with retry logic
 */
async function uploadToS3WithRetry(
  buffer: Buffer,
  s3Key: string,
  contentType: string,
  metadata?: Record<string, string>
): Promise<void> {
  const client = getS3Client();
  const bucket = DEFAULT_CONFIG.s3Bucket;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: buffer,
        ContentType: contentType,
        Metadata: {
          ...metadata,
          'file-size': buffer.length.toString(),
          'uploaded-at': new Date().toISOString(),
        },
      });

      await client.send(command);
      return;
    } catch (error: any) {
      lastError = error;

      // Don't retry on client errors (except rate limit)
      if (error.$metadata?.httpStatusCode) {
        const status = error.$metadata.httpStatusCode;
        if (status >= 400 && status < 500 && status !== 429) {
          throw error;
        }
      }

      if (attempt === MAX_RETRIES) break;

      const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
      console.warn(`[StorageService] Upload attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  throw lastError || new Error('Upload failed after retries');
}

/**
 * Download file from S3
 */
async function downloadFromS3(s3Key: string): Promise<Buffer> {
  const client = getS3Client();
  const bucket = DEFAULT_CONFIG.s3Bucket;

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: s3Key,
  });

  const response = await client.send(command);

  if (!response.Body) {
    throw new Error(`No body in S3 response for key: ${s3Key}`);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of response.Body as any) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

/**
 * Check if file exists in S3
 */
async function existsInS3(s3Key: string): Promise<boolean> {
  try {
    const client = getS3Client();
    const bucket = DEFAULT_CONFIG.s3Bucket;

    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    });

    await client.send(command);
    return true;
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Delete file from S3
 */
async function deleteFromS3(s3Key: string): Promise<void> {
  const client = getS3Client();
  const bucket = DEFAULT_CONFIG.s3Bucket;

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: s3Key,
  });

  await client.send(command);
}

// ============================================================================
// Main Storage Service Class
// ============================================================================

export class StorageService {
  private config: StorageConfig;

  constructor(config?: Partial<StorageConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Store a file (buffer) with automatic S3 upload and local caching
   */
  async storeFile(
    buffer: Buffer,
    metadata: FileMetadata,
    options?: {
      keepLocal?: boolean;  // Override config for this file
      filename?: string;    // Custom filename
    }
  ): Promise<StoredFile> {
    const fileId = generateFileId();
    const hash = calculateHash(buffer);
    const ext = getExtensionFromMimeType(metadata.mimeType) ||
                (metadata.originalName ? path.extname(metadata.originalName) : '');

    // Generate filename
    let filename: string;
    if (options?.filename) {
      filename = options.filename;
    } else if (metadata.customFilename) {
      filename = metadata.customFilename;
    } else if (metadata.processingType && metadata.processingType !== 'original') {
      filename = `${fileId}-${metadata.processingType}${metadata.iteration ? `-${metadata.iteration}` : ''}${ext}`;
    } else {
      filename = `${fileId}${ext}`;
    }

    const s3Key = generateS3Key(metadata, filename);
    const localPath = generateLocalPath(metadata, filename);

    // Always save locally first (needed for FFmpeg operations)
    await saveToLocal(buffer, localPath);

    // Upload to S3 if configured
    let url = localPath;
    if (this.config.useS3 && isS3Configured()) {
      try {
        await uploadToS3WithRetry(
          buffer,
          s3Key,
          metadata.mimeType,
          {
            'project-id': metadata.projectId,
            'category': metadata.category,
            'scene-id': metadata.sceneId || '',
            'processing-type': metadata.processingType || 'original',
            'content-hash': hash,
          }
        );
        url = this.getS3Url(s3Key);

        // Optionally delete local file after S3 upload
        const keepLocal = options?.keepLocal ?? this.config.keepLocalAfterUpload;
        if (!keepLocal) {
          try {
            await fs.unlink(localPath);
          } catch (e) {
            console.warn(`[StorageService] Failed to delete local file: ${localPath}`);
          }
        }
      } catch (error) {
        console.error('[StorageService] S3 upload failed, file remains local only:', error);
        // Continue with local-only storage
      }
    }

    return {
      id: fileId,
      s3Key,
      localPath,
      url,
      size: buffer.length,
      mimeType: metadata.mimeType,
      metadata,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Store a file from a local path (useful for FFmpeg outputs)
   */
  async storeFromLocalPath(
    localFilePath: string,
    metadata: FileMetadata,
    options?: {
      keepLocal?: boolean;
      deleteSource?: boolean;  // Delete the source file after storing
    }
  ): Promise<StoredFile> {
    const buffer = await fs.readFile(localFilePath);
    const stats = await fs.stat(localFilePath);

    const result = await this.storeFile(buffer, metadata, {
      ...options,
      filename: options?.keepLocal ? path.basename(localFilePath) : undefined,
    });

    // Delete source if requested (different from the stored local copy)
    if (options?.deleteSource && localFilePath !== result.localPath) {
      try {
        await fs.unlink(localFilePath);
      } catch (e) {
        console.warn(`[StorageService] Failed to delete source file: ${localFilePath}`);
      }
    }

    return result;
  }

  /**
   * Store a file from a URL (download and store)
   */
  async storeFromUrl(
    url: string,
    metadata: FileMetadata,
    options?: {
      keepLocal?: boolean;
      retries?: number;
    }
  ): Promise<StoredFile> {
    const retries = options?.retries ?? 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        return await this.storeFile(buffer, metadata, options);
      } catch (error: any) {
        lastError = error;

        if (attempt < retries) {
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
          console.warn(`[StorageService] Download attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
          await sleep(delay);
        }
      }
    }

    throw lastError || new Error(`Failed to download file from ${url}`);
  }

  /**
   * Get file content as buffer
   */
  async getFileBuffer(file: StoredFile): Promise<Buffer> {
    // Try local first (faster)
    try {
      return await fs.readFile(file.localPath);
    } catch (e) {
      // Fall back to S3
      if (this.config.useS3 && isS3Configured()) {
        return await downloadFromS3(file.s3Key);
      }
      throw new Error(`File not found locally and S3 not available: ${file.localPath}`);
    }
  }

  /**
   * Get the best URL for a file (S3 URL if available, local path otherwise)
   */
  getPublicUrl(file: StoredFile): string {
    if (file.s3Key && this.config.useS3 && isS3Configured()) {
      return this.getS3Url(file.s3Key);
    }
    return file.localPath;
  }

  /**
   * Get S3 URL for a key
   */
  getS3Url(s3Key: string): string {
    const bucket = this.config.s3Bucket;
    const region = this.config.s3Region;
    return `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;
  }

  /**
   * Get a pre-signed URL for temporary access
   */
  async getPreSignedUrl(s3Key: string, expiresIn: number = 3600): Promise<string> {
    const client = getS3Client();
    const bucket = this.config.s3Bucket;

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    });

    return await getSignedUrl(client, command, { expiresIn });
  }

  /**
   * Delete a file from both local and S3 storage
   */
  async deleteFile(file: StoredFile): Promise<void> {
    // Delete from local
    try {
      await fs.unlink(file.localPath);
    } catch (e) {
      // Ignore if already deleted
    }

    // Delete from S3
    if (this.config.useS3 && isS3Configured() && file.s3Key) {
      try {
        await deleteFromS3(file.s3Key);
      } catch (e) {
        console.warn(`[StorageService] Failed to delete from S3: ${file.s3Key}`);
      }
    }
  }

  /**
   * Check if a file exists
   */
  async fileExists(file: StoredFile): Promise<{ local: boolean; s3: boolean }> {
    let local = false;
    let s3 = false;

    try {
      await fs.access(file.localPath);
      local = true;
    } catch (e) {
      // File doesn't exist locally
    }

    if (this.config.useS3 && isS3Configured() && file.s3Key) {
      s3 = await existsInS3(file.s3Key);
    }

    return { local, s3 };
  }

  /**
   * List objects in S3 with a given prefix
   */
  async listObjects(prefix: string): Promise<string[]> {
    if (!this.config.useS3 || !isS3Configured()) {
      throw new Error('S3 is not configured');
    }

    const client = getS3Client();
    const bucket = this.config.s3Bucket;
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await client.send(command);
      continuationToken = response.NextContinuationToken;

      if (response.Contents) {
        for (const object of response.Contents) {
          if (object.Key) {
            keys.push(object.Key);
          }
        }
      }
    } while (continuationToken);

    return keys;
  }

  /**
   * Ensure file is available locally (download from S3 if needed)
   */
  async ensureLocal(file: StoredFile): Promise<string> {
    try {
      await fs.access(file.localPath);
      return file.localPath;
    } catch (e) {
      // Download from S3
      if (this.config.useS3 && isS3Configured() && file.s3Key) {
        const buffer = await downloadFromS3(file.s3Key);
        await saveToLocal(buffer, file.localPath);
        return file.localPath;
      }
      throw new Error(`File not available: ${file.localPath}`);
    }
  }

  /**
   * Get local temp directory for a project
   */
  getProjectTempDir(projectId: string, category?: FileCategory): string {
    const parts = [this.config.localBasePath, projectId];
    if (category) {
      parts.push(category);
    }
    return path.join(...parts);
  }

  /**
   * Clean up local temp files for a project
   */
  async cleanupProjectTemp(
    projectId: string,
    options?: {
      olderThanMs?: number;  // Only delete files older than this
      categories?: FileCategory[];  // Only delete specific categories
    }
  ): Promise<number> {
    const projectDir = this.getProjectTempDir(projectId);
    let deletedCount = 0;

    try {
      const categories = options?.categories || await fs.readdir(projectDir);

      for (const category of categories) {
        const categoryDir = path.join(projectDir, category);

        try {
          const files = await fs.readdir(categoryDir, { withFileTypes: true });

          for (const file of files) {
            const filePath = path.join(categoryDir, file.name);

            if (file.isFile()) {
              if (options?.olderThanMs) {
                const stats = await fs.stat(filePath);
                const age = Date.now() - stats.mtimeMs;
                if (age < options.olderThanMs) continue;
              }

              await fs.unlink(filePath);
              deletedCount++;
            }
          }
        } catch (e) {
          // Category dir doesn't exist, skip
        }
      }
    } catch (e) {
      // Project dir doesn't exist
    }

    return deletedCount;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultStorageService: StorageService | null = null;

export function getStorageService(): StorageService {
  if (!defaultStorageService) {
    defaultStorageService = new StorageService();
  }
  return defaultStorageService;
}

// ============================================================================
// Convenience Functions
// ============================================================================

export async function storeGeneratedImage(
  buffer: Buffer,
  projectId: string,
  sceneId: string,
  mimeType: string = 'image/png'
): Promise<StoredFile> {
  const service = getStorageService();
  return service.storeFile(buffer, {
    projectId,
    sceneId,
    category: 'generated-images',
    mimeType,
  });
}

export async function storeGeneratedVideo(
  buffer: Buffer,
  projectId: string,
  sceneId: string,
  mimeType: string = 'video/mp4'
): Promise<StoredFile> {
  const service = getStorageService();
  return service.storeFile(buffer, {
    projectId,
    sceneId,
    category: 'generated-videos',
    mimeType,
  }, {
    keepLocal: true,  // Videos need to stay local for FFmpeg
  });
}

export async function storeSeedFrame(
  buffer: Buffer,
  projectId: string,
  sceneId: string,
  frameIndex: number
): Promise<StoredFile> {
  const service = getStorageService();
  return service.storeFile(buffer, {
    projectId,
    sceneId,
    category: 'frames',
    mimeType: 'image/png',
    customFilename: `frame_${frameIndex}.png`,
  });
}

export async function storeProcessedImage(
  buffer: Buffer,
  projectId: string,
  sceneId: string,
  processingType: ProcessingType,
  iteration: number = 1
): Promise<StoredFile> {
  const service = getStorageService();
  return service.storeFile(buffer, {
    projectId,
    sceneId,
    category: 'processed',
    processingType,
    iteration,
    mimeType: 'image/png',
  });
}

export async function storeTimelineEdit(
  localPath: string,
  projectId: string,
  clipId: string
): Promise<StoredFile> {
  const service = getStorageService();
  return service.storeFromLocalPath(localPath, {
    projectId,
    category: 'timeline-edits',
    mimeType: 'video/mp4',
    customFilename: `clip-${clipId}.mp4`,
  }, {
    keepLocal: true,  // Timeline edits need to stay local for FFmpeg
    deleteSource: false,
  });
}

export async function storeFinalVideo(
  localPath: string,
  projectId: string
): Promise<StoredFile> {
  const service = getStorageService();
  return service.storeFromLocalPath(localPath, {
    projectId,
    category: 'final',
    mimeType: 'video/mp4',
    customFilename: 'final.mp4',
  }, {
    keepLocal: true,  // Keep for quick access
    deleteSource: false,
  });
}

export default StorageService;
