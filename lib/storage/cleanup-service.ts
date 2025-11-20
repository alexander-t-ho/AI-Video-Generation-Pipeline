/**
 * Cleanup Service - Manages temporary file lifecycle
 *
 * This service handles cleanup of local temp files while ensuring
 * files needed for FFmpeg operations are preserved.
 */

import fs from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { clearAllThumbnails, getThumbnailCacheStats } from './thumbnail-service';

// ============================================================================
// Types
// ============================================================================

export interface CleanupOptions {
  maxAgeMs?: number;              // Delete files older than this (default: 24 hours)
  dryRun?: boolean;               // Just report what would be deleted
  preserveCategories?: string[];  // Categories to preserve (e.g., for active FFmpeg operations)
  projectId?: string;             // Clean specific project only
}

export interface CleanupResult {
  deletedFiles: number;
  deletedBytes: number;
  errors: string[];
  preservedFiles: number;
}

export interface ThumbnailCleanupResult {
  clearedCount: number;
}

export interface DiskUsageInfo {
  projectId: string;
  totalBytes: number;
  fileCount: number;
  byCategory: Record<string, { bytes: number; count: number }>;
}

// ============================================================================
// Constants
// ============================================================================

const TEMP_BASE_PATH = '/tmp/projects';
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const WARNING_THRESHOLD_BYTES = 5 * 1024 * 1024 * 1024; // 5GB per project

// Categories that should be preserved longer (for FFmpeg operations)
const PRESERVE_FOR_FFMPEG = [
  'timeline-edits',
  'final',
  'frames',
];

// ============================================================================
// Cleanup Functions
// ============================================================================

/**
 * Clean up temp files for a specific project
 */
export async function cleanupProjectTempFiles(
  projectId: string,
  options: CleanupOptions = {}
): Promise<CleanupResult> {
  const {
    maxAgeMs = DEFAULT_MAX_AGE_MS,
    dryRun = false,
    preserveCategories = PRESERVE_FOR_FFMPEG,
  } = options;

  const result: CleanupResult = {
    deletedFiles: 0,
    deletedBytes: 0,
    errors: [],
    preservedFiles: 0,
  };

  const projectDir = path.join(TEMP_BASE_PATH, projectId);

  try {
    await fs.access(projectDir);
  } catch {
    // Project directory doesn't exist
    return result;
  }

  const now = Date.now();

  try {
    const categories = await fs.readdir(projectDir);

    for (const category of categories) {
      // Skip preserved categories
      if (preserveCategories.includes(category)) {
        result.preservedFiles++;
        continue;
      }

      const categoryDir = path.join(projectDir, category);

      try {
        const stat = await fs.stat(categoryDir);
        if (!stat.isDirectory()) continue;

        const files = await fs.readdir(categoryDir);

        for (const file of files) {
          const filePath = path.join(categoryDir, file);

          try {
            const fileStat = await fs.stat(filePath);

            if (!fileStat.isFile()) continue;

            const age = now - fileStat.mtimeMs;

            if (age >= maxAgeMs) {
              if (!dryRun) {
                await fs.unlink(filePath);
              }
              result.deletedFiles++;
              result.deletedBytes += fileStat.size;
            } else {
              result.preservedFiles++;
            }
          } catch (error: any) {
            result.errors.push(`Failed to process ${filePath}: ${error.message}`);
          }
        }

        // Remove empty directories
        if (!dryRun) {
          const remainingFiles = await fs.readdir(categoryDir);
          if (remainingFiles.length === 0) {
            await fs.rmdir(categoryDir);
          }
        }
      } catch (error: any) {
        result.errors.push(`Failed to process category ${category}: ${error.message}`);
      }
    }
  } catch (error: any) {
    result.errors.push(`Failed to clean project ${projectId}: ${error.message}`);
  }

  return result;
}

/**
 * Clean up temp files for all projects
 */
