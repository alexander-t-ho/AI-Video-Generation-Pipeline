'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, Video } from 'lucide-react';

interface VideoUploadProps {
  onVideoSelected: (file: File) => void;
  selectedVideo?: File;
  className?: string;
}

export default function VideoUpload({
  onVideoSelected,
  selectedVideo,
  className = '',
}: VideoUploadProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelected = useCallback((files: File[]) => {
    const file = files[0];
    if (file && file.type.startsWith('video/')) {
      onVideoSelected(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  }, [onVideoSelected]);

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
    onVideoSelected(null as any);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [previewUrl, onVideoSelected]);

  return (
    <div className={`space-y-4 ${className}`}>
      <h3 className="text-lg font-semibold text-white">Upload Video</h3>

      {selectedVideo ? (
        <div className="relative border-2 border-purple-500/30 rounded-xl p-4 bg-purple-500/5">
          <div className="flex items-center gap-3">
            <Video className="w-8 h-8 text-purple-400" />
            <div className="flex-1">
              <p className="text-white font-medium">{selectedVideo.name}</p>
              <p className="text-white/60 text-sm">
                {(selectedVideo.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <button
              onClick={handleClear}
              className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-red-400" />
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all
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
            accept="video/*"
            onChange={handleFileInput}
            className="hidden"
          />
          <Upload className="w-12 h-12 text-purple-400 mx-auto mb-4" />
          <p className="text-white mb-2">Click to upload or drag and drop</p>
          <p className="text-white/60 text-sm">MP4, MOV, AVI up to 500MB</p>
        </div>
      )}
    </div>
  );
}

