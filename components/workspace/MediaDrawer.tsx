'use client';

import { useProjectStore } from '@/lib/state/project-store';
import { GeneratedImage, SeedFrame } from '@/lib/types';
import { Image as ImageIcon, Video, Search, Filter, ChevronDown, ChevronRight, X, Upload } from 'lucide-react';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useMediaDragDrop } from '@/lib/hooks/useMediaDragDrop';
import { getPublicBackgrounds, publicBackgroundToUploadedImage, PublicBackground } from '@/lib/backgrounds/public-backgrounds';

interface MediaItem {
  id: string;
  type: 'image' | 'video' | 'frame';
  url: string;
  sceneIndex?: number;
  prompt?: string;
  timestamp?: string;
  metadata?: Record<string, any>;
}

// Helper to add thumbnail query param to image URLs
function getThumbnailUrl(url: string, size: 'small' | 'medium' | 'large' = 'small'): string {
  // For S3 URLs, proxy through serve-image API for thumbnail generation
  if (url.startsWith('http://') || url.startsWith('https://')) {
    // S3 URL - proxy through serve-image for thumbnail
    return `/api/serve-image?url=${encodeURIComponent(url)}&thumb=${size}`;
  }

  // Only add thumbnail param to serve-image API URLs
  if (url.includes('/api/serve-image')) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}thumb=${size}`;
  }
  return url;
}

export default function MediaDrawer() {
  const {
    project,
    scenes,
    mediaDrawer,
    dragDrop,
    setMediaFilter: setFilter,
    setMediaSearchQuery: setSearchQuery,
    toggleMediaItem: toggleItem,
    selectMediaItem: selectItem,
    setCurrentSceneIndex,
    setViewMode,
    selectImage,
    selectVideo,
    viewMode,
    currentSceneIndex,
    addAdditionalMedia,
    removeAdditionalMedia,
    addSavedImage,
    removeSavedImage,
  } = useProjectStore();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    characterRefs: true,
    saved: true, // Saved images section
    images: true,
    videos: true,
    frames: true,
    uploaded: true,
    backgrounds: true,
    additional: true,
    final: true,
  });
  const [videoErrors, setVideoErrors] = useState<Record<string, boolean>>({});
  const [previewImage, setPreviewImage] = useState<MediaItem | null>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const videoRefsMap = useRef<Map<string, HTMLVideoElement>>(new Map());
  const videoHoverTimeoutsMap = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const [publicBackgrounds, setPublicBackgrounds] = useState<PublicBackground[]>([]);
  const additionalMediaInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAdditionalMedia, setIsUploadingAdditionalMedia] = useState(false);
  const [isSavedImagesDragOver, setIsSavedImagesDragOver] = useState(false);

  // Load public backgrounds on mount
  useEffect(() => {
    async function loadPublicBackgrounds() {
      const backgrounds = await getPublicBackgrounds();
      setPublicBackgrounds(backgrounds);
      console.log('[MediaDrawer] Loaded public backgrounds:', backgrounds);
    }
    loadPublicBackgrounds();
  }, []);

  // Auto-filter by scene when on video or images tab
  useEffect(() => {
    if (viewMode === 'video' || viewMode === 'images') {
      // Automatically set scene filter to current scene
      setFilter({
        ...mediaDrawer.filters,
        scene: currentSceneIndex,
      });
    } else {
      // Clear scene filter when not on video/images tabs
      if (mediaDrawer.filters.scene !== undefined) {
        setFilter({
          ...mediaDrawer.filters,
          scene: undefined,
        });
      }
    }
  }, [viewMode, currentSceneIndex]);
  const [visibleItems, setVisibleItems] = useState<Set<string>>(new Set());
  const thumbnailRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
      // Clean up all video hover timeouts
      videoHoverTimeoutsMap.current.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      videoHoverTimeoutsMap.current.clear();
    };
  }, []);

  // Setup intersection observer once on mount
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const itemId = entry.target.getAttribute('data-item-id');
          if (itemId && entry.isIntersecting) {
            setVisibleItems((prev) => new Set(prev).add(itemId));
          }
        });
      },
      {
        root: null,
        rootMargin: '50px', // Load items 50px before they enter viewport
        threshold: 0.01,
      }
    );

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (previewImage) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [previewImage]);

  // Get actual media from project state
  const generatedImages = useMemo(() => {
    const allImages: MediaItem[] = [];
    scenes.forEach((scene, sceneIndex) => {
      scene.generatedImages?.forEach((img) => {
        // Always serve through API using localPath for consistent access
        // S3 URLs may not be publicly accessible, so we proxy through our API
        let imageUrl: string;
        if (img.localPath) {
          imageUrl = `/api/serve-image?path=${encodeURIComponent(img.localPath)}`;
        } else if (img.url.startsWith('/api')) {
          imageUrl = img.url;
        } else if (!img.url.startsWith('http://') && !img.url.startsWith('https://')) {
          imageUrl = `/api/serve-image?path=${encodeURIComponent(img.url)}`;
        } else {
          // For external URLs (including S3), still try to use localPath if available
          imageUrl = `/api/serve-image?path=${encodeURIComponent(img.localPath || img.url)}`;
        }

        allImages.push({
          id: img.id,
          type: 'image' as const,
          url: imageUrl,
          sceneIndex,
          prompt: img.prompt,
          timestamp: img.createdAt,
          metadata: {
            // Store full URL for preview modal
            fullUrl: imageUrl,
          },
        });
      });
    });
    return allImages;
  }, [scenes]);

  const generatedVideos = useMemo(() => {
    const allVideos: MediaItem[] = [];
    scenes.forEach((scene, sceneIndex) => {
      // Show all generated videos (old and new)
      if (scene.generatedVideos && scene.generatedVideos.length > 0) {
        scene.generatedVideos.forEach((video) => {
          // Always serve through API using localPath for consistent access
          let videoUrl: string;
          if (video.localPath) {
            videoUrl = `/api/serve-video?path=${encodeURIComponent(video.localPath)}`;
          } else if (video.url.startsWith('/api')) {
            videoUrl = video.url;
          } else {
            videoUrl = `/api/serve-video?path=${encodeURIComponent(video.localPath || video.url)}`;
          }

          allVideos.push({
            id: video.id,
            type: 'video' as const,
            url: videoUrl,
            sceneIndex,
            timestamp: video.timestamp,
            metadata: {
              isSelected: scene.selectedVideoId === video.id,
              localPath: video.localPath,
              actualDuration: video.actualDuration,
              prompt: video.prompt,
            },
          });
        });
      } else if (scene.videoLocalPath) {
        // Backward compatibility: if no generatedVideos array but videoLocalPath exists
        // Create a GeneratedVideo object from the old format
        let videoUrl = scene.videoLocalPath;
        if (!videoUrl.startsWith('http') && !videoUrl.startsWith('/api')) {
          videoUrl = `/api/serve-video?path=${encodeURIComponent(scene.videoLocalPath)}`;
        }

        allVideos.push({
          id: `video-${sceneIndex}-legacy`,
          type: 'video' as const,
          url: videoUrl,
          sceneIndex,
          timestamp: new Date().toISOString(),
          metadata: {
            isSelected: true, // Legacy videos are always selected
            localPath: scene.videoLocalPath,
            actualDuration: scene.actualDuration,
          },
        });
      }
    });
    return allVideos;
  }, [scenes]);

  const seedFrames = useMemo(() => {
    const allFrames: MediaItem[] = [];
    // Only show seed frames for the current scene
    const currentScene = scenes[currentSceneIndex];

    currentScene?.seedFrames?.forEach((frame) => {
      // Always serve through API using localPath for consistent access
      let frameUrl: string;
      if (frame.localPath) {
        frameUrl = `/api/serve-image?path=${encodeURIComponent(frame.localPath)}`;
      } else if (frame.url.startsWith('/api')) {
        frameUrl = frame.url;
      } else if (!frame.url.startsWith('http://') && !frame.url.startsWith('https://')) {
        frameUrl = `/api/serve-image?path=${encodeURIComponent(frame.url)}`;
      } else {
        // For S3 URLs, use localPath if available
        frameUrl = `/api/serve-image?path=${encodeURIComponent(frame.localPath || frame.url)}`;
      }

      allFrames.push({
        id: frame.id,
        type: 'frame' as const,
        url: frameUrl,
        sceneIndex: currentSceneIndex,
        timestamp: frame.timestamp.toString(),
        metadata: {
          // Store full URL for preview modal
          fullUrl: frameUrl,
        },
      });
    });

    return allFrames;
  }, [scenes, currentSceneIndex]);

  // Brand assets (uploaded/selected reference images)
  const brandAssets = useMemo(() => {
    const allMedia: MediaItem[] = [];

    if (project?.uploadedImages) {
      project.uploadedImages.forEach((uploadedImage, imgIndex) => {
        console.log('[MediaDrawer] Processing uploaded image:', {
          id: uploadedImage.id,
          url: uploadedImage.url,
          localPath: uploadedImage.localPath,
          s3Key: uploadedImage.s3Key,
          hasProcessedVersions: !!uploadedImage.processedVersions?.length
        });
        
        // Add original image
        // For S3 URLs, use them directly; for local paths, serve through API
        let imageUrl: string;
        if (uploadedImage.url.startsWith('http://') || uploadedImage.url.startsWith('https://')) {
          // S3 or external URL - use directly
          imageUrl = uploadedImage.url;
        } else if (uploadedImage.localPath) {
          imageUrl = `/api/serve-image?path=${encodeURIComponent(uploadedImage.localPath)}`;
        } else if (uploadedImage.url.startsWith('/api')) {
          imageUrl = uploadedImage.url;
        } else {
          imageUrl = `/api/serve-image?path=${encodeURIComponent(uploadedImage.url)}`;
        }
        
        console.log('[MediaDrawer] Resolved image URL:', imageUrl);

        allMedia.push({
          id: uploadedImage.id,
          type: 'image' as const,
          url: imageUrl,
          metadata: {
            originalName: uploadedImage.originalName,
            imageIndex: imgIndex,
            fullUrl: imageUrl,
          },
          timestamp: uploadedImage.createdAt,
        });

        // Add all processed versions with labels
        if (uploadedImage.processedVersions && uploadedImage.processedVersions.length > 0) {
          uploadedImage.processedVersions.forEach((processed) => {
            // Always serve through API using localPath
            let processedUrl: string;
            if (processed.localPath) {
              processedUrl = `/api/serve-image?path=${encodeURIComponent(processed.localPath)}`;
            } else if (processed.url.startsWith('/api')) {
              processedUrl = processed.url;
            } else {
              processedUrl = `/api/serve-image?path=${encodeURIComponent(processed.localPath || processed.url)}`;
            }
            
            // Determine label based on iteration number
            // Iterations 1-2 are background removal, 3+ are edge cleanup
            let label = '';
            if (processed.iteration <= 2) {
              label = `BG Removed ${processed.iteration}`;
            } else {
              const edgeCleanupIter = processed.iteration - 2;
              label = `Edge Cleaned ${edgeCleanupIter}x`;
            }
            
            allMedia.push({
              id: processed.id,
              type: 'image' as const,
              url: processedUrl,
              metadata: {
                label,
                iteration: processed.iteration,
                originalName: uploadedImage.originalName,
                isProcessed: true,
                imageIndex: imgIndex,
                fullUrl: processedUrl,
              },
              timestamp: processed.createdAt,
            });
          });
        }
      });
    }
    
    return allMedia;
  }, [project?.uploadedImages]);
  
  const finalVideo = project?.finalVideoUrl;

  // Character references from project state
  const characterReferences = useMemo(() => {
    const refs: MediaItem[] = [];
    project?.characterReferences?.forEach((url, index) => {
      // Always serve through API - character references are stored as URLs/paths
      let imageUrl: string;
      if (url.startsWith('/api')) {
        imageUrl = url;
      } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
        imageUrl = `/api/serve-image?path=${encodeURIComponent(url)}`;
      } else {
        // For S3 or external URLs, try to proxy through API
        // Note: This may fail if localPath isn't available
        imageUrl = `/api/serve-image?path=${encodeURIComponent(url)}`;
      }
      refs.push({
        id: `character-ref-${index}`,
        type: 'image' as const,
        url: imageUrl,
        timestamp: new Date().toISOString(),
      });
    });
    return refs;
  }, [project?.characterReferences]);

  // Saved images from project state
  const savedImages = useMemo(() => {
    const allSaved: MediaItem[] = [];

    if (project?.savedImages) {
      project.savedImages.forEach((savedImage) => {
        // Always serve through API using localPath for consistent access
        let imageUrl: string;
        if (savedImage.url.startsWith('http://') || savedImage.url.startsWith('https://')) {
          // S3 or external URL - use directly
          imageUrl = savedImage.url;
        } else if (savedImage.localPath) {
          imageUrl = `/api/serve-image?path=${encodeURIComponent(savedImage.localPath)}`;
        } else if (savedImage.url.startsWith('/api')) {
          imageUrl = savedImage.url;
        } else {
          imageUrl = `/api/serve-image?path=${encodeURIComponent(savedImage.url)}`;
        }

        allSaved.push({
          id: savedImage.id,
          type: 'image' as const,
          url: imageUrl,
          sceneIndex: savedImage.sourceSceneIndex,
          prompt: savedImage.prompt,
          metadata: {
            fullUrl: imageUrl,
            name: savedImage.name,
            sourceType: savedImage.sourceType,
            savedAt: savedImage.savedAt,
          },
          timestamp: savedImage.savedAt,
        });
      });
    }

    return allSaved;
  }, [project?.savedImages]);

  // Background images from project state + public backgrounds
  const backgroundImages = useMemo(() => {
    const allBackgrounds: MediaItem[] = [];

    // Add public backgrounds first
    publicBackgrounds.forEach((bg) => {
      const uploadedImage = publicBackgroundToUploadedImage(bg);
      const imageUrl = uploadedImage.url;

      allBackgrounds.push({
        id: uploadedImage.id,
        type: 'image' as const,
        url: imageUrl,
        metadata: {
          originalName: uploadedImage.originalName,
          isPublicBackground: true,
          fullUrl: imageUrl,
          description: bg.description,
          tags: bg.tags,
        },
        timestamp: uploadedImage.createdAt,
      });
    });

    if (project?.backgroundImages) {
      project.backgroundImages.forEach((backgroundImage, imgIndex) => {
        console.log('[MediaDrawer] Processing background image:', {
          id: backgroundImage.id,
          url: backgroundImage.url,
          localPath: backgroundImage.localPath,
          s3Key: backgroundImage.s3Key,
          hasProcessedVersions: !!backgroundImage.processedVersions?.length
        });

        // Add original image
        // For S3 URLs, use them directly; for local paths, serve through API
        let imageUrl: string;
        if (backgroundImage.url.startsWith('http://') || backgroundImage.url.startsWith('https://')) {
          // S3 or external URL - use directly
          imageUrl = backgroundImage.url;
        } else if (backgroundImage.localPath) {
          imageUrl = `/api/serve-image?path=${encodeURIComponent(backgroundImage.localPath)}`;
        } else if (backgroundImage.url.startsWith('/api')) {
          imageUrl = backgroundImage.url;
        } else {
          imageUrl = `/api/serve-image?path=${encodeURIComponent(backgroundImage.url)}`;
        }

        console.log('[MediaDrawer] Resolved background image URL:', imageUrl);

        allBackgrounds.push({
          id: backgroundImage.id,
          type: 'image' as const,
          url: imageUrl,
          metadata: {
            originalName: backgroundImage.originalName,
            imageIndex: imgIndex,
            fullUrl: imageUrl,
          },
          timestamp: backgroundImage.createdAt,
        });

        // Add all processed versions with labels
        if (backgroundImage.processedVersions && backgroundImage.processedVersions.length > 0) {
          backgroundImage.processedVersions.forEach((processed) => {
            // Always serve through API using localPath
            let processedUrl: string;
            if (processed.localPath) {
              processedUrl = `/api/serve-image?path=${encodeURIComponent(processed.localPath)}`;
            } else if (processed.url.startsWith('/api')) {
              processedUrl = processed.url;
            } else {
              processedUrl = `/api/serve-image?path=${encodeURIComponent(processed.localPath || processed.url)}`;
            }

            // Determine label based on iteration number
            // Iterations 1-2 are background removal, 3+ are edge cleanup
            let label = '';
            if (processed.iteration <= 2) {
              label = `BG Removed ${processed.iteration}`;
            } else {
              const edgeCleanupIter = processed.iteration - 2;
              label = `Edge Cleaned ${edgeCleanupIter}x`;
            }

            allBackgrounds.push({
              id: processed.id,
              type: 'image' as const,
              url: processedUrl,
              metadata: {
                label,
                iteration: processed.iteration,
                originalName: backgroundImage.originalName,
                isProcessed: true,
                imageIndex: imgIndex,
                fullUrl: processedUrl,
              },
              timestamp: processed.createdAt,
            });
          });
        }
      });
    }

    return allBackgrounds;
  }, [project?.backgroundImages, publicBackgrounds]);

  // Additional media (user-uploaded custom media)
  const additionalMedia = useMemo(() => {
    const allMedia: MediaItem[] = [];

    if (project?.additionalMedia) {
      project.additionalMedia.forEach((item) => {
        let mediaUrl: string;
        if (item.type === 'video') {
          if (item.localPath) {
            mediaUrl = `/api/serve-video?path=${encodeURIComponent(item.localPath)}`;
          } else {
            mediaUrl = item.url;
          }
        } else {
          // image or audio
          if (item.localPath) {
            mediaUrl = `/api/serve-image?path=${encodeURIComponent(item.localPath)}`;
          } else {
            mediaUrl = item.url;
          }
        }

        allMedia.push({
          id: item.id,
          type: item.type === 'audio' ? 'video' as const : item.type, // Treat audio as video for now
          url: mediaUrl,
          metadata: {
            originalName: item.originalName,
            fullUrl: mediaUrl,
            fileSize: item.fileSize,
            duration: item.duration,
            thumbnailUrl: item.thumbnailUrl,
          },
          timestamp: item.createdAt,
        });
      });
    }

    return allMedia;
  }, [project?.additionalMedia]);

  // Drag and drop handler
  const handleMediaDrop = (itemId: string, itemType: 'image' | 'video' | 'frame', targetSceneIndex?: number) => {
    // Handle dropping media on video/timeline
    if (targetSceneIndex !== undefined) {
      setCurrentSceneIndex(targetSceneIndex);
      setViewMode('video');
      
      // If it's an image, select it for the scene
      if (itemType === 'image') {
        const scene = scenes[targetSceneIndex];
        const image = scene?.generatedImages?.find(img => img.id === itemId);
        if (image) {
          selectImage(targetSceneIndex, itemId);
        }
      }
    }
  };

  const { handleDragStart, handleDragEnd } = useMediaDragDrop({
    onDrop: handleMediaDrop,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleFilter = (filterType: 'scene' | 'type', value: any) => {
    setFilter({
      ...mediaDrawer.filters,
      [filterType]: value,
    });
  };

  const handleMediaClick = (item: MediaItem) => {
    // Toggle selection (Cycle: Unselected -> Reference -> Seed -> Unselected)
    toggleItem(item.id);

    // If it's from a scene, switch to that scene in video view
    if (item.sceneIndex !== undefined) {
      setCurrentSceneIndex(item.sceneIndex);
      setViewMode('video');

      // If it's an image, select it for the scene
      if (item.type === 'image') {
        selectImage(item.sceneIndex, item.id);
      }

      // If it's a video, toggle selection (deselect if already selected)
      if (item.type === 'video' && item.sceneIndex !== undefined) {
        const scene = scenes[item.sceneIndex];
        if (scene?.selectedVideoId === item.id) {
          // Deselect if clicking the already selected video
          selectVideo(item.sceneIndex, '');
        } else {
          // Select the video
          selectVideo(item.sceneIndex, item.id);
        }
      }
    }
  };

  const handleAdditionalMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingAdditionalMedia(true);

    try {
      for (const file of Array.from(files)) {
        // Validate file size (50MB max)
        if (file.size > 50 * 1024 * 1024) {
          alert(`${file.name} is too large. Maximum file size is 50MB.`);
          continue;
        }

        // Determine file type
        let mediaType: 'image' | 'video' | 'audio';
        if (file.type.startsWith('image/')) {
          mediaType = 'image';
        } else if (file.type.startsWith('video/')) {
          mediaType = 'video';
        } else if (file.type.startsWith('audio/')) {
          mediaType = 'audio';
        } else {
          alert(`${file.name} has unsupported file type.`);
          continue;
        }

        // Create temporary URL for preview
        const tempUrl = URL.createObjectURL(file);

        // Add to state immediately with temporary URL
        const mediaItem: import('@/lib/types').AdditionalMediaItem = {
          id: `temp-${Date.now()}-${Math.random()}`,
          type: mediaType,
          url: tempUrl,
          originalName: file.name,
          createdAt: new Date().toISOString(),
          fileSize: file.size,
        };

        addAdditionalMedia(mediaItem);

        // TODO: Upload to S3 and update with permanent URL
        // For now, the temporary blob URL will work for the session
      }
    } catch (error) {
      console.error('[MediaDrawer] Error uploading additional media:', error);
      alert('Failed to upload media. Please try again.');
    } finally {
      setIsUploadingAdditionalMedia(false);
      if (additionalMediaInputRef.current) {
        additionalMediaInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAdditionalMedia = (mediaId: string) => {
    if (confirm('Are you sure you want to remove this media?')) {
      removeAdditionalMedia(mediaId);
    }
  };

  // Handle saving an image to the saved images collection
  const handleSaveImage = (itemId: string, itemType: 'image' | 'video' | 'frame') => {
    if (itemType === 'video') {
      alert('Only images can be saved to the media drawer.');
      return;
    }

    // Find the image in the various sources
    let foundImage: any = null;
    let sourceType: 'generated' | 'seed-frame' | 'uploaded' | 'background' = 'generated';
    let sourceSceneIndex: number | undefined;

    // Check generated images
    for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
      const scene = scenes[sceneIdx];
      const img = scene.generatedImages?.find((img: any) => img.id === itemId);
      if (img) {
        foundImage = img;
        sourceType = 'generated';
        sourceSceneIndex = sceneIdx;
        break;
      }
    }

    // Check seed frames
    if (!foundImage) {
      for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
        const scene = scenes[sceneIdx];
        const frame = scene.seedFrames?.find((f: any) => f.id === itemId);
        if (frame) {
          foundImage = frame;
          sourceType = 'seed-frame';
          sourceSceneIndex = sceneIdx;
          break;
        }
      }
    }

    // Check uploaded images (brand assets)
    if (!foundImage && project?.uploadedImages) {
      for (const uploadedImage of project.uploadedImages) {
        if (uploadedImage.id === itemId) {
          foundImage = uploadedImage;
          sourceType = 'uploaded';
          break;
        }
        // Check processed versions
        if (uploadedImage.processedVersions) {
          const processed = uploadedImage.processedVersions.find((p: any) => p.id === itemId);
          if (processed) {
            foundImage = processed;
            sourceType = 'uploaded';
            break;
          }
        }
      }
    }

    // Check background images
    if (!foundImage && project?.backgroundImages) {
      for (const backgroundImage of project.backgroundImages) {
        if (backgroundImage.id === itemId) {
          foundImage = backgroundImage;
          sourceType = 'background';
          break;
        }
        // Check processed versions
        if (backgroundImage.processedVersions) {
          const processed = backgroundImage.processedVersions.find((p: any) => p.id === itemId);
          if (processed) {
            foundImage = processed;
            sourceType = 'background';
            break;
          }
        }
      }
    }

    if (!foundImage) {
      alert('Could not find the image to save.');
      return;
    }

    // Check if already saved
    if (project?.savedImages?.some(saved => saved.id === itemId)) {
      alert('This image is already saved to the media drawer.');
      return;
    }

    // Create saved image object
    const savedImage: import('@/lib/types').SavedImage = {
      id: foundImage.id,
      url: foundImage.url || foundImage.localPath,
      localPath: foundImage.localPath || foundImage.url,
      s3Key: foundImage.s3Key,
      prompt: foundImage.prompt,
      sourceSceneIndex,
      sourceType,
      savedAt: new Date().toISOString(),
    };

    addSavedImage(savedImage);
    alert('Image saved to media drawer!');
  };

  const handleRemoveSavedImage = (imageId: string) => {
    if (confirm('Remove this image from saved images?')) {
      removeSavedImage(imageId);
    }
  };

  const renderMediaThumbnail = (item: MediaItem, showRemoveButton: boolean = false) => {
    const isSelected = mediaDrawer.selectedItems.includes(item.id);
    const isSeed = mediaDrawer.seedImageId === item.id;
    const hasVideoError = videoErrors[item.id] || false;
    const isVisible = visibleItems.has(item.id);

    const handleClick = (e: React.MouseEvent) => {
      // Clear any pending single-click timeout
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      
      // For double-click, open preview
      if (e.detail === 2) {
        e.preventDefault();
        e.stopPropagation();
        if (item.type === 'image' || item.type === 'frame') {
          setPreviewImage(item);
        }
        return;
      }
      
      // For single-click, delay to check if it's actually a double-click
      clickTimeoutRef.current = setTimeout(() => {
        handleMediaClick(item);
        clickTimeoutRef.current = null;
      }, 200);
    };

    return (
      <div
        key={item.id}
        ref={(el) => {
          if (el) {
            thumbnailRefsMap.current.set(item.id, el);
            // Observe this element when it mounts
            if (observerRef.current) {
              observerRef.current.observe(el);
            }
          } else {
            // Unobserve when it unmounts
            const existingEl = thumbnailRefsMap.current.get(item.id);
            if (existingEl && observerRef.current) {
              observerRef.current.unobserve(existingEl);
            }
            thumbnailRefsMap.current.delete(item.id);
          }
        }}
        data-item-id={item.id}
        draggable
        onDragStart={(e) => handleDragStart(e, item.id, item.type)}
        onDragEnd={handleDragEnd}
        className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
          isSeed
            ? 'border-violet-500 ring-2 ring-violet-500/30 shadow-lg shadow-violet-500/20'
            : isSelected
              ? 'border-yellow-400 ring-2 ring-yellow-400/20'
              : 'border-white/20 hover:border-white/30'
        }`}
        onClick={handleClick}
      >
        {!isVisible ? (
          // Placeholder while not visible
          <div className="aspect-video bg-white/5 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        ) : item.type === 'image' || item.type === 'frame' ? (
          <img
            src={getThumbnailUrl(item.url, 'small')}
            alt={item.prompt || 'Media'}
            className="w-full h-full object-cover aspect-video"
            loading="lazy"
          />
        ) : item.type === 'video' && !hasVideoError ? (
          <video
            ref={(el) => {
              if (el) {
                videoRefsMap.current.set(item.id, el);
              } else {
                videoRefsMap.current.delete(item.id);
              }
            }}
            src={item.url}
            className="w-full h-full object-cover aspect-video"
            muted
            playsInline
            preload="metadata"
            onMouseEnter={(e) => {
              // Add delay before playing to prevent accidental loads
              const video = e.currentTarget;
              const timeoutId = setTimeout(() => {
                // Pause other videos
                if (playingVideoId && playingVideoId !== item.id) {
                  const otherVideo = videoRefsMap.current.get(playingVideoId);
                  if (otherVideo) {
                    otherVideo.pause();
                    otherVideo.currentTime = 0;
                  }
                }
                // Play this video
                setPlayingVideoId(item.id);
              video.play().catch(() => {
                // Ignore autoplay errors
              });
                videoHoverTimeoutsMap.current.delete(item.id);
              }, 200);
              videoHoverTimeoutsMap.current.set(item.id, timeoutId);
            }}
            onMouseLeave={(e) => {
              // Clear pending timeout
              const timeoutId = videoHoverTimeoutsMap.current.get(item.id);
              if (timeoutId) {
                clearTimeout(timeoutId);
                videoHoverTimeoutsMap.current.delete(item.id);
              }
              // Pause video when not hovering
              const video = e.currentTarget;
              video.pause();
              video.currentTime = 0; // Reset to beginning
              if (playingVideoId === item.id) {
                setPlayingVideoId(null);
              }
            }}
            onError={() => {
              // Mark this video as having an error
              setVideoErrors((prev) => ({ ...prev, [item.id]: true }));
            }}
          />
        ) : (
          <div className="aspect-video bg-white/5 flex items-center justify-center">
            <Video className="w-8 h-8 text-white/40" />
          </div>
        )}

        {/* Scene Badge */}
        {item.sceneIndex !== undefined && (
          <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 text-white text-xs rounded">
            Scene {item.sceneIndex + 1}
          </div>
        )}

        {/* Label Badge (for uploaded images and processed versions) */}
        {item.metadata?.label && (
          <div className={`absolute top-1 left-1 px-2 py-1 text-white text-[10px] rounded font-medium ${
            item.metadata.isOriginal 
              ? 'bg-blue-600/90' 
              : item.metadata.label.includes('Edge Cleaned')
              ? 'bg-purple-600/90'
              : 'bg-green-600/90'
          }`}>
            {item.metadata.label}
          </div>
        )}
        {/* Fallback: Iteration Badge (for other processed images without label) */}
        {!item.metadata?.label && item.metadata?.iteration !== undefined && (
          <div className="absolute top-1 left-1 px-2 py-1 bg-purple-600/90 text-white text-[10px] rounded font-medium">
            {item.metadata.iteration === 0 ? 'Original' : `Iteration ${item.metadata.iteration}`}
          </div>
        )}

        {/* Selected Indicator */}
        {/* For videos, only show blue dot if it's the selected video for the scene (not media drawer multi-select) */}
        {/* For images/frames, show if selected in media drawer OR if it's the selected image for the scene */}
        {((item.type === 'video' && item.metadata?.isSelected) ||
          ((item.type === 'image' || item.type === 'frame') && (isSelected || item.metadata?.isSelected))) && (
          <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500/80 rounded-full flex items-center justify-center border-2 border-white/40 shadow-lg">
            <div className="w-2 h-2 bg-white rounded-full" />
          </div>
        )}

        {/* Remove Button for Additional Media */}
        {showRemoveButton && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleRemoveAdditionalMedia(item.id);
            }}
            className="absolute bottom-2 right-2 p-1.5 bg-red-500/80 hover:bg-red-600 text-white rounded-full transition-colors border border-red-400/50"
            title="Remove media"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  };

  const renderSection = (
    title: string,
    sectionKey: string,
    items: MediaItem[],
    icon: React.ReactNode,
    emptyMessage: string,
    skipSceneFilter: boolean = false
  ) => {
    const isExpanded = expandedSections[sectionKey];
    const filteredItems = items.filter((item) => {
      if (mediaDrawer.searchQuery) {
        const query = mediaDrawer.searchQuery.toLowerCase();
        const matchesPrompt = item.prompt?.toLowerCase().includes(query);
        const matchesScene = item.sceneIndex !== undefined && `scene ${item.sceneIndex + 1}`.includes(query);
        if (!matchesPrompt && !matchesScene) return false;
      }
      // Skip scene filtering for Brand Assets and Backgrounds
      if (!skipSceneFilter && mediaDrawer.filters.scene !== undefined && item.sceneIndex !== mediaDrawer.filters.scene) {
        return false;
      }
      if (mediaDrawer.filters.type && item.type !== mediaDrawer.filters.type) {
        return false;
      }
      return true;
    });

    return (
      <div className="mb-4">
        <button
          onClick={() => toggleSection(sectionKey)}
          className="w-full flex items-center justify-between px-2 py-1.5 text-sm font-semibold text-white hover:bg-white/10 rounded-lg transition-colors"
        >
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-white/60" />
            ) : (
              <ChevronRight className="w-4 h-4 text-white/60" />
            )}
            <span className="text-white/60">{icon}</span>
            <span>{title}</span>
            {filteredItems.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-white/10 text-white/80 rounded-full border border-white/20">
                {filteredItems.length}
              </span>
            )}
          </div>
        </button>

        {isExpanded && (
          <div className="mt-2">
            {filteredItems.length === 0 ? (
              <p className="text-xs text-white/60 px-2 py-4 text-center">
                {emptyMessage}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {filteredItems.map(item => renderMediaThumbnail(item, false))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Search and Filter */}
      <div className="px-3 py-3 border-b border-white/20 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/40 z-10 pointer-events-none" />
          <input
            type="text"
            placeholder="Search media..."
            value={mediaDrawer.searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 text-white placeholder-white/40"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={mediaDrawer.filters.type || ''}
            onChange={(e) => handleFilter('type', e.target.value || undefined)}
            className="flex-1 px-3 py-1.5 text-xs bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 text-white backdrop-blur-sm"
            style={{ colorScheme: 'dark' }}
          >
            <option value="" className="bg-black text-white">All Types</option>
            <option value="image" className="bg-black text-white">Images</option>
            <option value="video" className="bg-black text-white">Videos</option>
            <option value="frame" className="bg-black text-white">Frames</option>
          </select>

          {project && project.storyboard.length > 0 && (
            <div className="flex-1 relative">
              <select
                value={mediaDrawer.filters.scene !== undefined ? mediaDrawer.filters.scene : ''}
                onChange={(e) => handleFilter('scene', e.target.value ? parseInt(e.target.value) : undefined)}
                className={`w-full px-3 py-1.5 text-xs bg-white/5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 text-white backdrop-blur-sm ${
                  viewMode === 'video' || viewMode === 'images'
                    ? 'border-blue-500/50 bg-blue-500/10'
                    : 'border-white/20'
                }`}
                style={{ colorScheme: 'dark' }}
                disabled={viewMode === 'video' || viewMode === 'images'}
              >
                <option value="" className="bg-black text-white">All Scenes</option>
                {project.storyboard.map((_, index) => (
                  <option key={index} value={index} className="bg-black text-white">
                    Scene {index + 1}
                  </option>
                ))}
              </select>
              {(viewMode === 'video' || viewMode === 'images') && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Media Sections */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {/* Character References */}
        {characterReferences.length > 0 && renderSection(
          'Character References',
          'characterRefs',
          characterReferences,
          <ImageIcon className="w-4 h-4" />,
          'No character references',
          true // Skip scene filtering
        )}

        {/* Saved Images - Custom render with drop zone */}
        <div className="mb-4">
          <button
            onClick={() => toggleSection('saved')}
            className="w-full flex items-center justify-between px-2 py-1.5 text-sm font-semibold text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <div className="flex items-center gap-2">
              {expandedSections['saved'] ? (
                <ChevronDown className="w-4 h-4 text-white/60" />
              ) : (
                <ChevronRight className="w-4 h-4 text-white/60" />
              )}
              <span className="text-white/60"><ImageIcon className="w-4 h-4" /></span>
              <span>Saved Images</span>
              {savedImages.length > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-white/10 text-white/80 rounded-full border border-white/20">
                  {savedImages.length}
                </span>
              )}
            </div>
          </button>

          {expandedSections['saved'] && (
            <div
              className={`mt-2 rounded-lg border-2 border-dashed transition-colors ${
                isSavedImagesDragOver
                  ? 'border-green-400 bg-green-500/10'
                  : 'border-white/20'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsSavedImagesDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsSavedImagesDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsSavedImagesDragOver(false);

                // Get dragged item data from JSON
                try {
                  const data = e.dataTransfer.getData('application/json');
                  if (data) {
                    const { itemId, itemType } = JSON.parse(data);
                    if (itemId && itemType) {
                      handleSaveImage(itemId, itemType);
                    }
                  } else {
                    // Fallback: try to get from global drag state
                    if (dragDrop.draggedItemId && dragDrop.draggedItemType) {
                      handleSaveImage(dragDrop.draggedItemId, dragDrop.draggedItemType);
                    }
                  }
                } catch (error) {
                  console.error('Error parsing drag data:', error);
                }
              }}
            >
              {savedImages.length === 0 ? (
                <div className="px-2 py-8 text-center">
                  <ImageIcon className="w-12 h-12 text-white/20 mx-auto mb-2" />
                  <p className="text-xs text-white/60">
                    No saved images yet.
                  </p>
                  <p className="text-xs text-white/40 mt-1">
                    Drag images here to save them for use across all scenes.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 p-2">
                  {savedImages.map((item) => (
                    <div key={item.id} className="relative">
                      {renderMediaThumbnail(item, false)}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveSavedImage(item.id);
                        }}
                        className="absolute top-2 left-2 p-1.5 bg-red-500/80 hover:bg-red-600 text-white rounded-full transition-colors border border-red-400/50 opacity-0 group-hover:opacity-100"
                        title="Remove from saved images"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      {item.metadata?.name && (
                        <div className="absolute bottom-2 left-2 right-2 bg-black/75 text-white text-xs px-2 py-1 rounded truncate">
                          {item.metadata.name}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Generated Images */}
        {renderSection(
          'Generated Images',
          'images',
          generatedImages,
          <ImageIcon className="w-4 h-4" />,
          'No images generated yet'
        )}

        {/* Generated Videos */}
        {renderSection(
          'Generated Videos',
          'videos',
          generatedVideos,
          <Video className="w-4 h-4" />,
          'No videos generated yet'
        )}

        {/* Seed Frames */}
        {renderSection(
          'Seed Frames',
          'frames',
          seedFrames,
          <ImageIcon className="w-4 h-4" />,
          'No seed frames extracted yet'
        )}

        {/* Brand Assets */}
        {renderSection(
          'Brand Assets',
          'uploaded',
          brandAssets,
          <ImageIcon className="w-4 h-4" />,
          'No brand assets selected',
          true // Skip scene filtering
        )}

        {/* Backgrounds */}
        {renderSection(
          'Backgrounds',
          'backgrounds',
          backgroundImages,
          <ImageIcon className="w-4 h-4" />,
          'No backgrounds uploaded',
          true // Skip scene filtering
        )}

        {/* Additional Media */}
        <div className="mb-4">
          <button
            onClick={() => toggleSection('additional')}
            className="w-full flex items-center justify-between px-2 py-1.5 text-sm font-semibold text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <div className="flex items-center gap-2">
              {expandedSections['additional'] ? (
                <ChevronDown className="w-4 h-4 text-white/60" />
              ) : (
                <ChevronRight className="w-4 h-4 text-white/60" />
              )}
              <span className="text-white/60"><ImageIcon className="w-4 h-4" /></span>
              <span>Additional Media</span>
              {additionalMedia.length > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-white/10 text-white/80 rounded-full border border-white/20">
                  {additionalMedia.length}
                </span>
              )}
            </div>
          </button>

          {expandedSections['additional'] && (
            <div className="mt-2">
              {/* Upload Button */}
              <button
                onClick={() => additionalMediaInputRef.current?.click()}
                disabled={isUploadingAdditionalMedia}
                className="w-full mb-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-xs text-white/80 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                {isUploadingAdditionalMedia ? 'Uploading...' : 'Upload Images, Videos, or Audio'}
              </button>
              <input
                ref={additionalMediaInputRef}
                type="file"
                accept="image/*,video/*,audio/*"
                multiple
                onChange={handleAdditionalMediaUpload}
                className="hidden"
              />

              {additionalMedia.length === 0 ? (
                <p className="text-xs text-white/60 px-2 py-4 text-center">
                  No additional media uploaded
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {additionalMedia.map(item => renderMediaThumbnail(item, true))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Final Output */}
        {finalVideo && (
          <div className="mb-4">
            <div className="flex items-center gap-2 px-2 py-2 text-sm font-semibold text-white mb-2">
              <Video className="w-4 h-4 text-white/60" />
              <span>Final Output</span>
            </div>
            <div className="relative rounded-lg overflow-hidden border-2 border-white/40">
              <div className="aspect-video bg-white/5 flex items-center justify-center">
                <Video className="w-8 h-8 text-white/40" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Image Preview Modal */}
      {previewImage && (previewImage.type === 'image' || previewImage.type === 'frame') && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-75 p-4"
          onClick={() => setPreviewImage(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setPreviewImage(null);
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
        >
          <div
            className="relative max-w-5xl max-h-[90vh] bg-black border border-white/20 rounded-lg overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 z-10 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition-colors border border-white/20"
              aria-label="Close preview"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="relative w-full h-full flex items-center justify-center p-4">
              <img
                src={previewImage.metadata?.fullUrl || previewImage.url}
                alt={previewImage.prompt || 'Preview'}
                className="max-w-full max-h-[85vh] object-contain"
                onError={(e) => {
                  console.error('Failed to load preview image:', previewImage.metadata?.fullUrl || previewImage.url);
                  const target = e.currentTarget;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent && !parent.querySelector('.error-message')) {
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'error-message p-4 text-center text-white/80';
                    errorDiv.textContent = 'Failed to load image. The file may have been moved or deleted.';
                    parent.appendChild(errorDiv);
                  }
                }}
              />
            </div>
            {previewImage.prompt && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/75 text-white p-4 border-t border-white/20">
                <p className="text-sm">{previewImage.prompt}</p>
                {previewImage.sceneIndex !== undefined && (
                  <p className="text-xs text-white/60 mt-1">Scene {previewImage.sceneIndex + 1}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