export async function cleanupAllTempFiles(
  options: CleanupOptions = {}
): Promise<Record<string, CleanupResult>> {
  const results: Record<string, CleanupResult> = {};

  try {
    await fs.access(TEMP_BASE_PATH);
  } catch {
    // Base directory doesn't exist
    return results;
  }

  const projects = await fs.readdir(TEMP_BASE_PATH);

  for (const projectId of projects) {
    const projectPath = path.join(TEMP_BASE_PATH, projectId);
    const stat = await fs.stat(projectPath);

    if (stat.isDirectory()) {
      results[projectId] = await cleanupProjectTempFiles(projectId, options);
    }
  }

  return results;
}

/**
 * Get disk usage for a project
 */
export async function getProjectDiskUsage(projectId: string): Promise<DiskUsageInfo> {
  const info: DiskUsageInfo = {
    projectId,
    totalBytes: 0,
    fileCount: 0,
    byCategory: {},
  };

  const projectDir = path.join(TEMP_BASE_PATH, projectId);

  try {
    await fs.access(projectDir);
  } catch {
    return info;
  }

  const categories = await fs.readdir(projectDir);

  for (const category of categories) {
    const categoryDir = path.join(projectDir, category);

    try {
      const stat = await fs.stat(categoryDir);
      if (!stat.isDirectory()) continue;

      const files = await fs.readdir(categoryDir);
      let categoryBytes = 0;
      let categoryCount = 0;

      for (const file of files) {
        const filePath = path.join(categoryDir, file);
        const fileStat = await fs.stat(filePath);

        if (fileStat.isFile()) {
          categoryBytes += fileStat.size;
          categoryCount++;
        }
      }

      info.byCategory[category] = {
        bytes: categoryBytes,
        count: categoryCount,
      };

      info.totalBytes += categoryBytes;
      info.fileCount += categoryCount;
    } catch {
      // Skip inaccessible directories
    }
  }

  return info;
}

/**
 * Check if project exceeds storage threshold
 */
export async function checkStorageThreshold(
  projectId: string,
  thresholdBytes: number = WARNING_THRESHOLD_BYTES
): Promise<{ exceeded: boolean; usage: DiskUsageInfo }> {
  const usage = await getProjectDiskUsage(projectId);
  return {
    exceeded: usage.totalBytes > thresholdBytes,
    usage,
  };
}

// ============================================================================
// Database-aware Cleanup
// ============================================================================

/**
 * Clean up files that have been uploaded to S3
 * This checks the database to ensure files are safely in S3 before deletion
 */
export async function cleanupUploadedFiles(
  prisma: PrismaClient,
  options: CleanupOptions = {}
): Promise<CleanupResult> {
  const {
    dryRun = false,
    projectId,
  } = options;

  const result: CleanupResult = {
    deletedFiles: 0,
    deletedBytes: 0,
    errors: [],
    preservedFiles: 0,
  };

  // Find files that have been uploaded to S3 but still have local copies
  const whereClause: any = {
    isUploaded: true,
    localPath: { not: null },
    isDeleted: false,
  };

  if (projectId) {
    whereClause.projectId = projectId;
  }

  const files = await prisma.fileStorage.findMany({
    where: whereClause,
  });

  for (const file of files) {
    if (!file.localPath) continue;

    try {
      const stat = await fs.stat(file.localPath);

      if (!dryRun) {
        await fs.unlink(file.localPath);

        // Update database to clear local path
        await prisma.fileStorage.update({
          where: { id: file.id },
          data: { localPath: null },
        });
      }

      result.deletedFiles++;
      result.deletedBytes += stat.size;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File already deleted, just clear the database
        if (!dryRun) {
          await prisma.fileStorage.update({
            where: { id: file.id },
            data: { localPath: null },
          });
        }
      } else {
        result.errors.push(`Failed to delete ${file.localPath}: ${error.message}`);
      }
    }
  }

  return result;
}

/**
 * Find orphaned files (on disk but not in database)
 */
