'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Image as ImageIcon, X } from 'lucide-react';

interface CarImageUploadProps {
  onImageSelected: (imageUrl: string, imageFile?: File) => void;
  selectedImageUrl?: string;
  className?: string;
}

export default function CarImageUpload({
  onImageSelected,
  selectedImageUrl,
  className = '',
}: CarImageUploadProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [imageLoadError, setImageLoadError] = useState(false);

  const handleFilesSelected = async (files: File[]) => {
    if (files.length === 0) return;

    const file = files[0];
    setUploadedFile(file);
    setUploadError(null);
    setIsUploading(true);

    try {
      // Upload image to get public URL
      const formData = new FormData();
      formData.append('images', file);
      formData.append('projectId', 'stylized-composite-temp');

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

      const imageUrl = uploadedImage.url || uploadedImage.processedVersions?.[0]?.url;

      if (!imageUrl) {
        throw new Error('No image URL returned from upload');
      }

      // Ensure it's a public HTTP/HTTPS URL
      let publicUrl = imageUrl;
      if (!publicUrl.startsWith('http://') && !publicUrl.startsWith('https://')) {
        publicUrl = `/api/serve-image?path=${encodeURIComponent(publicUrl)}`;
      }

      // Create a blob URL for immediate preview
      const blobUrl = URL.createObjectURL(file);
      setPreviewBlobUrl(blobUrl);
      setImageLoadError(false);

      onImageSelected(publicUrl, file);
    } catch (error: any) {
      console.error('[CarImageUpload] Error uploading image:', error);
      setUploadError(error.message || 'Failed to upload image');
      setUploadedFile(null);
      setPreviewBlobUrl(null);
      onImageSelected('');
    } finally {
      setIsUploading(false);
    }
  };

  const handleClear = () => {
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
    }
    setUploadedFile(null);
    setPreviewBlobUrl(null);
    setUploadError(null);
    setImageLoadError(false);
    onImageSelected('');
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center gap-2">
        <ImageIcon className="w-5 h-5 text-gray-400" />
        <h3 className="text-lg font-semibold">Car Image</h3>
      </div>

      {selectedImageUrl ? (
        <div className="relative group">
          <div className="relative w-full h-64 rounded-lg overflow-hidden border-2 border-gray-300 bg-gray-100">
            {imageLoadError && previewBlobUrl ? (
              <img
                src={previewBlobUrl}
                alt="Car preview"
                className="w-full h-full object-contain"
              />
            ) : (
              <img
                src={selectedImageUrl}
                alt="Car"
                className="w-full h-full object-contain"
                onError={() => {
                  console.warn('[CarImageUpload] Failed to load image, trying blob fallback');
                  setImageLoadError(true);
                }}
                onLoad={() => {
                  setImageLoadError(false);
                }}
              />
            )}
            {imageLoadError && (
              <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-yellow-500/80 text-black text-xs">
                Using local preview
              </div>
            )}
          </div>
          <button
            onClick={handleClear}
            className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Remove image"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <DropzoneComponent
          onFilesSelected={handleFilesSelected}
          disabled={isUploading}
        />
      )}

      {uploadError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{uploadError}</p>
        </div>
      )}
    </div>
  );
}

// Internal dropzone component
function DropzoneComponent({
  onFilesSelected,
  disabled,
}: {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFilesSelected(acceptedFiles);
      }
    },
    [onFilesSelected]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.gif'],
    },
    maxFiles: 1,
    disabled,
  });

  return (
    <div
      {...getRootProps()}
      className={`
        flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg transition-colors cursor-pointer
        ${
          isDragActive
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400 bg-white'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input {...getInputProps()} />
      <Upload className="w-12 h-12 text-gray-400 mb-4" />
      <p className="text-sm font-medium text-gray-700 mb-1">
        Upload car image
      </p>
      <p className="text-xs text-gray-500">
        Drag and drop or click to select
      </p>
    </div>
  );
}

