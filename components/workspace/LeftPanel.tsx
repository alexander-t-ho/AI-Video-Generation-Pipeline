'use client';

import { useEffect, useRef, useState } from 'react';
import AgentChat from './AgentChat';
import ChatInput from './ChatInput';
import APIPreviewPanel from './APIPreviewPanel';
import ModelParameterForm from './ModelParameterForm';
import { useProjectStore, useSceneStore, useUIStore, useProjectCoreStore } from '@/lib/state/project-store';
import { useGenerationStatus } from '@/lib/hooks/useGenerationStatus';
import { ChevronLeft, ChevronDown, ChevronUp, Settings } from 'lucide-react';
import {
  generateImage,
  pollImageStatus,
  generateVideo,
  pollVideoStatus,
  extractFrames,
  stitchVideos,
  generateStoryboard,
  uploadImages,
} from '@/lib/api-client';
import { ImageGenerationRequest, GeneratedImage, GeneratedVideo, SceneWithState } from '@/lib/types';
import { getActiveModel } from '@/lib/config/model-runtime';

interface LeftPanelProps {
  onCollapse?: () => void;
}

type CommandType =
  | 'generate_image'
  | 'regenerate_image'
  | 'generate_video'
  | 'select_seed_frame'
  | 'stitch_videos'
  | 'regenerate_storyboard'
  | 'unknown';

interface ParsedCommand {
  type: CommandType;
  sceneIndex?: number;
  frameIndex?: number;
  customPrompt?: string;
  uploadedImageUrls?: string[];
}

