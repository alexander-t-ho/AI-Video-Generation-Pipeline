/**
 * Storage Module - Unified exports for all storage services
 */

// Main storage service
export {
  StorageService,
  getStorageService,
  storeGeneratedImage,
  storeGeneratedVideo,
  storeSeedFrame,
  storeProcessedImage,
  storeTimelineEdit,
  storeFinalVideo,
  type FileCategory,
  type ProcessingType,
  type FileMetadata,
  type StoredFile,
  type StorageConfig,
} from './storage-service';

// URL management
export {
  default as urlManager,
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
  type FileReference,
  type UrlFormat,
  type UrlType,
} from './url-manager';

// Cleanup service
export {
  default as cleanupService,
  cleanupProjectTempFiles,
  cleanupAllTempFiles,
  getProjectDiskUsage,
  checkStorageThreshold,
  cleanupUploadedFiles,
  findOrphanedFiles,
  deleteProjectTempFiles,
  runScheduledCleanup,
  type CleanupOptions,
  type CleanupResult,
  type DiskUsageInfo,
} from './cleanup-service';

// Legacy exports (for backward compatibility)
export { uploadToS3, getS3Url as getLegacyS3Url, uploadBufferToS3 } from './s3-uploader';
export { saveUploadedImage, getImageUrl, deleteUploadedImage, type UploadedImage } from './image-storage';
