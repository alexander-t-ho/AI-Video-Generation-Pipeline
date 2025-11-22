import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { deleteFromS3 } from '@/lib/storage/s3-uploader';

/**
 * DELETE /api/images/[imageId]
 * Delete a generated image (both local file and S3 if exists)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { imageId: string } }
) {
  const startTime = Date.now();
  const { imageId } = params;

  console.log(`[Delete Image API] Starting deletion for image ID: ${imageId}`);

  try {
    // Parse request body for image details
    const body = await request.json();
    const { localPath, s3Key } = body;

    if (!localPath && !s3Key) {
      return NextResponse.json(
        {
          success: false,
          error: 'Either localPath or s3Key must be provided',
        },
        { status: 400 }
      );
    }

    const deletionResults: { local?: boolean; s3?: boolean; errors: string[] } = {
      errors: [],
    };

    // Delete local file if path provided
    if (localPath) {
      try {
        const fullPath = path.resolve(localPath);
        
        // Security check: ensure the path is within the project directory
        const projectRoot = path.resolve(process.cwd());
        if (!fullPath.startsWith(projectRoot)) {
          console.error(`[Delete Image API] Security error: Path outside project root: ${fullPath}`);
          deletionResults.errors.push('Invalid file path');
        } else {
          await fs.unlink(fullPath);
          deletionResults.local = true;
          console.log(`[Delete Image API] Local file deleted: ${localPath}`);
        }
      } catch (err) {
        const error = err as NodeJS.ErrnoException;
        if (error.code === 'ENOENT') {
          console.log(`[Delete Image API] Local file not found (already deleted?): ${localPath}`);
          deletionResults.local = true; // Consider it deleted
        } else {
          console.error(`[Delete Image API] Error deleting local file:`, error);
          deletionResults.errors.push(`Failed to delete local file: ${error.message}`);
        }
      }
    }

    // Delete from S3 if key provided
    if (s3Key) {
      try {
        await deleteFromS3(s3Key);
        deletionResults.s3 = true;
        console.log(`[Delete Image API] S3 file deleted: ${s3Key}`);
      } catch (err) {
        const error = err as Error;
        console.error(`[Delete Image API] Error deleting from S3:`, error);
        deletionResults.errors.push(`Failed to delete from S3: ${error.message}`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[Delete Image API] Completed in ${duration}ms`);

    // Return success if at least one deletion succeeded
    const success = deletionResults.local || deletionResults.s3;

    return NextResponse.json({
      success,
      message: success 
        ? 'Image deleted successfully' 
        : 'Failed to delete image',
      deletionResults,
      duration,
    });

  } catch (error) {
    console.error('[Delete Image API] Error:', error);
    const duration = Date.now() - startTime;
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete image',
        duration,
      },
      { status: 500 }
    );
  }
}