export async function findOrphanedFiles(
  prisma: PrismaClient,
  projectId?: string
): Promise<string[]> {
  const orphanedFiles: string[] = [];

  const basePath = projectId
    ? path.join(TEMP_BASE_PATH, projectId)
    : TEMP_BASE_PATH;

  try {
    await fs.access(basePath);
  } catch {
    return orphanedFiles;
  }

  // Get all local paths from database
  const dbFiles = await prisma.fileStorage.findMany({
    where: projectId ? { projectId } : {},
    select: { localPath: true },
  });

  const dbPaths = new Set(
    dbFiles
      .map(f => f.localPath)
      .filter((p): p is string => p !== null)
  );

  // Recursively find all files
  async function scanDirectory(dirPath: string) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await scanDirectory(fullPath);
      } else if (entry.isFile() && !dbPaths.has(fullPath)) {
        orphanedFiles.push(fullPath);
      }
    }
  }

  await scanDirectory(basePath);

  return orphanedFiles;
}

/**
 * Delete all temp files for a deleted project
 */
export async function deleteProjectTempFiles(projectId: string): Promise<CleanupResult> {
  const result: CleanupResult = {
    deletedFiles: 0,
    deletedBytes: 0,
    errors: [],
    preservedFiles: 0,
  };

  const projectDir = path.join(TEMP_BASE_PATH, projectId);

  try {
    await fs.access(projectDir);
  } catch {
    return result;
  }

  // Recursively delete
  async function deleteDirectory(dirPath: string) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await deleteDirectory(fullPath);
        await fs.rmdir(fullPath);
      } else {
        try {
          const stat = await fs.stat(fullPath);
          await fs.unlink(fullPath);
          result.deletedFiles++;
          result.deletedBytes += stat.size;
        } catch (error: any) {
          result.errors.push(`Failed to delete ${fullPath}: ${error.message}`);
        }
      }
    }
  }

  try {
    await deleteDirectory(projectDir);
    await fs.rmdir(projectDir);
  } catch (error: any) {
    result.errors.push(`Failed to delete project directory: ${error.message}`);
  }

  return result;
}

// ============================================================================
// Scheduled Cleanup
// ============================================================================

/**
 * Run scheduled cleanup (call this from a cron job or API endpoint)
 */
export async function runScheduledCleanup(
  prisma: PrismaClient
): Promise<{
  tempCleanup: Record<string, CleanupResult>;
  uploadedCleanup: CleanupResult;
  thumbnailCleanup: ThumbnailCleanupResult;
  orphanedFiles: string[];
}> {
  console.log('[CleanupService] Starting scheduled cleanup...');

  // Clean up old temp files
  const tempCleanup = await cleanupAllTempFiles({
    maxAgeMs: DEFAULT_MAX_AGE_MS,
  });

  // Clean up files that have been uploaded to S3
  const uploadedCleanup = await cleanupUploadedFiles(prisma);

  // Clean up thumbnail cache
  // Get stats before cleanup for logging
  const thumbnailStats = await getThumbnailCacheStats();
  const thumbnailCleanedCount = await clearAllThumbnails();
  const thumbnailCleanup: ThumbnailCleanupResult = {
    clearedCount: thumbnailCleanedCount,
  };

  // Find orphaned files (for monitoring/alerting)
  const orphanedFiles = await findOrphanedFiles(prisma);

  console.log('[CleanupService] Cleanup complete:', {
    projectsCleaned: Object.keys(tempCleanup).length,
    uploadedFilesCleaned: uploadedCleanup.deletedFiles,
    thumbnailsCleaned: thumbnailCleanedCount,
    thumbnailCacheSizeBefore: `${(thumbnailStats.totalBytes / 1024 / 1024).toFixed(2)}MB`,
    orphanedFilesFound: orphanedFiles.length,
  });

  return {
    tempCleanup,
    uploadedCleanup,
    thumbnailCleanup,
    orphanedFiles,
  };
}

// ============================================================================
// Export
// ============================================================================

export default {
  cleanupProjectTempFiles,
  cleanupAllTempFiles,
  getProjectDiskUsage,
  checkStorageThreshold,
  cleanupUploadedFiles,
  findOrphanedFiles,
  deleteProjectTempFiles,
  runScheduledCleanup,
};
