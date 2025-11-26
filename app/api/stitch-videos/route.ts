import { NextRequest, NextResponse } from 'next/server';
import { stitchVideos } from '@/lib/video/stitcher';
import path from 'path';
import fs from 'fs/promises';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import prisma from '@/lib/db/prisma';
import { getStorageService } from '@/lib/storage/storage-service';

/**
 * POST /api/stitch-videos
 * Stitches multiple video clips into a single video and optionally uploads to S3
 *
 * Request Body:
 * {
 *   videoPaths: string[];   // Required: Array of local video file paths (should be 5 videos)
 *   projectId: string;      // Required: Project ID
 *   uploadToS3?: boolean;   // Optional: Whether to upload to S3 (default: false)
 *   style?: 'whimsical' | 'luxury' | 'offroad' | null; // Optional: Visual style for LUT application
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
    const body = await request.json();
    const { videoPaths, projectId, uploadToS3: shouldUploadToS3 = false, style } = body;

    // Get session to fetch company logo (optional)
    const session = await getServerSession(authOptions);

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

    // Fetch company logo (only if session with companyId exists)
    let companyLogoPath: string | undefined;
    if (session?.user?.companyId) {
      try {
        const company = await prisma.company.findUnique({
          where: { id: session.user.companyId },
          include: {
            assets: {
              where: { type: 'LOGO' },
              select: {
                id: true,
                s3Key: true,
                filename: true,
              },
              take: 1, // Get the first logo
            },
          },
        });

        if (company?.assets && company.assets.length > 0) {
          const logoAsset = company.assets[0];
          if (logoAsset.s3Key) {
            // Download logo from S3 to local temp directory
            const storageService = getStorageService();
            const tempLogoPath = path.join('/tmp', 'projects', projectId, 'temp', `logo_${Date.now()}.png`);
            await fs.mkdir(path.dirname(tempLogoPath), { recursive: true });

            // Download from S3 using pre-signed URL
            const logoUrl = await storageService.getPreSignedUrl(logoAsset.s3Key, 3600);
            const response = await fetch(logoUrl);
            if (response.ok) {
              const buffer = await response.arrayBuffer();
              await fs.writeFile(tempLogoPath, Buffer.from(buffer));
              companyLogoPath = tempLogoPath;
              console.log(`[API] Company logo downloaded to: ${companyLogoPath}`);
            } else {
              console.warn(`[API] Failed to download company logo from S3: ${response.statusText}`);
            }
          }
        } else {
          console.log('[API] No company logo found, proceeding without logo transition');
        }
      } catch (logoError) {
        console.error('[API] Error fetching company logo:', logoError);
        // Continue without logo if fetch fails
      }
    } else {
      console.log('[API] No session or companyId, proceeding without logo transition');
    }

    // Stitch videos (stitcher creates its own output path and uploads to S3)
    const result = await stitchVideos(absoluteVideoPaths, projectId, undefined, style, companyLogoPath);

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

