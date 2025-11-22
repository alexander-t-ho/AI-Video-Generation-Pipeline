import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import prisma from '@/lib/db/prisma';
import { stitchVideos } from '@/lib/video/stitcher';
import path from 'path';
import fs from 'fs/promises';

/**
 * POST /api/stitch-videos
 * Stitches multiple video clips into a single video and optionally uploads to S3
 * 
 * Request Body:
 * {
 *   videoPaths: string[];   // Required: Array of local video file paths (should be 5 videos)
 *   projectId: string;      // Required: Project ID
 *   uploadToS3?: boolean;   // Optional: Whether to upload to S3 (default: false)
 * }
 * 
 * Response:
 * {
 *   success: boolean;
 *   data?: {
 *     finalVideoPath: string;
 *     s3Url?: string;
 *     s3Key?: string;
 *   };
 *   error?: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Get user session to access company information
    const session = await getServerSession(authOptions);

    const body = await request.json();
    const { videoPaths, projectId, uploadToS3: shouldUploadToS3 = false } = body;

    // Validate required fields
    if (!Array.isArray(videoPaths) || videoPaths.length === 0) {
      return NextResponse.json(
        { success: false, error: 'videoPaths is required and must be a non-empty array' },
        { status: 400 }
      );
    }

    // Allow stitching any number of videos (at least 1)
    // Note: PRD mentions 5 scenes, but allow flexibility for partial stitching

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'projectId is required and must be a string' },
        { status: 400 }
      );
    }

    // Convert relative paths to absolute and verify all videos exist
    const projectRoot = process.cwd();
    const absoluteVideoPaths: string[] = [];

    for (const videoPath of videoPaths) {
      if (typeof videoPath !== 'string') {
        return NextResponse.json(
          { success: false, error: 'All video paths must be strings' },
          { status: 400 }
        );
      }

      const absolutePath = path.isAbsolute(videoPath)
        ? videoPath
        : path.join(projectRoot, videoPath);

      // Verify video file exists
      try {
        await fs.access(absolutePath);
      } catch {
        return NextResponse.json(
          { success: false, error: `Video file not found: ${videoPath}` },
          { status: 404 }
        );
      }

      absoluteVideoPaths.push(absolutePath);
    }

    // Fetch company logo if user is logged in and has a company
    let companyLogoS3Key: string | undefined;
    if (session?.user?.companyId) {
      try {
        // Get the most recent logo for the company
        const logoAsset = await prisma.companyAsset.findFirst({
          where: {
            companyId: session.user.companyId,
            type: 'LOGO',
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

        if (logoAsset?.s3Key) {
          companyLogoS3Key = logoAsset.s3Key;
          console.log('[API] Using company logo for final scene:', companyLogoS3Key);
        } else {
          console.log('[API] No company logo found, skipping final logo scene');
        }
      } catch (error) {
        console.error('[API] Failed to fetch company logo:', error);
        // Continue without logo if fetching fails
      }
    } else {
      console.log('[API] No user session or company ID, skipping final logo scene');
    }

    // Stitch videos (stitcher creates its own output path and uploads to S3)
    const result = await stitchVideos(absoluteVideoPaths, projectId, {
      companyLogoS3Key,
    });

    // Use absolute path for response (client will handle serving it)
    const response: any = {
      success: true,
      data: {
        finalVideoPath: result.localPath,
        s3Url: result.s3Url,
        s3Key: result.s3Key,
      },
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[API] Video stitching error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Video stitching failed',
      },
      { status: 500 }
    );
  }
}

