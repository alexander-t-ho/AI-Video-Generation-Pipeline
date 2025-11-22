import fs from 'fs/promises';
import path from 'path';

/**
 * Copy a file from source to destination
 */
export async function copyFile(sourcePath: string, destPath: string): Promise<void> {
  try {
    // Ensure the destination directory exists
    const destDir = path.dirname(destPath);
    await fs.mkdir(destDir, { recursive: true });

    // Copy the file
    await fs.copyFile(sourcePath, destPath);
  } catch (error) {
    console.error(`Failed to copy file from ${sourcePath} to ${destPath}:`, error);
    throw error;
  }
}

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a file
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    console.error(`Failed to delete file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Move a file from source to destination
 */
export async function moveFile(sourcePath: string, destPath: string): Promise<void> {
  try {
    // Ensure the destination directory exists
    const destDir = path.dirname(destPath);
    await fs.mkdir(destDir, { recursive: true });

    // Move the file
    await fs.rename(sourcePath, destPath);
  } catch (error) {
    console.error(`Failed to move file from ${sourcePath} to ${destPath}:`, error);
    throw error;
  }
}
