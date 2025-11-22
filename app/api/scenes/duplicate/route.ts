import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { copyFile } from '@/lib/storage/file-operations';
import path from 'path';
import type { GeneratedImage, GeneratedVideo, SeedFrame } from '@prisma/client';

/**
 * POST /api/scenes/duplicate
 * Duplicates a scene with all its generated media (images, videos, seed frames)
 */
export async function POST(req: NextRequest) {
  try {
    const { projectId, sceneId } = await req.json();

    if (!projectId || !sceneId) {
      return NextResponse.json(
        { success: false, error: 'Missing projectId or sceneId' },
        { status: 400 }
      );
    }

    // Fetch the scene to duplicate
    const originalScene = await prisma.scene.findUnique({
      where: { id: sceneId },
      include: {
        generatedImages: true,
        generatedVideos: true,
        seedFrames: true,
      },
    });

    if (!originalScene || originalScene.projectId !== projectId) {
      return NextResponse.json(
        { success: false, error: 'Scene not found or does not belong to project' },
        { status: 404 }
      );
    }

    // Calculate the new scene number (original + 0.1)
    // For example: Scene 2 becomes Scene 2.1
    const baseSceneNumber = Math.floor(originalScene.sceneNumber);

    // Find existing duplicates to determine the next sub-number
    const existingDuplicates = await prisma.scene.findMany({
      where: {
        projectId,
        sceneNumber: {
          gte: baseSceneNumber,
          lt: baseSceneNumber + 1,
        },
        isDuplicate: true,
      },
      orderBy: {
        sceneNumber: 'desc',
      },
    });

    // Calculate next sub-number (e.g., 2.1, 2.2, 2.3, etc.)
    let newSceneNumber: number;
    if (existingDuplicates.length === 0) {
      newSceneNumber = baseSceneNumber + 0.1;
    } else {
      const lastDuplicate = existingDuplicates[0];
      const lastSubNumber = Math.round((lastDuplicate.sceneNumber - baseSceneNumber) * 10);
      newSceneNumber = baseSceneNumber + (lastSubNumber + 1) / 10;
    }

    // Create the duplicated scene
    const duplicatedScene = await prisma.scene.create({
      data: {
        projectId: originalScene.projectId,
        sceneNumber: newSceneNumber,
        sceneTitle: `${originalScene.sceneTitle} (Copy)`,
        sceneSummary: originalScene.sceneSummary,
        imagePrompt: originalScene.imagePrompt,
        videoPrompt: originalScene.videoPrompt,
        suggestedDuration: originalScene.suggestedDuration,
        negativePrompt: originalScene.negativePrompt,
        customDuration: originalScene.customDuration,
        customImageInput: originalScene.customImageInput,
        useSeedFrame: originalScene.useSeedFrame,
        modelParameters: originalScene.modelParameters as any,
        status: 'PENDING',
        isDuplicate: true,
        parentSceneId: originalScene.id,
      },
    });

    // Copy generated images
    const duplicatedImages: GeneratedImage[] = [];
    for (const image of originalScene.generatedImages) {
      let newLocalPath = image.localPath;
      let newS3Key = image.s3Key;

      // Copy the file if it exists locally
      if (image.localPath) {
        try {
          const fileExt = path.extname(image.localPath);
          const newFileName = `scene-${duplicatedScene.id}-image-${Date.now()}${fileExt}`;
          const newPath = path.join(path.dirname(image.localPath), newFileName);
          await copyFile(image.localPath, newPath);
          newLocalPath = newPath;
        } catch (error) {
          console.error('Failed to copy image file:', error);
        }
      }

      const newImage = await prisma.generatedImage.create({
        data: {
          sceneId: duplicatedScene.id,
          url: image.url,
          localPath: newLocalPath,
          s3Key: newS3Key,
          prompt: image.prompt,
          replicateId: image.replicateId,
          isSelected: image.isSelected,
        },
      });
      duplicatedImages.push(newImage);
    }

    // Copy generated videos
    const duplicatedVideos: GeneratedVideo[] = [];
    for (const video of originalScene.generatedVideos) {
      let newLocalPath = video.localPath;
      let newS3Key = video.s3Key;

      // Copy the file if it exists locally
      if (video.localPath) {
        try {
          const fileExt = path.extname(video.localPath);
          const newFileName = `scene-${duplicatedScene.id}-video-${Date.now()}${fileExt}`;
          const newPath = path.join(path.dirname(video.localPath), newFileName);
          await copyFile(video.localPath, newPath);
          newLocalPath = newPath;
        } catch (error) {
          console.error('Failed to copy video file:', error);
        }
      }

      const newVideo = await prisma.generatedVideo.create({
        data: {
          sceneId: duplicatedScene.id,
          url: video.url,
          localPath: newLocalPath,
          s3Key: newS3Key,
          duration: video.duration,
          prompt: video.prompt,
          isSelected: video.isSelected,
        },
      });
      duplicatedVideos.push(newVideo);
    }

    // Copy seed frames
    const duplicatedSeedFrames: SeedFrame[] = [];
    for (const frame of originalScene.seedFrames) {
      let newS3Key = frame.s3Key;

      const newFrame = await prisma.seedFrame.create({
        data: {
          sceneId: duplicatedScene.id,
          url: frame.url,
          s3Key: newS3Key,
          frameIndex: frame.frameIndex,
          isSelected: frame.isSelected,
        },
      });
      duplicatedSeedFrames.push(newFrame);
    }

    return NextResponse.json({
      success: true,
      duplicatedScene: {
        id: duplicatedScene.id,
        order: duplicatedScene.sceneNumber,
        description: duplicatedScene.sceneTitle,
        suggestedDuration: duplicatedScene.suggestedDuration,
        imagePrompt: duplicatedScene.imagePrompt,
        videoPrompt: duplicatedScene.videoPrompt,
        negativePrompt: duplicatedScene.negativePrompt,
        customDuration: duplicatedScene.customDuration,
        customImageInput: duplicatedScene.customImageInput,
        useSeedFrame: duplicatedScene.useSeedFrame,
        modelParameters: duplicatedScene.modelParameters,
      },
      duplicatedImages: duplicatedImages.map(img => ({
        id: img.id,
        url: img.url,
        localPath: img.localPath,
        s3Key: img.s3Key,
        prompt: img.prompt,
        replicateId: img.replicateId,
        createdAt: img.createdAt.toISOString(),
      })),
      duplicatedVideos: duplicatedVideos.map(vid => ({
        id: vid.id,
        url: vid.url,
        localPath: vid.localPath,
        s3Key: vid.s3Key,
        actualDuration: vid.duration,
        timestamp: vid.createdAt.toISOString(),
      })),
      duplicatedSeedFrames: duplicatedSeedFrames.map(frame => ({
        id: frame.id,
        url: frame.url,
        s3Key: frame.s3Key,
        timestamp: frame.frameIndex,
      })),
    });
  } catch (error) {
    console.error('Error duplicating scene:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to duplicate scene',
      },
      { status: 500 }
    );
  }
}
