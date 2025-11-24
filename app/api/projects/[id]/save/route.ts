import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { getSession, checkProjectAccess } from '@/lib/auth/auth-utils';

// POST /api/projects/[id]/save - Save full project state
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let body: any = null;
  try {
    const session = await getSession();
    const { id } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // First verify the project exists
    const existingProject = await prisma.project.findUnique({
      where: { id },
      select: { id: true, ownerId: true, companyId: true },
    });

    if (!existingProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Check access
    const hasAccess = await checkProjectAccess(session.user.id, id);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    body = await req.json();
    const {
      name,
      prompt,
      targetDuration,
      status,
      characterDescription,
      finalVideoUrl,
      finalVideoS3Key,
      storyboard, // Array of scenes
      timelineClips,
      textOverlays,
      uploadedImages,
    } = body;

    // Use transaction to ensure atomicity
    const project = await prisma.$transaction(async (tx) => {
      // Update project metadata
      const updatedProject = await tx.project.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(prompt !== undefined && { prompt }),
          ...(targetDuration !== undefined && { targetDuration }),
          ...(status !== undefined && { status }),
          ...(characterDescription !== undefined && { characterDescription }),
          ...(finalVideoUrl !== undefined && { finalVideoUrl }),
          ...(finalVideoS3Key !== undefined && { finalVideoS3Key }),
        },
      });

      // Update or create scenes from storyboard
      if (Array.isArray(storyboard) && storyboard.length > 0) {
        // Get existing scenes by ID and by sceneNumber
        const existingScenes = await tx.scene.findMany({
          where: { projectId: id },
          select: { id: true, sceneNumber: true },
        });
        const existingSceneIds = new Set(existingScenes.map(s => s.id));
        const existingSceneNumbers = new Map(existingScenes.map(s => [s.sceneNumber, s.id]));

        // Process each scene from storyboard
        for (let index = 0; index < storyboard.length; index++) {
          const sceneData = storyboard[index];
          try {
          // Use index as fallback if order/sceneNumber is invalid
          let sceneNumber = Number(sceneData.order ?? sceneData.sceneNumber ?? index);
          if (isNaN(sceneNumber) || sceneNumber < 0) {
            sceneNumber = index;
          }
          
          let suggestedDuration = Number(sceneData.suggestedDuration ?? sceneData.customDuration ?? 0);
          if (isNaN(suggestedDuration) || suggestedDuration < 0) {
            suggestedDuration = 0;
          }
          
          let customDuration = sceneData.customDuration != null ? Number(sceneData.customDuration) : null;
          if (customDuration !== null && (isNaN(customDuration) || customDuration < 0)) {
            customDuration = null;
          }
          
          // Ensure videoPrompt is not empty (required field)
          const videoPrompt = sceneData.videoPrompt || sceneData.imagePrompt || '';
          
          // Validate and normalize status enum
          const validStatuses = ['PENDING', 'GENERATING_IMAGE', 'IMAGE_READY', 'GENERATING_VIDEO', 'VIDEO_READY', 'COMPLETED'];
          const sceneStatus = validStatuses.includes(sceneData.status) ? sceneData.status : 'PENDING';
          
          // Handle referenceImageUrls - ensure it's a valid array or Prisma.JsonNull for JSON field
          let referenceImageUrls: string[] | typeof Prisma.JsonNull = Prisma.JsonNull;
          if (sceneData.referenceImageUrls) {
            if (Array.isArray(sceneData.referenceImageUrls) && sceneData.referenceImageUrls.length > 0) {
              // Filter out any invalid entries and ensure all are strings
              const filteredUrls = sceneData.referenceImageUrls
                .filter((url: any) => typeof url === 'string' && url.trim().length > 0)
                .map((url: string) => url.trim());
              // Set to Prisma.JsonNull if array becomes empty after filtering, otherwise use filtered array
              referenceImageUrls = filteredUrls.length > 0 ? filteredUrls : Prisma.JsonNull;
            }
          }
          
          // Handle customImageInput - convert array to JSON string if needed (schema expects String?)
          let customImageInput: string | null = null;
          if (sceneData.customImageInput != null) {
            if (Array.isArray(sceneData.customImageInput)) {
              // Convert array to JSON string
              customImageInput = JSON.stringify(sceneData.customImageInput);
            } else if (typeof sceneData.customImageInput === 'string') {
              customImageInput = sceneData.customImageInput;
            }
          }
          
          const scenePayload = {
            sceneNumber,
            sceneTitle: sceneData.description ?? sceneData.sceneTitle ?? '',
            sceneSummary: sceneData.description ?? sceneData.sceneSummary ?? '',
            imagePrompt: sceneData.imagePrompt ?? '',
            videoPrompt,
            suggestedDuration,
            negativePrompt: sceneData.negativePrompt ?? null,
            customDuration,
            customImageInput,
            useSeedFrame: sceneData.useSeedFrame ?? false,
            status: sceneStatus,
            modelParameters: sceneData.modelParameters ?? Prisma.JsonNull,
            isDuplicate: sceneData.isDuplicate ?? false,
            parentSceneId: sceneData.parentSceneId ?? null,
            referenceImageUrls,
          };

          if (sceneData.id && existingSceneIds.has(sceneData.id)) {
            // Update existing scene by ID
            await tx.scene.update({
              where: { id: sceneData.id },
              data: scenePayload,
            });
          } else if (existingSceneNumbers.has(sceneNumber)) {
            // Update existing scene by sceneNumber (avoid unique constraint violation)
            await tx.scene.update({
              where: { id: existingSceneNumbers.get(sceneNumber)! },
              data: scenePayload,
            });
          } else {
            // Create new scene
            await tx.scene.create({
              data: {
                ...scenePayload,
                projectId: id,
              },
            });
          }
          } catch (sceneError) {
            console.error(`Error processing scene ${sceneData.id || sceneData.order || 'unknown'}:`, sceneError);
            console.error('Scene data:', JSON.stringify(sceneData, null, 2));
            throw sceneError; // Re-throw to fail the transaction
          }
        }
      }

      // Update timeline clips
      if (Array.isArray(timelineClips)) {
        // Delete existing timeline clips
        await tx.timelineClip.deleteMany({
          where: { projectId: id },
        });

        // Create new timeline clips - only if references are valid
        if (timelineClips.length > 0) {
          // Get valid scene IDs for this project
          const validScenes = await tx.scene.findMany({
            where: { projectId: id },
            select: { id: true },
          });
          const validSceneIds = new Set(validScenes.map(s => s.id));

          // Get valid video IDs for scenes in this project
          const validVideos = await tx.generatedVideo.findMany({
            where: { scene: { projectId: id } },
            select: { id: true },
          });
          const validVideoIds = new Set(validVideos.map(v => v.id));

          for (const clip of timelineClips) {
            // Only create if both sceneId and videoId exist in the database
            if (clip.sceneId && clip.videoId &&
                validSceneIds.has(clip.sceneId) &&
                validVideoIds.has(clip.videoId)) {
              await tx.timelineClip.create({
                data: {
                  projectId: id,
                  sceneId: clip.sceneId,
                  videoId: clip.videoId,
                  title: clip.title ?? '',
                  startTime: clip.startTime ?? 0,
                  duration: clip.duration ?? 0,
                  trimStart: clip.trimStart ?? null,
                  trimEnd: clip.trimEnd ?? null,
                  order: clip.order ?? 0,
                },
              });
            }
          }
        }
      }

      // Update text overlays
      if (Array.isArray(textOverlays)) {
        // Delete existing text overlays
        await tx.textOverlay.deleteMany({
          where: { projectId: id },
        });

        // Create new text overlays
        if (textOverlays.length > 0) {
          await tx.textOverlay.createMany({
            data: textOverlays.map((overlay: any) => ({
              projectId: id,
              text: overlay.text ?? '',
              startTime: overlay.startTime ?? 0,
              duration: overlay.duration ?? 0,
              x: overlay.x ?? 0.5,
              y: overlay.y ?? 0.5,
              fontSize: overlay.fontSize ?? 48,
              fontFamily: overlay.fontFamily ?? 'Arial',
              fontColor: overlay.fontColor ?? '#FFFFFF',
              backgroundColor: overlay.backgroundColor ?? null,
              backgroundOpacity: overlay.backgroundOpacity ?? 0.0,
              textAlign: overlay.textAlign ?? 'center',
              fontWeight: overlay.fontWeight ?? 'normal',
              borderWidth: overlay.borderWidth ?? 0,
              borderColor: overlay.borderColor ?? null,
              opacity: overlay.opacity ?? 1.0,
              rotation: overlay.rotation ?? 0.0,
              shadowEnabled: overlay.shadowEnabled ?? false,
              shadowOffsetX: overlay.shadowOffsetX ?? 2,
              shadowOffsetY: overlay.shadowOffsetY ?? 2,
              shadowBlur: overlay.shadowBlur ?? 4,
              shadowColor: overlay.shadowColor ?? '#000000',
              animationIn: overlay.animationIn ?? null,
              animationOut: overlay.animationOut ?? null,
              order: overlay.order ?? 0,
            })),
          });
        }
      }

      // Update uploaded images metadata (not the files themselves)
      if (Array.isArray(uploadedImages)) {
        // Delete existing uploaded images
        await tx.uploadedImage.deleteMany({
          where: { projectId: id },
        });

        // Create new uploaded image records
        if (uploadedImages.length > 0) {
          // Map and filter in separate steps for TypeScript type safety
          const validImages = uploadedImages
            .map((img: any) => {
              // Handle both UploadedImage format (with processedVersions) and simple format
              const url = img.url ?? img.localPath ?? '';
              const s3Key = img.s3Key ?? null;
              const originalName = img.originalName ?? img.filename ?? 'image';
              const mimeType = img.mimeType ?? 'image/png';
              const size = typeof img.size === 'number' && !isNaN(img.size) ? img.size : 0;
              
              // Validate that we have at least a URL
              if (!url || url.trim().length === 0) {
                console.warn('Skipping uploaded image with no URL:', img);
                return null;
              }
              
              return {
                projectId: id,
                url: url.trim(),
                s3Key: s3Key ? String(s3Key) : null,
                originalName: String(originalName),
                mimeType: String(mimeType),
                size: size,
              };
            })
            .filter((img): img is NonNullable<typeof img> => img !== null); // Type guard to remove nulls
          
          if (validImages.length > 0) {
            await tx.uploadedImage.createMany({
              data: validImages,
            });
          }
        }
      }

      // Return updated project with all relations
      return await tx.project.findUnique({
        where: { id },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          scenes: {
            orderBy: { sceneNumber: 'asc' },
          },
          timelineClips: {
            orderBy: { order: 'asc' },
          },
          textOverlays: {
            orderBy: { order: 'asc' },
          },
          uploadedImages: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });
    });

    return NextResponse.json({ project });
  } catch (error) {
    console.error('Error saving project:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    // Add request body logging for debugging (sanitized)
    if (body) {
      try {
        const bodyClone = JSON.parse(JSON.stringify(body));
        // Remove large data that might cause issues
        if (bodyClone.storyboard) {
          bodyClone.storyboard = bodyClone.storyboard.map((s: any) => ({
            id: s.id,
            order: s.order,
            sceneNumber: s.sceneNumber,
            description: s.description?.substring(0, 50),
          }));
        }
        console.error('Request body (sanitized):', JSON.stringify(bodyClone, null, 2));
      } catch (e) {
        console.error('Could not log request body');
      }
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to save project', 
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

