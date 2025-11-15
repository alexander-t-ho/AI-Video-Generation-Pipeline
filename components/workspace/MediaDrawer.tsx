'use client';

import { useProjectStore } from '@/lib/state/project-store';
import { GeneratedImage, SeedFrame } from '@/lib/types';
import { Image as ImageIcon, Video, Download, Search, Filter, ChevronDown, ChevronRight, X } from 'lucide-react';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useMediaDragDrop } from '@/lib/hooks/useMediaDragDrop';

interface MediaItem {
  id: string;
  type: 'image' | 'video' | 'frame';
  url: string;
  sceneIndex?: number;
  prompt?: string;
  timestamp?: string;
  metadata?: Record<string, any>;
}

export default function MediaDrawer() {
  const { 
    project, 
    scenes, 
    mediaDrawer, 
    setMediaFilter: setFilter,
    setMediaSearchQuery: setSearchQuery,
    selectMediaItem: selectItem,
    setCurrentSceneIndex,
    setViewMode,
    selectImage,
  } = useProjectStore();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    images: true,
    videos: true,
    frames: true,
    uploaded: true,
    final: true,
  });
  const [videoErrors, setVideoErrors] = useState<Record<string, boolean>>({});
  const [previewImage, setPreviewImage] = useState<MediaItem | null>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
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
        // Convert local path to serveable URL if needed
        let imageUrl = img.url;
        if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://') && !imageUrl.startsWith('/api')) {
          // Convert local path to serveable URL
          imageUrl = `/api/serve-image?path=${encodeURIComponent(img.localPath || img.url)}`;
        }
        
        allImages.push({
          id: img.id,
          type: 'image' as const,
          url: imageUrl,
          sceneIndex,
          prompt: img.prompt,
          timestamp: img.createdAt,
        });
      });
    });
    return allImages;
  }, [scenes]);

  const generatedVideos = useMemo(() => {
    const allVideos: MediaItem[] = [];
    scenes.forEach((scene, sceneIndex) => {
      if (scene.videoLocalPath) {
        // Convert absolute file path to serveable URL
        // If it's already a URL (starts with http or /api), use it as-is
        // Otherwise, convert local path to serveable URL
        let videoUrl = scene.videoLocalPath;
        if (!videoUrl.startsWith('http') && !videoUrl.startsWith('/api')) {
          // Convert absolute path to serveable URL
          videoUrl = `/api/serve-video?path=${encodeURIComponent(scene.videoLocalPath)}`;
        }
        
        allVideos.push({
          id: `video-${sceneIndex}`,
          type: 'video' as const,
          url: videoUrl,
          sceneIndex,
          timestamp: new Date().toISOString(),
        });
      }
    });
    return allVideos;
  }, [scenes]);

  const seedFrames = useMemo(() => {
    const allFrames: MediaItem[] = [];
    scenes.forEach((scene, sceneIndex) => {
      scene.seedFrames?.forEach((frame) => {
        // Use S3 URL if available, otherwise use local path (served via API)
        let frameUrl = frame.url;
        if (!frameUrl.startsWith('http://') && !frameUrl.startsWith('https://') && !frameUrl.startsWith('/api')) {
          // Convert local path to serveable URL
          frameUrl = `/api/serve-image?path=${encodeURIComponent(frameUrl)}`;
        }
        
        allFrames.push({
          id: frame.id,
          type: 'frame' as const,
          url: frameUrl,
          sceneIndex,
          timestamp: frame.timestamp.toString(),
        });
      });
    });
    return allFrames;
  }, [scenes]);

  const uploadedMedia: MediaItem[] = []; // TODO: Get from project state when available
  const finalVideo = project?.finalVideoUrl;

  // Drag and drop handler
  const handleMediaDrop = (itemId: string, itemType: 'image' | 'video' | 'frame', targetSceneIndex?: number) => {
    // Handle dropping media on editor/timeline
    if (targetSceneIndex !== undefined) {
      setCurrentSceneIndex(targetSceneIndex);
      setViewMode('editor');
      
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
    // Select media item
    selectItem(item.id);
    
    // If it's from a scene, switch to that scene in editor view
    if (item.sceneIndex !== undefined) {
      setCurrentSceneIndex(item.sceneIndex);
      setViewMode('editor');
      
      // If it's an image, select it for the scene
      if (item.type === 'image') {
        selectImage(item.sceneIndex, item.id);
      }
      // Videos are already displayed in the editor view when switching to that scene
    }
  };

  const handleDownload = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderMediaThumbnail = (item: MediaItem) => {
    const isSelected = mediaDrawer.selectedItems.includes(item.id);
    const hasVideoError = videoErrors[item.id] || false;

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
        draggable
        onDragStart={(e) => handleDragStart(e, item.id, item.type)}
        onDragEnd={handleDragEnd}
        className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
          isSelected
            ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-200 dark:ring-blue-800'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
        }`}
        onClick={handleClick}
      >
        {item.type === 'image' || item.type === 'frame' ? (
          <img
            src={item.url}
            alt={item.prompt || 'Media'}
            className="w-full h-full object-cover aspect-video"
            loading="lazy"
          />
        ) : item.type === 'video' && !hasVideoError ? (
          <video
            src={item.url}
            className="w-full h-full object-cover aspect-video"
            muted
            playsInline
            preload="metadata"
            onMouseEnter={(e) => {
              // Play video on hover for preview
              const video = e.currentTarget;
              video.play().catch(() => {
                // Ignore autoplay errors
              });
            }}
            onMouseLeave={(e) => {
              // Pause video when not hovering
              const video = e.currentTarget;
              video.pause();
              video.currentTime = 0; // Reset to beginning
            }}
            onError={() => {
              // Mark this video as having an error
              setVideoErrors((prev) => ({ ...prev, [item.id]: true }));
            }}
          />
        ) : (
          <div className="aspect-video bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <Video className="w-8 h-8 text-gray-400 dark:text-gray-500" />
          </div>
        )}

        {/* Overlay on Hover */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDownload(item.url, `media-${item.id}.${item.type === 'video' ? 'mp4' : 'png'}`);
            }}
            className="p-2 bg-white/90 dark:bg-gray-800/90 rounded-full hover:bg-white transition-colors"
            aria-label="Download"
          >
            <Download className="w-4 h-4 text-gray-700 dark:text-gray-300" />
          </button>
        </div>

        {/* Scene Badge */}
        {item.sceneIndex !== undefined && (
          <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 text-white text-xs rounded">
            Scene {item.sceneIndex + 1}
          </div>
        )}

        {/* Selected Indicator */}
        {isSelected && (
          <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
            <div className="w-2 h-2 bg-white rounded-full" />
          </div>
        )}
      </div>
    );
  };

  const renderSection = (
    title: string,
    sectionKey: string,
    items: MediaItem[],
    icon: React.ReactNode,
    emptyMessage: string
  ) => {
    const isExpanded = expandedSections[sectionKey];
    const filteredItems = items.filter((item) => {
      if (mediaDrawer.searchQuery) {
        const query = mediaDrawer.searchQuery.toLowerCase();
        const matchesPrompt = item.prompt?.toLowerCase().includes(query);
        const matchesScene = item.sceneIndex !== undefined && `scene ${item.sceneIndex + 1}`.includes(query);
        if (!matchesPrompt && !matchesScene) return false;
      }
      if (mediaDrawer.filters.scene !== undefined && item.sceneIndex !== mediaDrawer.filters.scene) {
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
          className="w-full flex items-center justify-between px-2 py-1.5 text-sm font-semibold text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            {icon}
            <span>{title}</span>
            {filteredItems.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 rounded-full">
                {filteredItems.length}
              </span>
            )}
          </div>
        </button>

        {isExpanded && (
          <div className="mt-2">
            {filteredItems.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 px-2 py-4 text-center">
                {emptyMessage}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {filteredItems.map(renderMediaThumbnail)}
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
      <div className="px-3 py-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search media..."
            value={mediaDrawer.searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-gray-900 dark:text-white"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={mediaDrawer.filters.type || ''}
            onChange={(e) => handleFilter('type', e.target.value || undefined)}
            className="flex-1 px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-gray-900 dark:text-white"
          >
            <option value="">All Types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
            <option value="frame">Frames</option>
          </select>

          {project && project.storyboard.length > 0 && (
            <select
              value={mediaDrawer.filters.scene !== undefined ? mediaDrawer.filters.scene : ''}
              onChange={(e) => handleFilter('scene', e.target.value ? parseInt(e.target.value) : undefined)}
              className="flex-1 px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-gray-900 dark:text-white"
            >
              <option value="">All Scenes</option>
              {project.storyboard.map((_, index) => (
                <option key={index} value={index}>
                  Scene {index + 1}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Media Sections */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
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

        {/* Uploaded Media */}
        {renderSection(
          'Uploaded Media',
          'uploaded',
          uploadedMedia,
          <ImageIcon className="w-4 h-4" />,
          'No media uploaded'
        )}

        {/* Final Output */}
        {finalVideo && (
          <div className="mb-4">
            <div className="flex items-center gap-2 px-2 py-2 text-sm font-semibold text-gray-900 dark:text-white mb-2">
              <Video className="w-4 h-4" />
              <span>Final Output</span>
            </div>
            <div className="relative rounded-lg overflow-hidden border-2 border-green-500 dark:border-green-400">
              <div className="aspect-video bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <Video className="w-8 h-8 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="absolute top-2 right-2">
                <button
                  onClick={() => handleDownload(finalVideo, 'final-video.mp4')}
                  className="p-2 bg-white/90 dark:bg-gray-800/90 rounded-full hover:bg-white transition-colors"
                  aria-label="Download final video"
                >
                  <Download className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                </button>
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
            className="relative max-w-5xl max-h-[90vh] bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 z-10 bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-75 transition-opacity"
              aria-label="Close preview"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="relative w-full h-full flex items-center justify-center p-4">
              <img
                src={previewImage.url}
                alt={previewImage.prompt || 'Preview'}
                className="max-w-full max-h-[85vh] object-contain"
                onError={(e) => {
                  console.error('Failed to load preview image:', previewImage.url);
                  const target = e.currentTarget;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent && !parent.querySelector('.error-message')) {
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'error-message p-4 text-center text-red-500 dark:text-red-400';
                    errorDiv.textContent = 'Failed to load image. The file may have been moved or deleted.';
                    parent.appendChild(errorDiv);
                  }
                }}
              />
            </div>
            {previewImage.prompt && (
              <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-75 text-white p-4">
                <p className="text-sm">{previewImage.prompt}</p>
                {previewImage.sceneIndex !== undefined && (
                  <p className="text-xs text-gray-300 mt-1">Scene {previewImage.sceneIndex + 1}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

