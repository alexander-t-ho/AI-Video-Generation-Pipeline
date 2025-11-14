/**
 * Test endpoint to verify FFmpeg works on Vercel
 * 
 * DELETE THIS FILE BEFORE FINAL DEPLOYMENT
 * Or protect it with authentication
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  try {
    // Try to get FFmpeg version
    let ffmpegPath = 'ffmpeg';
    
    // On Vercel, try to use system FFmpeg first
    // If that fails, try the npm package path
    try {
      const { stdout } = await execAsync(`${ffmpegPath} -version`);
      return Response.json({
        success: true,
        message: 'FFmpeg is working!',
        version: stdout.split('\n')[0],
        path: ffmpegPath,
      });
    } catch (error) {
      // Try npm package path (optional - only if package is installed)
      // Note: This requires @ffmpeg-installer/ffmpeg to be installed
      // If not installed, this will fail gracefully
      try {
        // Use require with try-catch to handle missing module gracefully
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
        if (ffmpegInstaller && ffmpegInstaller.path) {
          ffmpegPath = ffmpegInstaller.path;
          const { stdout } = await execAsync(`${ffmpegPath} -version`);
          return Response.json({
            success: true,
            message: 'FFmpeg is working via npm package!',
            version: stdout.split('\n')[0],
            path: ffmpegPath,
          });
        }
        throw new Error('Package not installed');
      } catch (packageError) {
        return Response.json({
          success: false,
          error: 'FFmpeg not found',
          details: {
            systemError: String(error),
            packageError: String(packageError),
          },
          suggestion: 'Install @ffmpeg-installer/ffmpeg or configure FFmpeg in Vercel',
        }, { status: 500 });
      }
    }
  } catch (error) {
    return Response.json({
      success: false,
      error: 'Failed to test FFmpeg',
      details: String(error),
    }, { status: 500 });
  }
}

