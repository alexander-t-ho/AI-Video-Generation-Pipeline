import { NextRequest, NextResponse } from 'next/server';
import { stitchVideos } from '@/lib/video/stitcher';
import { applyClipEdits, clearClipEditCache } from '@/lib/video/editor';
import { TimelineClip } from '@/lib/types';
import path from 'path';
import fs from 'fs/promises';

/**
 * POST /api/generate-preview
 * Generates a preview video by stitching timeline clips with edits applied.
 * This creates a temporary preview video for smooth playback in the timeline.
 * 
 * Request Body:
 * {
 *   clips: Array<{
 *     id: string;
 *     videoLocalPath: string;
 *     trimStart?: number;
 *     trimEnd?: number;
 *     sourceDuration: number;
 *   }>;
 *   projectId: string;
 * }
 * 
 * Response:
 * {
 *   success: boolean;
 *   data?: {
 *     previewVideoPath: string;
 *   };
 *   error?: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clips, projectId } = body;

    if (!Array.isArray(clips) || clips.length === 0) {
      return NextResponse.json(
        { success: false, error: 'clips array is required and must not be empty' },
        { status: 400 }
      );
    }

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'projectId is required and must be a string' },
        { status: 400 }
      );
    }

    // Validate each clip object
    for (const clip of clips) {
      if (
        typeof clip.id !== 'string' ||
        typeof clip.videoLocalPath !== 'string' ||
        typeof clip.sourceDuration !== 'number' ||
        (clip.trimStart !== undefined && typeof clip.trimStart !== 'number') ||
        (clip.trimEnd !== undefined && typeof clip.trimEnd !== 'number')
      ) {
        return NextResponse.json(
          { success: false, error: 'Invalid clip object format' },
          { status: 400 }
        );
      }
    }

    // Clear old cached clips to ensure fresh processing with latest encoding
    // This fixes issues with clips that may have been encoded with broken settings
    const timelineEditsDir = path.join('/tmp', 'projects', projectId, 'timeline-edits');
    try {
      await fs.rm(timelineEditsDir, { recursive: true, force: true });
    } catch {
      // Directory may not exist yet
    }
    clearClipEditCache();

    // Apply clip edits (trim/crop) to get edited video paths
    const editedVideoPaths = await applyClipEdits(clips as TimelineClip[], projectId);

    // Create preview output directory (separate from final output)
    const previewDir = path.join('/tmp', 'projects', projectId, 'preview');
    await fs.mkdir(previewDir, { recursive: true });

    // Stitch the edited videos into a preview
    // We'll use a modified version that outputs to preview directory
    // For now, let's create a simple concatenated preview without transitions for speed
    const previewPath = path.join(previewDir, 'preview.mp4');

    // Use the existing stitchVideos function but we need to modify output path
    // Actually, let's create a simpler preview version that's faster
    // We can reuse stitchVideos by temporarily changing the output directory logic
    
    // Create a concat file for concatenation
    const concatFilePath = path.join(previewDir, 'concat.txt');
    const concatLines = editedVideoPaths.map(vp => `file '${vp.replace(/'/g, "'\\''")}'`).join('\n');
    await fs.writeFile(concatFilePath, concatLines);

    // Use ffmpeg with smooth playback techniques (same as final stitcher)
    // Apply motion interpolation and constant frame rate for smooth playback
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // OPTIMIZED: Fast preview generation without motion interpolation
    // Uses lower resolution (720p) and ultrafast preset for quick preview
    // Motion interpolation is too CPU-intensive for preview - save it for final render
    const filterComplex = `[0:v]setpts=PTS-STARTPTS,fps=30,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2[v]`;

    // Use ultrafast preset and higher CRF for quick preview generation
    const commandWithAudio = `ffmpeg -f concat -safe 0 -i "${concatFilePath}" -filter_complex "${filterComplex}" -map "[v]" -c:v libx264 -preset ultrafast -crf 28 -r 30 -fps_mode cfr -c:a aac -b:a 96k -async 1 -y "${previewPath}"`;

    const commandNoAudio = `ffmpeg -f concat -safe 0 -i "${concatFilePath}" -filter_complex "${filterComplex}" -map "[v]" -c:v libx264 -preset ultrafast -crf 28 -r 30 -fps_mode cfr -an -y "${previewPath}"`;

    console.log(`[Preview] Generating fast preview (720p, ultrafast preset)...`);
    console.log(`[Preview] Processing ${clips.length} clips`);
    
    try {
      await execAsync(commandWithAudio);
    } catch (error: any) {
      // If audio processing fails (no audio streams), try without audio
      console.log('[Preview] Audio processing failed, trying without audio...');
      await execAsync(commandNoAudio);
    }

    // Clean up concat file
    try {
      await fs.unlink(concatFilePath);
    } catch {
      // Ignore cleanup errors
    }

    // Verify preview file was created
    try {
      await fs.access(previewPath);
    } catch {
      throw new Error('Preview video file was not created');
    }

    return NextResponse.json({
      success: true,
      data: {
        previewVideoPath: previewPath,
      },
    });
  } catch (error: any) {
    console.error('[API] Generate preview error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to generate preview',
      },
      { status: 500 }
    );
  }
}

