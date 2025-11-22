'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';

interface ReferenceImageUploadProps {
  label: string;
  onImageSelected: (file: File | null) => void;
  selectedImage?: File;
  className?: string;
}

export default function ReferenceImageUpload({
  label,
  onImageSelected,
  selectedImage,
  className = '',
}: ReferenceImageUploadProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelected = useCallback((files: File[]) => {
    const file = files[0];
    if (file && file.type.startsWith('image/')) {
      onImageSelected(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  }, [onImageSelected]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    handleFilesSelected(files);
  }, [handleFilesSelected]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFilesSelected(files);
  }, [handleFilesSelected]);

  const handleClear = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    onImageSelected(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [previewUrl, onImageSelected]);

  return (
    <div className={`space-y-2 ${className}`}>
      <label className="block text-sm font-medium text-white">{label}</label>

      {selectedImage ? (
        <div className="relative border-2 border-purple-500/30 rounded-lg overflow-hidden bg-purple-500/5">
          <img
            src={previewUrl || ''}
            alt={label}
            className="w-full h-32 object-cover"
          />
          <button
            onClick={handleClear}
            className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-red-500/80 rounded-full transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all
            ${
              isDragActive
                ? 'border-purple-500 bg-purple-500/10'
                : 'border-purple-500/30 bg-purple-500/5 hover:border-purple-500/50 hover:bg-purple-500/10'
            }
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileInput}
            className="hidden"
          />
          <ImageIcon className="w-8 h-8 text-purple-400 mx-auto mb-2" />
          <p className="text-white/60 text-sm">Click to upload</p>
        </div>
      )}
    </div>
  );
}

