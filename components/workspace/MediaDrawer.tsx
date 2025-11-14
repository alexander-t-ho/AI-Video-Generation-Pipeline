'use client';

import { useProjectStore } from '@/lib/state/project-store';
import { GeneratedImage, SeedFrame } from '@/lib/types';
import { Image as ImageIcon, Video, Download, Search, Filter, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

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
  const { project, mediaDrawer, updateMediaDrawer } = useProjectStore();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    images: true,
    videos: true,
    frames: true,
    uploaded: true,
    final: true,
  });

  // TODO: Get actual media from project state
  const generatedImages: GeneratedImage[] = [];
  const generatedVideos: any[] = [];
  const seedFrames: SeedFrame[] = [];
  const uploadedMedia: File[] = [];
  const finalVideo = project?.finalVideoUrl;

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleSearch = (query: string) => {
    updateMediaDrawer({ searchQuery: query });
  };

  const handleFilter = (filterType: 'scene' | 'type', value: any) => {
    updateMediaDrawer({
      filters: {
        ...mediaDrawer.filters,
        [filterType]: value,
      },
    });
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

    return (
      <div
        key={item.id}
        className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
          isSelected
            ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-200 dark:ring-blue-800'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
        }`}
        onClick={() => {
          const newSelected = isSelected
            ? mediaDrawer.selectedItems.filter((id) => id !== item.id)
            : [...mediaDrawer.selectedItems, item.id];
          updateMediaDrawer({ selectedItems: newSelected });
        }}
      >
        {item.type === 'image' || item.type === 'frame' ? (
          <img
            src={item.url}
            alt={item.prompt || 'Media'}
            className="w-full h-full object-cover aspect-video"
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
          generatedImages.map((img) => ({
            id: img.id,
            type: 'image' as const,
            url: img.url,
            prompt: img.prompt,
            timestamp: img.createdAt,
          })),
          <ImageIcon className="w-4 h-4" />,
          'No images generated yet'
        )}

        {/* Generated Videos */}
        {renderSection(
          'Generated Videos',
          'videos',
          generatedVideos.map((vid) => ({
            id: vid.id,
            type: 'video' as const,
            url: vid.url,
            sceneIndex: vid.sceneIndex,
            timestamp: vid.createdAt,
          })),
          <Video className="w-4 h-4" />,
          'No videos generated yet'
        )}

        {/* Seed Frames */}
        {renderSection(
          'Seed Frames',
          'frames',
          seedFrames.map((frame) => ({
            id: frame.id,
            type: 'frame' as const,
            url: frame.url,
            timestamp: frame.timestamp.toString(),
          })),
          <ImageIcon className="w-4 h-4" />,
          'No seed frames extracted yet'
        )}

        {/* Uploaded Media */}
        {renderSection(
          'Uploaded Media',
          'uploaded',
          uploadedMedia.map((file, index) => ({
            id: `uploaded-${index}`,
            type: 'image' as const,
            url: URL.createObjectURL(file),
            metadata: { filename: file.name },
          })),
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
    </div>
  );
}

