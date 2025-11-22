'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Copy, Check, Code } from 'lucide-react';
import { useProjectStore } from '@/lib/state/project-store';

interface APIPreviemPanelProps {
  sceneIndex?: number;
  generationType?: 'image' | 'video';
}

interface PayloadField {
  key: string;
  label: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'array' | 'url';
  required?: boolean;
  description?: string;
  imageUrl?: string;
  imageUrls?: string[];
}

export default function APIPreviewPanel({ sceneIndex, generationType }: APIPreviemPanelProps) {
  const { project, scenes, currentSceneIndex, mediaDrawer } = useProjectStore();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [displayType, setDisplayType] = useState<'image' | 'video'>(generationType || 'image');
  const activeSceneIndex = sceneIndex ?? currentSceneIndex;

  const previewData = useMemo(() => {
    if (!project || !project.storyboard) return null;

    const scene = project.storyboard[activeSceneIndex];
    const sceneState = scenes[activeSceneIndex];
    if (!scene || !sceneState) return null;

    // Image generation payload
    if (displayType === 'image') {
      const selectedImage = sceneState?.selectedImageId
        ? sceneState.generatedImages?.find((img: any) => img.id === sceneState.selectedImageId)
        : sceneState?.generatedImages?.[0];

      const allReferenceImages = project.referenceImageUrls || [];
      const referenceImages = allReferenceImages.slice(0, 3);
      const wasTruncated = allReferenceImages.length > 3;

      // Check if seed image usage is enabled (from model parameters)
      const useSeedImage = scene.modelParameters?.useSeedImage !== false; // Default to true

      // Get seed image from media drawer (purple selection) if available
      let effectiveSeedImage: any = null;
      if (useSeedImage && mediaDrawer.seedImageId) {
        // Search for seed image across all scenes and media sources
        for (const scn of scenes) {
          // Check generated images
          const foundImg = scn.generatedImages?.find((img: any) => img.id === mediaDrawer.seedImageId);
          if (foundImg) {
            effectiveSeedImage = foundImg;
            break;
          }
          // Check seed frames
          const foundFrame = scn.seedFrames?.find((frame: any) => frame.id === mediaDrawer.seedImageId);
          if (foundFrame) {
            effectiveSeedImage = foundFrame;
            break;
          }
        }
        // Check uploaded images
        if (!effectiveSeedImage && project.uploadedImages) {
          const foundUpload = project.uploadedImages.find((img: any) => img.id === mediaDrawer.seedImageId);
          if (foundUpload) {
            effectiveSeedImage = foundUpload;
          }
          // Also check processed versions
          if (!effectiveSeedImage) {
            for (const uploadedImage of project.uploadedImages) {
              const foundProcessed = uploadedImage.processedVersions?.find((pv: any) => pv.id === mediaDrawer.seedImageId);
              if (foundProcessed) {
                effectiveSeedImage = foundProcessed;
                break;
              }
            }
          }
        }
      }
      // Fall back to selected image if no seed image is set
      if (!effectiveSeedImage && useSeedImage) {
        effectiveSeedImage = selectedImage;
      }

      const fields: PayloadField[] = [
        {
          key: 'prompt',
          label: 'Prompt',
          value: scene.imagePrompt,
          type: 'string',
          required: true,
          description: 'Text description of the image to generate',
        },
        {
          key: 'negativePrompt',
          label: 'Negative Prompt',
          value: scene.negativePrompt || '',
          type: 'string',
          description: 'Things to avoid in the image',
        },
        {
          key: 'seedImage',
          label: 'Seed Image (I2I)',
          value: effectiveSeedImage?.url || (useSeedImage ? 'None' : 'Disabled'),
          type: 'url',
          description: `${useSeedImage ? 'Reference image for image-to-image generation' : 'Seed image disabled - using pure text-to-image'}`,
          imageUrl: effectiveSeedImage ? (() => {
            // Prefer localPath, fall back to url
            let imgUrl = effectiveSeedImage.localPath || effectiveSeedImage.url;
            if (!imgUrl) return undefined;

            // If it's already an API URL or HTTP/HTTPS, use it directly
            if (imgUrl.startsWith('/api') || imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
              return imgUrl;
            }

            // Otherwise, serve through API
            return `/api/serve-image?path=${encodeURIComponent(imgUrl)}`;
          })() : undefined,
        },
        {
          key: 'referenceImages',
          label: 'Reference Images',
          value: referenceImages.length > 0
            ? `${referenceImages.length} image(s)${wasTruncated ? ` (${allReferenceImages.length} total, limited to 3)` : ''}`
            : 'None',
          type: 'array',
          description: wasTruncated
            ? 'Images for consistency/IP-Adapter (limited to first 3)'
            : 'Images for consistency/IP-Adapter',
          imageUrls: referenceImages.length > 0 ? referenceImages : [],
        },
        {
          key: 'customDuration',
          label: 'Custom Duration',
          value: scene.customDuration || 'Default',
          type: 'string',
          description: 'Override duration in seconds',
        },
        {
          key: 'useSeedFrame',
          label: 'Use Seed Frame',
          value: scene.useSeedFrame ? 'Yes' : 'No',
          type: 'boolean',
          description: 'Use seed frame from previous scene',
        },
      ];

      return {
        type: 'image',
        endpoint: '/api/generate-image',
        fields,
      };
    }

    // Video generation payload
    if (displayType === 'video') {
      const selectedImage = sceneState?.selectedImageId
        ? sceneState.generatedImages?.find((img: any) => img.id === sceneState.selectedImageId)
        : sceneState?.generatedImages?.[0];

      const seedFrame = sceneState?.selectedSeedFrameIndex !== undefined
        ? sceneState.seedFrames?.[sceneState.selectedSeedFrameIndex]
        : null;

      // Use seed frame as base image if available, otherwise use selected image
      const baseImage = seedFrame || selectedImage;

      // Format the base image URL properly
      const baseImageUrl = baseImage ? (() => {
        let imgUrl = baseImage.localPath || baseImage.url;
        if (!imgUrl) return 'NOT SELECTED';
        if (imgUrl.startsWith('/api') || imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
          return imgUrl;
        }
        return `/api/serve-image?path=${encodeURIComponent(imgUrl)}`;
      })() : 'NOT SELECTED';

      // Get reference images dragged into the storyboard prompt (limit to 3)
      const allReferenceImagesVideo = project.referenceImageUrls || [];
      const referenceImages = allReferenceImagesVideo.slice(0, 3);
      const wasTruncatedVideo = allReferenceImagesVideo.length > 3;

      const fields: PayloadField[] = [
        {
          key: 'image',
          label: seedFrame ? 'Base Image (Seed Frame)' : 'Base Image',
          value: baseImageUrl,
          type: 'url',
          required: true,
          description: seedFrame
            ? 'Using seed frame from previous scene for continuity'
            : 'The base image for video generation',
          imageUrl: baseImageUrl !== 'NOT SELECTED' ? baseImageUrl : undefined,
        },
        {
          key: 'prompt',
          label: 'Video Prompt',
          value: scene.videoPrompt || scene.imagePrompt, // Fallback to imagePrompt for backward compatibility
          type: 'string',
          required: true,
          description: 'Motion and scene description for video generation',
        },
        {
          key: 'duration',
          label: 'Duration',
          value: scene.customDuration || scene.suggestedDuration,
          type: 'number',
          required: true,
          description: 'Video duration in seconds',
        },
        // Add individual reference image fields (dragged into storyboard)
        ...referenceImages.map((imgUrl, idx) => ({
          key: `referenceImage${idx + 1}`,
          label: `Reference Image ${idx + 1}`,
          value: imgUrl,
          type: 'url' as const,
          description: 'Additional image for video consistency (Google Veo)',
          imageUrl: imgUrl,
        })),
        // Add the combined array for API
        ...(referenceImages.length > 0 ? [{
          key: 'reference_images',
          label: 'Reference Images (Array)',
          value: `${referenceImages.length} image(s)${wasTruncatedVideo ? ` (${allReferenceImagesVideo.length} total, limited to 3)` : ''}`,
          type: 'array' as const,
          description: wasTruncatedVideo
            ? 'Reference images sent to API for Google Veo (limited to first 3)'
            : 'Reference images sent to API for Google Veo',
          imageUrls: referenceImages,
        }] : []),
      ];

      return {
        type: 'video',
        endpoint: '/api/generate-video',
        fields,
      };
    }

    return null;
  }, [project, scenes, activeSceneIndex, displayType, mediaDrawer.seedImageId]);

  const handleCopy = () => {
    if (!previewData) return;
    const payload = previewData.fields.reduce((acc, field) => {
      // Skip fields with "None" values (optional fields not set)
      if (field.value === 'None' || field.value === 'NOT SELECTED') {
        return acc;
      }

      // Skip individual reference image fields (only include the combined array)
      if (field.key.startsWith('referenceImage') && field.key !== 'reference_images') {
        return acc;
      }

      // Skip seedFrame field (it's optional and only used internally)
      if (field.key === 'seedFrame') {
        return acc;
      }

      // For reference images array, use the actual imageUrls array, not the display string
      if ((field.key === 'reference_images' || field.key === 'referenceImageUrls') && field.imageUrls) {
        if (field.imageUrls.length > 0) {
          acc[field.key] = field.imageUrls;
        }
      } else {
        acc[field.key] = field.value;
      }
      return acc;
    }, {} as any);
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedId('payload');
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!previewData) {
    return (
      <div className="px-3 py-2 text-xs text-white/60 border-t border-white/10">
        <p>No preview available</p>
      </div>
    );
  }

  return (
    <div className="bg-black flex flex-col h-full w-full">
      {/* Info Header */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code className="w-4 h-4 text-blue-400" />
            <div className="text-left">
              <p className="text-xs font-medium text-white/80">
                {displayType === 'image' ? '📸 Image Generation' : '🎬 Video Generation'}
              </p>
              <p className="text-xs text-white/50 font-mono">
                {previewData?.endpoint}
              </p>
            </div>
          </div>

          {/* Toggle Buttons */}
          <div className="flex gap-1">
            <button
              onClick={() => setDisplayType('image')}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                displayType === 'image'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'
              }`}
            >
              Image
            </button>
            <button
              onClick={() => setDisplayType('video')}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                displayType === 'video'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'
              }`}
            >
              Video
            </button>
          </div>
        </div>
      </div>

      {/* Content - Full Height */}
      <div className="flex-1 px-3 py-3 space-y-3 bg-black overflow-y-auto min-h-0">
        {/* Fields */}
        <div className="space-y-2">
          {previewData.fields.map((field) => {
            const isEmpty = !field.value || (typeof field.value === 'string' && field.value === '');
            const hasImages = field.imageUrl || (field.imageUrls && field.imageUrls.length > 0);

            return (
              <div key={field.key} className="bg-black/20 rounded border border-white/10 p-2">
                <div className="flex items-start justify-between mb-1">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-white/80">
                        {field.label}
                      </label>
                      {field.required && (
                        <span className="text-red-400 text-xs">*</span>
                      )}
                      {field.type === 'url' && (
                        <span className="text-blue-300 text-xs font-mono">[URL]</span>
                      )}
                    </div>
                    {field.description && (
                      <p className="text-xs text-white/50 mt-0.5">{field.description}</p>
                    )}
                  </div>
                </div>

                {/* Image Display Section */}
                {hasImages && (
                  <div className="mb-2">
                    {field.imageUrl && (
                      <div className="flex gap-2">
                        <img
                          src={field.imageUrl}
                          alt={field.label}
                          className="h-24 w-auto rounded border border-white/20 object-cover"
                        />
                      </div>
                    )}
                    {field.imageUrls && field.imageUrls.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {field.imageUrls.map((url, idx) => (
                          <img
                            key={idx}
                            src={url}
                            alt={`${field.label} ${idx + 1}`}
                            className="h-20 w-auto rounded border border-white/20 object-cover"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-black/40 rounded px-2 py-1 min-h-6 flex items-center">
                  <code className={`text-xs font-mono ${
                    isEmpty ? 'text-white/30' : 'text-green-300'
                  } break-words`}>
                    {isEmpty ? '(empty)' : field.key === 'referenceImages' && field.imageUrls ? `[${field.imageUrls.length} URLs]` : String(field.value)}
                  </code>
                </div>
              </div>
            );
          })}
        </div>

        {/* Copy Button */}
        <button
          onClick={handleCopy}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 rounded transition-colors text-blue-300"
        >
          {copiedId === 'payload' ? (
            <>
              <Check className="w-3 h-3" />
              Copied to Clipboard!
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              Copy Payload
            </>
          )}
        </button>

        {/* Warnings */}
        {previewData.type === 'image' && (() => {
          const seedImageField = previewData.fields.find(f => f.key === 'seedImage');
          if (seedImageField?.value === 'Disabled') {
            return (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded p-2">
                <p className="text-xs text-blue-300">
                  ℹ️ Seed image disabled - using pure text-to-image
                </p>
              </div>
            );
          }
          if (seedImageField?.value === 'None') {
            return (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-2">
                <p className="text-xs text-yellow-300">
                  ⚠️ No seed image - using pure text-to-image
                </p>
              </div>
            );
          }
          return null;
        })()}

        {previewData.type === 'video' && previewData.fields.find(f => f.key === 'image')?.value === 'NOT SELECTED' && (
          <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
            <p className="text-xs text-red-300">
              ❌ No image selected - generate an image first
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