export default function LeftPanel({ onCollapse }: LeftPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    project,
    chatMessages,
    addChatMessage,
    scenes,
    currentSceneIndex,
    setCurrentSceneIndex,
    setSceneStatus,
    addGeneratedImage,
    selectImage,
    setVideoPath,
    setSeedFrames,
    selectSeedFrame,
    setFinalVideo,
    setStoryboard,
    setViewMode,
    updateSceneModelParameters,
    mediaDrawer,
  } = useProjectStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAPIPreviewExpanded, setIsAPIPreviewExpanded] = useState(false);
  const [isParametersExpanded, setIsParametersExpanded] = useState(false);

  // Enable real-time status updates
  // Disabled for now since the endpoint doesn't exist - will enable when API is ready
  useGenerationStatus({
    projectId: project?.id || null,
    enabled: false, // Disabled until /api/project/[projectId]/status endpoint is implemented
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  /**
   * Parse user message to extract command and parameters
   */
  const parseCommand = (message: string): ParsedCommand => {
    const lowerMessage = message.toLowerCase().trim();

    // Extract scene number (1-5) from message
    const sceneMatch = lowerMessage.match(/scene\s*(\d+)|scene\s*(\d+)/i);
    const sceneNumber = sceneMatch
      ? parseInt(sceneMatch[1] || sceneMatch[2] || '1', 10)
      : null;
    const sceneIndex = sceneNumber ? sceneNumber - 1 : currentSceneIndex;

    // Extract frame number (1-5) from message
    const frameMatch = lowerMessage.match(/frame\s*(\d+)|seed\s*frame\s*(\d+)/i);
    const frameNumber = frameMatch
      ? parseInt(frameMatch[1] || frameMatch[2] || '1', 10)
      : null;
    const frameIndex = frameNumber ? frameNumber - 1 : undefined;

    // Check for custom prompt (text after "with" or "using")
    const promptMatch = message.match(/(?:with|using|prompt:)\s*(.+)/i);
    const customPrompt = promptMatch ? promptMatch[1].trim() : undefined;

    // Command detection patterns
    if (
      /generate\s+image|create\s+image|make\s+image/i.test(lowerMessage) ||
      /image\s+for\s+scene/i.test(lowerMessage)
    ) {
      return {
        type: 'generate_image',
        sceneIndex: sceneIndex >= 0 && sceneIndex < 5 ? sceneIndex : currentSceneIndex,
        customPrompt,
      };
    }

    if (
      /regenerate\s+image|redo\s+image|new\s+image|different\s+image/i.test(lowerMessage)
    ) {
      return {
        type: 'regenerate_image',
        sceneIndex: sceneIndex >= 0 && sceneIndex < 5 ? sceneIndex : currentSceneIndex,
        customPrompt,
      };
    }

    if (
      /generate\s+video|create\s+video|make\s+video/i.test(lowerMessage) ||
      /video\s+for\s+scene/i.test(lowerMessage)
    ) {
      return {
        type: 'generate_video',
        sceneIndex: sceneIndex >= 0 && sceneIndex < 5 ? sceneIndex : currentSceneIndex,
      };
    }

    if (
      /select\s+seed\s+frame|choose\s+frame|pick\s+frame|use\s+frame/i.test(lowerMessage)
    ) {
      return {
        type: 'select_seed_frame',
        sceneIndex: sceneIndex >= 0 && sceneIndex < 5 ? sceneIndex : currentSceneIndex,
        frameIndex: frameIndex !== undefined && frameIndex >= 0 && frameIndex < 5 ? frameIndex : undefined,
      };
    }

    if (
      /stitch\s+video|combine\s+video|merge\s+video|final\s+video/i.test(lowerMessage)
    ) {
      return { type: 'stitch_videos' };
    }

    if (
      /regenerate\s+storyboard|new\s+storyboard|redo\s+storyboard|different\s+storyboard/i.test(
        lowerMessage
      )
    ) {
      return { type: 'regenerate_storyboard', customPrompt };
    }

    return { type: 'unknown' };
  };

  /**
   * Get seed frame URL from previous scene
   */
  const getSeedFrameUrl = (sceneIndex: number): string | undefined => {
    if (sceneIndex === 0) return undefined;
    const previousScene = scenes[sceneIndex - 1];
    if (
      previousScene?.selectedSeedFrameIndex !== undefined &&
      previousScene.seedFrames
    ) {
      const selectedFrame =
        previousScene.seedFrames[previousScene.selectedSeedFrameIndex];
      return selectedFrame?.url;
    }
    return undefined;
  };

  /**
   * Get product reference image from Scene 1 for consistency
   * This takes priority over seed frames for maintaining product consistency
   */
  const getProductReferenceImage = (sceneIndex: number): string | undefined => {
    // For Scene 0, no reference needed
    if (sceneIndex === 0) return undefined;
    
    // Use Scene 0's first generated image as the product reference
    if (scenes[0]?.generatedImages?.length > 0) {
      const firstSceneImage = scenes[0].generatedImages[0];
      if (firstSceneImage?.url) {
        return firstSceneImage.url;
      }
    }
    
    return undefined;
  };

  /**
   * Get reference image URLs from previous scenes for consistency
   */
  const getReferenceImageUrls = (sceneIndex: number): string[] => {
    const referenceUrls: string[] = [];
    
    // Use the first scene's generated image as the primary reference for product consistency
    if (sceneIndex > 0 && scenes[0]?.generatedImages?.length > 0) {
      const firstSceneImage = scenes[0].generatedImages[0];
      if (firstSceneImage?.url) {
        referenceUrls.push(firstSceneImage.url);
      }
    }
    
    // Also include the previous scene's selected image if available (for visual continuity)
    if (sceneIndex > 0) {
      const previousScene = scenes[sceneIndex - 1];
      if (previousScene?.selectedImageId) {
        const previousImage = previousScene.generatedImages?.find(
          (img: GeneratedImage) => img.id === previousScene.selectedImageId
        );
        if (previousImage?.url && !referenceUrls.includes(previousImage.url)) {
          referenceUrls.push(previousImage.url);
        }
      }
    }
    
    return referenceUrls;
  };

  /**
   * Helper to resolve Media Item ID to URL
   */
  const getMediaUrl = (id: string): string | undefined => {
    if (!project) return undefined;

    // Check uploaded images
    const uploaded = project.uploadedImages?.find(img => img.id === id);
    if (uploaded) {
      // Prefer S3 URL if available, otherwise fallback to local/served URL
      // For API calls, we prefer the raw S3 URL if possible
      return uploaded.url; 
    }

    // Check generated images in scenes
    for (const scene of scenes) {
      const generated = scene.generatedImages?.find(img => img.id === id);
      if (generated) return generated.url;
    }
    
    // Check seed frames
    for (const scene of scenes) {
       const frame = scene.seedFrames?.find(f => f.id === id);
       if (frame) return frame.url;
    }

    return undefined;
  };

  /**
   * Handle image generation command
   */
  const handleGenerateImage = async (sceneIndex: number, customPrompt?: string, uploadedImageUrls: string[] = []) => {
    if (!project || !project.storyboard || !project.storyboard[sceneIndex]) {
      addChatMessage({
        role: 'agent',
        content: '❌ Error: Invalid scene. Please select a valid scene (1-5).',
        type: 'error',
      });
      return;
    }

    setIsProcessing(true);
    const scene = project.storyboard[sceneIndex];

    try {
      setSceneStatus(sceneIndex, 'generating_image');
      addChatMessage({
        role: 'agent',
        content: `Generating image for Scene ${sceneIndex + 1}/5...`,
        type: 'status',
      });

      // Determine Seed Image and Reference Images from Media Drawer
      // Media Drawer Selection Behavior:
      // - YELLOW highlighted (selectedItems): Passed as referenceImageUrls to I2I models
      // - PURPLE highlighted (seedImageId): Passed as seedImage, which maps to model-specific params:
      //   * Runway Gen-4 Image: 'image' parameter
      //   * FLUX models: 'image' parameter
      //   * Nano Banana: 'image_input' array parameter
      //   (Mapping handled in image-generator.ts createImagePrediction function)
      //
      // Priority 1: Image Input (uploadedImageUrls)
      // Priority 2: Explicit Seed Image (Purple/Violet selection)
      // Priority 3: First Reference Image (Yellow selection)
      // Priority 4: Fallback to previous scene consistency logic
      
      let seedImage: string | undefined;
      let referenceImageUrls: string[] = [];
      
      // Get latest state
      const { mediaDrawer } = useProjectStore.getState();
      const selectedMediaIds = mediaDrawer?.selectedItems || []; // Yellow highlights
      const explicitSeedId = mediaDrawer?.seedImageId; // Purple highlight
      
      console.log('[LeftPanel] Media Drawer State DEBUG:', {
        selectedMediaIds,
        explicitSeedId,
        fullMediaDrawer: mediaDrawer
      });
      
      if (uploadedImageUrls.length > 0) {
        // Priority 1: Image Input
        seedImage = uploadedImageUrls[0];
        
        // Use other uploaded images as reference
        if (uploadedImageUrls.length > 1) {
          referenceImageUrls.push(...uploadedImageUrls.slice(1));
        }
        
        // Add explicit seed as reference (since input is taking precedence as seed)
        if (explicitSeedId) {
           const url = getMediaUrl(explicitSeedId);
           if (url) referenceImageUrls.push(url);
        }
        
        // Add ALL selected media items as reference
        selectedMediaIds.forEach(id => {
          const url = getMediaUrl(id);
          if (url) referenceImageUrls.push(url);
        });
        
        addChatMessage({
          role: 'agent',
          content: `Using uploaded image as seed + ${referenceImageUrls.length} references.`,
          type: 'status',
        });
      } else if (explicitSeedId) {
        // Priority 2: Explicit Seed Image (Purple highlight from Media Drawer)
        seedImage = getMediaUrl(explicitSeedId);
        
        // Use selected items (Yellow highlights) as references
        selectedMediaIds.forEach(id => {
          const url = getMediaUrl(id);
          if (url) referenceImageUrls.push(url);
        });
        
        addChatMessage({
          role: 'agent',
          content: `Using selected seed image (purple) + ${referenceImageUrls.length} references (yellow).`,
          type: 'status',
        });
      } else if (selectedMediaIds.length > 0) {
        // Priority 3: First Reference Image (Yellow highlight - implicit seed)
        seedImage = getMediaUrl(selectedMediaIds[0]);
        
        // Use rest as reference
        if (selectedMediaIds.length > 1) {
          selectedMediaIds.slice(1).forEach(id => {
            const url = getMediaUrl(id);
            if (url) referenceImageUrls.push(url);
          });
        }
        
        addChatMessage({
          role: 'agent',
          content: `Using first yellow reference as seed + ${referenceImageUrls.length} additional references.`,
          type: 'status',
        });
      } else {
        // Priority 4: Fallback logic
        // For product consistency: use Scene 0's image as seed for all subsequent scenes
        const productReferenceImage = getProductReferenceImage(sceneIndex);
        seedImage = productReferenceImage || getSeedFrameUrl(sceneIndex);
        referenceImageUrls = getReferenceImageUrls(sceneIndex);
      }

      const request: ImageGenerationRequest = {
        prompt: customPrompt || scene.imagePrompt,
        projectId: project.id,
        sceneIndex,
        seedImage, 
        referenceImageUrls,
      };

      // Log complete API request for debugging
      console.log('========================================');
      console.log('[LeftPanel] Image Generation Request');
      console.log('========================================');
      console.log('Scene Index:', sceneIndex);
      console.log('Prompt:', request.prompt);
      console.log('Project ID:', request.projectId);
      console.log('Seed Image (purple highlight):', seedImage ? `${seedImage.substring(0, 80)}...` : 'none');
      console.log('Reference Images (yellow highlights):', referenceImageUrls.length);
      if (referenceImageUrls.length > 0) {
        referenceImageUrls.forEach((url, idx) => {
          console.log(`  [${idx}]: ${url.substring(0, 80)}...`);
        });
      }
      console.log('Full Request Object:', JSON.stringify(request, null, 2));
      console.log('========================================');

      const response = await generateImage(request);

      if (!response.success || !response.predictionId) {
        throw new Error(response.error || 'Failed to start image generation');
      }

      // Poll for completion
      const status = await pollImageStatus(response.predictionId, {
        interval: 2000,
        timeout: 300000,
        projectId: project.id,
        sceneIndex,
        prompt: customPrompt || scene.imagePrompt,
        onProgress: (progress) => {
          if (progress.progress) {
            addChatMessage({
              role: 'agent',
              content: `Image generation progress: ${Math.round(progress.progress)}%`,
              type: 'status',
            });
          }
        },
      });

      if (status.success && status.image) {
        addGeneratedImage(sceneIndex, status.image);
        if (!scenes[sceneIndex]?.selectedImageId) {
          selectImage(sceneIndex, status.image.id);
        }
        addChatMessage({
          role: 'agent',
          content: `✓ Image generated for Scene ${sceneIndex + 1}`,
          type: 'status',
        });
      } else {
        throw new Error(status.error || 'Image generation failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate image';
      setSceneStatus(sceneIndex, 'pending');
      addChatMessage({
        role: 'agent',
        content: `❌ Error: ${errorMessage}`,
        type: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Handle video generation command
   */
  const handleGenerateVideo = async (sceneIndex: number) => {
    if (!project || !project.storyboard || !project.storyboard[sceneIndex]) {
      addChatMessage({
        role: 'agent',
        content: '❌ Error: Invalid scene. Please select a valid scene (1-5).',
        type: 'error',
      });
      return;
    }

    const sceneState = scenes[sceneIndex];
    const selectedImage = sceneState?.selectedImageId
      ? sceneState.generatedImages.find((img: GeneratedImage) => img.id === sceneState.selectedImageId)
      : sceneState?.generatedImages[0];

    if (!selectedImage) {
      addChatMessage({
        role: 'agent',
        content: `❌ Error: Please generate and select an image for Scene ${sceneIndex + 1} first.`,
        type: 'error',
      });
      return;
    }

    setIsProcessing(true);
    const scene = project.storyboard[sceneIndex];

    try {
      setSceneStatus(sceneIndex, 'generating_video');
      addChatMessage({
        role: 'agent',
        content: `Generating video for Scene ${sceneIndex + 1}/5...`,
        type: 'status',
      });

      // Determine seed frame:
      // 1. Explicit seed image from Media Drawer (Violet selection)
      // 2. Default: Last frame of previous scene
      
      const { mediaDrawer } = useProjectStore.getState();
      const explicitSeedId = mediaDrawer?.seedImageId;
      
      let seedFrameUrl = getSeedFrameUrl(sceneIndex);
      
      if (explicitSeedId) {
         const explicitUrl = getMediaUrl(explicitSeedId);
         if (explicitUrl) {
            seedFrameUrl = explicitUrl;
            addChatMessage({
               role: 'agent',
               content: `Using selected seed image as start frame.`,
               type: 'status'
            });
         }
      }

      const sceneState = scenes[sceneIndex];
      const modelParameters = sceneState?.modelParameters;
      const response = await generateVideo(
        selectedImage.url,
        scene.videoPrompt || scene.imagePrompt, // Fallback to imagePrompt for backward compatibility
        project.id,
        sceneIndex,
        seedFrameUrl,
        scene.customDuration, // Pass custom duration if set
        undefined, // subsceneIndex not used
        modelParameters // Pass model-specific parameters
      );

      if (!response.predictionId) {
        throw new Error('Failed to start video generation');
      }

      // Poll for completion
      const status = await pollVideoStatus(response.predictionId, {
        interval: 5000,
        timeout: 600000,
        onProgress: (progress) => {
          addChatMessage({
            role: 'agent',
            content: `Video generation in progress... (${progress.status || 'processing'})`,
            type: 'status',
          });
        },
      });

      if (status.status === 'succeeded' && status.videoPath) {
        setVideoPath(sceneIndex, status.videoPath);
        addChatMessage({
          role: 'agent',
          content: `✓ Video generated for Scene ${sceneIndex + 1}. Extracting seed frames...`,
          type: 'status',
        });

        // Auto-extract frames (except for Scene 4)
        if (sceneIndex < 4) {
          await handleExtractFrames(sceneIndex, status.videoPath);
        }
      } else {
        throw new Error(status.error || 'Video generation failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate video';
      setSceneStatus(sceneIndex, 'image_ready');
      addChatMessage({
        role: 'agent',
        content: `❌ Error: ${errorMessage}`,
        type: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Handle frame extraction
   */
  const handleExtractFrames = async (sceneIndex: number, videoPath: string) => {
    if (!project) return;

    try {
      addChatMessage({
        role: 'agent',
        content: `Extracting seed frames from Scene ${sceneIndex + 1}...`,
        type: 'status',
      });

      const response = await extractFrames(videoPath, project.id, sceneIndex);

      if (response.frames && response.frames.length > 0) {
        const seedFrames = response.frames.map((frame) => ({
          id: frame.id,
          url: frame.url,
          timestamp: frame.timestamp,
        }));

        setSeedFrames(sceneIndex, seedFrames);
        addChatMessage({
          role: 'agent',
          content: `✓ Seed frames extracted. Please select a frame for Scene ${sceneIndex + 2}.`,
          type: 'status',
        });
      } else {
        throw new Error('No frames extracted');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to extract frames';
      addChatMessage({
        role: 'agent',
        content: `❌ Error: ${errorMessage}`,
        type: 'error',
      });
    }
  };

  /**
   * Handle seed frame selection
   */
  const handleSelectSeedFrame = (sceneIndex: number, frameIndex: number) => {
    if (sceneIndex < 0 || sceneIndex >= 5) {
      addChatMessage({
        role: 'agent',
        content: '❌ Error: Invalid scene. Please select a valid scene (1-5).',
        type: 'error',
      });
      return;
    }

    const sceneState = scenes[sceneIndex];
    if (!sceneState?.seedFrames || frameIndex < 0 || frameIndex >= sceneState.seedFrames.length) {
      addChatMessage({
        role: 'agent',
        content: `❌ Error: Invalid frame. Please select a frame between 1-${sceneState?.seedFrames?.length || 5}.`,
        type: 'error',
      });
      return;
    }

    selectSeedFrame(sceneIndex, frameIndex);
    addChatMessage({
      role: 'agent',
      content: `✓ Seed frame ${frameIndex + 1} selected for Scene ${sceneIndex + 2}`,
      type: 'status',
    });
  };

  /**
   * Handle video stitching
   */
  const handleStitchVideos = async () => {
    if (!project) {
      addChatMessage({
        role: 'agent',
        content: '❌ Error: No project found.',
        type: 'error',
      });
      return;
    }

    const videoPaths = scenes
      .map((s: SceneWithState) => {
        // Use selected video if available, otherwise fallback to videoLocalPath for backward compatibility
        if (s.selectedVideoId && s.generatedVideos) {
          const selectedVideo = s.generatedVideos.find((v: GeneratedVideo) => v.id === s.selectedVideoId);
          return selectedVideo?.localPath;
        }
        return s.videoLocalPath;
      })
      .filter((path: string | undefined): path is string => !!path);

    if (videoPaths.length === 0) {
      addChatMessage({
        role: 'agent',
        content: '❌ Error: No videos available to stitch. Please generate videos for all scenes first.',
        type: 'error',
      });
      return;
    }

    if (videoPaths.length < 5) {
      addChatMessage({
        role: 'agent',
        content: `⚠️ Warning: Only ${videoPaths.length} of 5 scenes have videos. Stitching available videos...`,
        type: 'suggestion',
      });
    }

    setIsProcessing(true);

    try {
      addChatMessage({
        role: 'agent',
        content: 'Stitching all videos together...',
        type: 'status',
      });

      const response = await stitchVideos(videoPaths, project.id);

      if (response.finalVideoPath) {
        const finalVideoUrl = response.finalVideoPath.startsWith('http')
          ? response.finalVideoPath
          : `/api/serve-video?path=${encodeURIComponent(response.finalVideoPath)}`;

        setFinalVideo(finalVideoUrl, response.s3Url);
        addChatMessage({
          role: 'agent',
          content: '✓ Final video stitched successfully! Ready for download.',
          type: 'status',
        });
      } else {
        throw new Error('Failed to stitch videos');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to stitch videos';
      addChatMessage({
        role: 'agent',
        content: `❌ Error: ${errorMessage}`,
        type: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Handle storyboard regeneration
   */
  const handleRegenerateStoryboard = async (customPrompt?: string) => {
    if (!project) {
      addChatMessage({
        role: 'agent',
        content: '❌ Error: No project found.',
        type: 'error',
      });
      return;
    }

    setIsProcessing(true);

    try {
      addChatMessage({
        role: 'agent',
        content: 'Regenerating storyboard...',
        type: 'status',
      });

      // Use custom prompt if provided, otherwise use original project prompt
      const prompt = customPrompt || project.prompt;
      const response = await generateStoryboard(
        prompt,
        project.targetDuration,
        [] // TODO: Get reference image URLs from project if available
      );

      if (response.success && response.scenes) {
        setStoryboard(response.scenes);
        addChatMessage({
          role: 'agent',
          content: '✓ Storyboard regenerated successfully!',
          type: 'status',
        });
      } else {
        throw new Error(response.error || 'Failed to regenerate storyboard');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to regenerate storyboard';
      addChatMessage({
        role: 'agent',
        content: `❌ Error: ${errorMessage}`,
        type: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Process user message and execute command
   */
  const processCommand = async (command: ParsedCommand) => {
    switch (command.type) {
      case 'generate_image':
      case 'regenerate_image':
        if (command.sceneIndex !== undefined) {
          await handleGenerateImage(command.sceneIndex, command.customPrompt, command.uploadedImageUrls);
        }
        break;

      case 'generate_video':
        if (command.sceneIndex !== undefined) {
          await handleGenerateVideo(command.sceneIndex);
        }
        break;

      case 'select_seed_frame':
        if (command.sceneIndex !== undefined && command.frameIndex !== undefined) {
          handleSelectSeedFrame(command.sceneIndex, command.frameIndex);
        } else {
          addChatMessage({
            role: 'agent',
            content: '❌ Error: Please specify which frame to select (e.g., "Select seed frame 3 for Scene 2").',
            type: 'error',
          });
        }
        break;

      case 'stitch_videos':
        await handleStitchVideos();
        break;

      case 'regenerate_storyboard':
        await handleRegenerateStoryboard(command.customPrompt);
        break;

      case 'unknown':
        addChatMessage({
          role: 'agent',
          content: `I didn't understand that command. Here are some commands you can use:\n\n` +
            `• "Generate image for Scene X" - Generate an image for a specific scene\n` +
            `• "Regenerate image" - Regenerate the current scene's image\n` +
            `• "Generate video" - Generate video for the current scene\n` +
            `• "Select seed frame X" - Select a seed frame for the next scene\n` +
            `• "Stitch videos" - Combine all scene videos into final video\n` +
            `• "Regenerate storyboard" - Create a new storyboard`,
          type: 'suggestion',
        });
        break;
    }
  };

  const handleSendMessage = async (message: string, images?: File[]) => {
    if (!message.trim() && (!images || images.length === 0)) return;

    // Add user message
    addChatMessage({
      role: 'user',
      content: message || `Uploaded ${images?.length || 0} image(s)`,
      type: 'message',
    });

    let uploadedUrls: string[] = [];

    // Handle image uploads if provided
    if (images && images.length > 0 && project) {
      try {
        addChatMessage({
          role: 'agent',
          content: `Uploading ${images.length} image(s)...`,
          type: 'status',
        });
        const uploadResult = await uploadImages(images, project.id);
        
        // Store full uploaded image objects in project state
        if (uploadResult.images) {
          const { setUploadedImages } = useProjectStore.getState();
          setUploadedImages(uploadResult.images);
        }

        // Get URLs for command processing
        if (uploadResult.urls) {
          uploadedUrls = uploadResult.urls;
        }
        
        addChatMessage({
          role: 'agent',
          content: `✓ ${images.length} image(s) uploaded successfully (with ${uploadResult.images?.reduce((sum, img) => sum + (img.processedVersions?.length || 0), 0) || 0} processed versions)`,
          type: 'status',
        });
      } catch (err) {
        console.error('Failed to upload images:', err);
        addChatMessage({
          role: 'agent',
          content: 'Warning: Image upload failed.',
          type: 'error',
        });
      }
    }

    // Parse and process command
    if (message.trim() || uploadedUrls.length > 0) {
      // Use message if available, otherwise default to generating image if images were uploaded
      const commandText = message.trim() || (uploadedUrls.length > 0 ? "generate image" : "");
      
      if (commandText) {
        const command = parseCommand(commandText);
        command.uploadedImageUrls = uploadedUrls;
        await processCommand(command);
      }
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-black">
      {/* Panel Header */}
      <div className="h-10 px-3 border-b border-white/20 bg-black backdrop-blur-sm flex items-center justify-between flex-shrink-0">
        <h2 className="text-xs font-medium text-white/80 uppercase tracking-wide">
          Agent
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsAPIPreviewExpanded(!isAPIPreviewExpanded)}
            className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
            title={isAPIPreviewExpanded ? "Show chat" : "Show API preview"}
            aria-label="Toggle API preview"
          >
            <span className="text-xs text-white/60 hover:text-white">
              {isAPIPreviewExpanded ? "💬" : "⚙️"}
            </span>
          </button>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
              aria-label="Collapse panel"
            >
              <ChevronLeft className="w-4 h-4 text-white/60 hover:text-white" />
            </button>
          )}
        </div>
      </div>

      {/* Content Area - Toggle between chat and API preview */}
      {isAPIPreviewExpanded ? (
        /* API Preview - Full Height */
        <div className="flex-1 overflow-hidden min-h-0">
          <APIPreviewPanel />
        </div>
      ) : (
        /* Chat Mode */
        <>
          {/* Model Parameters Section - Collapsible */}
          {project && scenes[currentSceneIndex] && (
            <div className="flex-shrink-0 border-b border-white/20">
              <button
                onClick={() => setIsParametersExpanded(!isParametersExpanded)}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-white/60" />
                  <span className="text-xs font-medium text-white/80">
                    Model Parameters
                  </span>
                </div>
                {isParametersExpanded ? (
                  <ChevronUp className="w-4 h-4 text-white/60" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-white/60" />
                )}
              </button>
              {isParametersExpanded && (
                <div className="px-3 py-3 bg-black/50 border-t border-white/10">
                  <ModelParameterForm
                    modelId={getActiveModel('video')}
                    initialParameters={scenes[currentSceneIndex]?.modelParameters}
                    sceneIndex={currentSceneIndex}
                    onChange={(parameters) => {
                      updateSceneModelParameters(currentSceneIndex, parameters);
                    }}
                    disabled={isProcessing}
                  />
                </div>
              )}
            </div>
          )}

          {/* Chat Container - Cursor style: clean padding */}
          <div
            ref={containerRef}
            className="flex-1 overflow-y-auto px-3 min-h-0"
            style={{ scrollBehavior: 'smooth' }}
          >
            <AgentChat />
          </div>

          {/* Chat Input */}
          <div className="flex-shrink-0">
            <ChatInput
              onSubmit={handleSendMessage}
              placeholder={isProcessing ? "Processing..." : "Type a message or drag images here..."}
              maxFiles={5}
              maxSizeMB={10}
              disabled={isProcessing}
            />
          </div>
        </>
      )}
    </div>
  );
}

