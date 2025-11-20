'use client';

import { useState, useEffect } from 'react';
import ImageDropZone from '@/components/ImageDropZone';
import { Upload, Image as ImageIcon, X, FolderOpen } from 'lucide-react';

interface SubjectReferenceSelectorProps {
  onImageSelected: (imageUrl: string, imageFile?: File) => void;
  selectedImageUrl?: string;
  className?: string;
}

export default function SubjectReferenceSelector({
  onImageSelected,
  selectedImageUrl,
  className = '',
}: SubjectReferenceSelectorProps) {
  const [mode, setMode] = useState<'upload' | 'project' | 's3'>('upload');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [imageLoadError, setImageLoadError] = useState(false);

  const handleFilesSelected = async (files: File[]) => {
    if (files.length === 0) return;

    const file = files[0]; // Only use first file
    setUploadedFile(file);
    setUploadError(null);
    setIsUploading(true);

    try {
      // Upload image to get public URL
      const formData = new FormData();
      formData.append('images', file);
      formData.append('projectId', 'stylized-preview-temp');

      const response = await fetch('/api/upload-images', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload image');
      }

      const uploadedImage = data.images?.[0];
      if (!uploadedImage) {
        throw new Error('No image returned from upload');
      }

      // Get the public URL (url field contains S3 URL when S3 is enabled, or local path otherwise)
      // Prefer processed version URL (background-removed) if available, otherwise use original
      const imageUrl = uploadedImage.url || uploadedImage.processedVersions?.[0]?.url;

      if (!imageUrl) {
        console.error('[SubjectReferenceSelector] Upload response:', uploadedImage);
        throw new Error('No image URL returned from upload');
      }

      // Ensure it's a public HTTP/HTTPS URL
      let publicUrl = imageUrl;
      if (!publicUrl.startsWith('http://') && !publicUrl.startsWith('https://')) {
        // Convert local path to serve-image API URL
        publicUrl = `/api/serve-image?path=${encodeURIComponent(publicUrl)}`;
      }

      console.log('[SubjectReferenceSelector] Image uploaded successfully:', {
        originalUrl: imageUrl,
        publicUrl,
        hasProcessedVersions: !!uploadedImage.processedVersions?.length,
      });

      // Create a blob URL for immediate preview (works even if S3 URL isn't publicly accessible yet)
      const blobUrl = URL.createObjectURL(file);
      setPreviewBlobUrl(blobUrl);
      setImageLoadError(false);
      
      // Call onImageSelected with the public URL
      onImageSelected(publicUrl, file);
    } catch (error: any) {
      console.error('[SubjectReferenceSelector] Error uploading image:', error);
      setUploadError(error.message || 'Failed to upload image');
      setUploadedFile(null);
      setPreviewBlobUrl(null);
      onImageSelected(''); // Clear selected image on error
    } finally {
      setIsUploading(false);
    }
  };

  const handleProjectImageSelect = (imageUrl: string) => {
    onImageSelected(imageUrl);
  };

  const handleClear = () => {
    // Clean up blob URL if it exists
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }
    setUploadedFile(null);
    setUploadError(null);
    setImageLoadError(false);
    onImageSelected('');
  };

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
      }
    };
  }, [previewBlobUrl]);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Mode Toggle */}
      <div className="flex items-center space-x-2">
        <button
          onClick={() => {
            setMode('upload');
            handleClear();
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'upload'
              ? 'bg-white text-black'
              : 'bg-white/10 text-white/70 hover:bg-white/20'
          }`}
        >
          <Upload className="w-4 h-4 inline-block mr-2" />
          Upload New Image
        </button>
        <button
          onClick={() => {
            setMode('project');
            handleClear();
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'project'
              ? 'bg-white text-black'
              : 'bg-white/10 text-white/70 hover:bg-white/20'
          }`}
        >
          <FolderOpen className="w-4 h-4 inline-block mr-2" />
          Select from Project
        </button>
        <button
          onClick={() => {
            setMode('s3');
            handleClear();
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 's3'
              ? 'bg-white text-black'
              : 'bg-white/10 text-white/70 hover:bg-white/20'
          }`}
        >
          <ImageIcon className="w-4 h-4 inline-block mr-2" />
          Browse S3 Images
        </button>
      </div>

      {/* Upload Mode */}
      {mode === 'upload' && (
        <div className="space-y-4">
          {!selectedImageUrl ? (
            <>
              <ImageDropZone
                onFilesSelected={handleFilesSelected}
                maxFiles={1}
                maxSizeMB={10}
              />
              {isUploading && (
                <div className="text-center py-4">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                  <p className="text-sm text-white/60 mt-2">Uploading image...</p>
                </div>
              )}
              {uploadError && (
                <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/50">
                  <p className="text-sm text-red-400">Error: {uploadError}</p>
                </div>
              )}
            </>
          ) : (
            <div className="relative">
              <div className="relative w-full max-w-2xl aspect-video rounded-lg border border-white/20 overflow-hidden bg-white/5">
                {imageLoadError && previewBlobUrl ? (
                  // Fallback to blob URL if the public URL fails to load
                  <img
                    src={previewBlobUrl}
                    alt="Selected subject (preview)"
                    className="w-full h-full object-cover"
                    onError={() => {
                      console.error('[SubjectReferenceSelector] Both public URL and blob URL failed to load');
                    }}
                  />
                ) : (
                  <img
                    src={selectedImageUrl}
                    alt="Selected subject"
                    className="w-full h-full object-cover"
                    onError={() => {
                      console.warn('[SubjectReferenceSelector] Failed to load image from public URL, trying blob fallback');
                      setImageLoadError(true);
                    }}
                    onLoad={() => {
                      setImageLoadError(false);
                    }}
                  />
                )}
                <button
                  onClick={handleClear}
                  className="absolute top-2 right-2 p-2 rounded-full bg-black/60 hover:bg-black/80 transition-colors"
                  aria-label="Remove image"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
                {imageLoadError && (
                  <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-yellow-500/80 text-black text-xs">
                    Using local preview (S3 URL may not be accessible)
                  </div>
                )}
              </div>
              {uploadedFile && (
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-white/60">
                    {uploadedFile.name}
                  </p>
                  {selectedImageUrl && (
                    <p className="text-xs text-white/40 truncate" title={selectedImageUrl}>
                      URL: {selectedImageUrl}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Project Mode */}
      {mode === 'project' && (
        <div className="space-y-4">
          <ProjectImageSelector
            onImageSelect={handleProjectImageSelect}
            selectedImageUrl={selectedImageUrl}
          />
        </div>
      )}

      {/* S3 Images Mode */}
      {mode === 's3' && (
        <div className="space-y-4">
          <S3ImageSelector
            onImageSelect={handleProjectImageSelect}
            selectedImageUrl={selectedImageUrl}
          />
        </div>
      )}
    </div>
  );
}

// Simple project image selector component
function ProjectImageSelector({
  onImageSelect,
  selectedImageUrl,
}: {
  onImageSelect: (imageUrl: string) => void;
  selectedImageUrl?: string;
}) {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [scenes, setScenes] = useState<any[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string>('');
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/projects');
      const data = await response.json();
      if (response.ok && data.projects) {
        setProjects(data.projects);
      } else {
        setError('Failed to load projects');
      }
    } catch (err) {
      setError('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const handleProjectChange = async (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedSceneId('');
    setImages([]);
    if (!projectId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/scenes`);
      const data = await response.json();
      if (response.ok && data.scenes) {
        setScenes(data.scenes);
      }
    } catch (err) {
      setError('Failed to load scenes');
    } finally {
      setLoading(false);
    }
  };

  const handleSceneChange = async (sceneId: string) => {
    setSelectedSceneId(sceneId);
    setImages([]);
    if (!sceneId || !selectedProjectId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${selectedProjectId}/scenes/${sceneId}`);
      const data = await response.json();
      if (response.ok && data.scene && data.scene.generatedImages) {
        setImages(data.scene.generatedImages);
      }
    } catch (err) {
      setError('Failed to load images');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Project Selector */}
      <div>
        <label className="block text-sm font-medium text-white/80 mb-2">
          Select Project
        </label>
        <select
          value={selectedProjectId}
          onChange={(e) => handleProjectChange(e.target.value)}
          className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-white/50"
          disabled={loading}
        >
          <option value="">Choose a project...</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id} className="bg-black">
              {project.name}
            </option>
          ))}
        </select>
      </div>

      {/* Scene Selector */}
      {selectedProjectId && (
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">
            Select Scene
          </label>
          <select
            value={selectedSceneId}
            onChange={(e) => handleSceneChange(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-white/50"
            disabled={loading || scenes.length === 0}
          >
            <option value="">Choose a scene...</option>
            {scenes.map((scene) => (
              <option key={scene.id} value={scene.id} className="bg-black">
                Scene {scene.sceneNumber}: {scene.sceneTitle}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Image Grid */}
      {images.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">
            Select Image
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {images.map((image) => {
              const imageUrl = image.url || image.s3Url;
              const isSelected = selectedImageUrl === imageUrl;
              return (
                <button
                  key={image.id}
                  onClick={() => onImageSelect(imageUrl)}
                  className={`relative aspect-video rounded-lg border-2 overflow-hidden transition-all ${
                    isSelected
                      ? 'border-white ring-2 ring-white/50'
                      : 'border-white/20 hover:border-white/40'
                  }`}
                >
                  <img
                    src={imageUrl}
                    alt={`Scene image ${image.id}`}
                    className="w-full h-full object-cover"
                  />
                  {isSelected && (
                    <div className="absolute inset-0 bg-white/20 flex items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                        <ImageIcon className="w-5 h-5 text-black" />
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/50">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {loading && (
        <div className="text-center py-4">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
        </div>
      )}
    </div>
  );
}

// S3 Image selector component
function S3ImageSelector({
  onImageSelect,
  selectedImageUrl,
}: {
  onImageSelect: (imageUrl: string) => void;
  selectedImageUrl?: string;
}) {
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchS3Images();
  }, []);

  const fetchS3Images = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/s3-images?preferProcessed=true');
      const data = await response.json();
      if (response.ok && data.images) {
        setImages(data.images);
      } else {
        setError(data.error || 'Failed to load S3 images');
      }
    } catch (err) {
      setError('Failed to load S3 images');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-white/80">
          Select from S3 Images (Processed)
        </label>
        <button
          onClick={fetchS3Images}
          disabled={loading}
          className="px-3 py-1 text-xs rounded bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {loading && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
          <p className="text-sm text-white/60 mt-2">Loading S3 images...</p>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/50">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {!loading && !error && images.length === 0 && (
        <p className="text-sm text-white/60 text-center py-8">
          No processed images found in S3. Upload images first to see them here.
        </p>
      )}

      {!loading && !error && images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-96 overflow-y-auto pr-2">
          {images.map((image) => {
            const isSelected = selectedImageUrl === image.url;
            return (
              <button
                key={image.s3Key}
                onClick={() => onImageSelect(image.url)}
                className={`relative aspect-video rounded-lg border-2 overflow-hidden transition-all ${
                  isSelected
                    ? 'border-white ring-2 ring-white/50'
                    : 'border-white/20 hover:border-white/40'
                }`}
                title={image.filename}
              >
                <img
                  src={image.url}
                  alt={image.filename}
                  className="w-full h-full object-cover"
                />
                {image.isProcessed && (
                  <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-green-500/80 text-black text-xs font-medium">
                    Processed
                  </div>
                )}
                {isSelected && (
                  <div className="absolute inset-0 bg-white/20 flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                      <ImageIcon className="w-5 h-5 text-black" />
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!loading && !error && images.length > 0 && (
        <p className="text-xs text-white/40 text-center">
          Showing {images.length} processed image{images.length !== 1 ? 's' : ''} from S3
        </p>
      )}
    </div>
  );
}

