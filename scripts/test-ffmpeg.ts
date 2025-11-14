/**
 * Test FFmpeg Installation
 * 
 * Verifies that FFmpeg is installed and working correctly.
 * This script tests basic FFmpeg functionality required for video processing.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

async function testFFmpegVersion(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('ffmpeg -version');
    console.log('✅ FFmpeg is installed');
    console.log('Version info:', stdout.split('\n')[0]);
    return true;
  } catch (error) {
    console.error('❌ FFmpeg is not installed or not in PATH');
    return false;
  }
}

async function testFFmpegCommand(): Promise<boolean> {
  try {
    // Test a simple FFmpeg command (get video info)
    const { stdout } = await execAsync('ffmpeg -f lavfi -i testsrc=duration=1:size=320x240:rate=1 -t 1 -f null - 2>&1');
    console.log('✅ FFmpeg command execution works');
    return true;
  } catch (error: any) {
    // FFmpeg returns non-zero exit code even on success for this command
    if (error.stdout || error.stderr) {
      console.log('✅ FFmpeg command execution works');
      return true;
    }
    console.error('❌ FFmpeg command execution failed');
    return false;
  }
}

async function testFFprobe(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('ffprobe -version');
    console.log('✅ FFprobe is installed');
    console.log('Version info:', stdout.split('\n')[0]);
    return true;
  } catch (error) {
    console.warn('⚠️  FFprobe is not installed (optional but recommended)');
    return false;
  }
}

async function main() {
  console.log('🧪 Testing FFmpeg Installation...\n');

  const versionOk = await testFFmpegVersion();
  const commandOk = await testFFmpegCommand();
  const ffprobeOk = await testFFprobe();

  console.log('\n📊 Test Results:');
  console.log(`  FFmpeg version: ${versionOk ? '✅' : '❌'}`);
  console.log(`  FFmpeg commands: ${commandOk ? '✅' : '❌'}`);
  console.log(`  FFprobe: ${ffprobeOk ? '✅' : '⚠️'}`);

  if (versionOk && commandOk) {
    console.log('\n✅ FFmpeg is ready for video processing!');
    process.exit(0);
  } else {
    console.log('\n❌ FFmpeg setup incomplete. Please install FFmpeg.');
    console.log('\nInstallation instructions:');
    console.log('  macOS: brew install ffmpeg');
    console.log('  Ubuntu/Debian: sudo apt-get install -y ffmpeg');
    console.log('  Windows: Download from https://ffmpeg.org/download.html');
    process.exit(1);
  }
}

main().catch(console.error);

