'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { X, Upload, Image as ImageIcon } from 'lucide-react';
import { ImageDropZoneProps } from '@/lib/types/components';

export default function ImageDropZone({
  onFilesSelected,
  maxFiles = 5,
  maxSizeMB = 10,
  acceptedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
}: ImageDropZoneProps) {
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);

  // Track URLs in a ref so we can access them in the cleanup function
  const urlsRef = useRef<string[]>([]);

  // Update ref whenever urls change
  useEffect(() => {
    urlsRef.current = previewUrls;
  }, [previewUrls]);

  // Cleanup ONLY when component unmounts (navigating away)
  useEffect(() => {
    return () => {
      urlsRef.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []); // Empty dependency array = run only on unmount

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: any[]) => {
      // Handle rejected files
      if (rejectedFiles.length > 0) {
        const reasons = rejectedFiles.map(({ file, errors }) => {
          const errorMessages = errors.map((e: any) => {
            if (e.code === 'file-too-large') {
              return `File too large (max ${maxSizeMB}MB)`;
            }
            if (e.code === 'file-invalid-type') {
              return 'Invalid file type';
            }
            return e.message;
          });
          return `${file.name}: ${errorMessages.join(', ')}`;
        });
        alert(`Some files were rejected:\n${reasons.join('\n')}`);
      }

      // Handle accepted files
      const newFiles = acceptedFiles.slice(0, maxFiles - files.length);
      if (newFiles.length === 0) {
        alert(`Maximum ${maxFiles} files allowed`);
        return;
      }

      // Create preview URLs
      const newPreviewUrls = newFiles.map((file) => URL.createObjectURL(file));
      
      const updatedFiles = [...files, ...newFiles];
      const updatedPreviews = [...previewUrls, ...newPreviewUrls];

      setFiles(updatedFiles);
      setPreviewUrls(updatedPreviews);
      onFilesSelected(updatedFiles);
    },
    [files, previewUrls, maxFiles, maxSizeMB, onFilesSelected]
  );

  const removeFile = (index: number) => {
    // Revoke object URL to prevent memory leaks
    URL.revokeObjectURL(previewUrls[index]);
    
    const updatedFiles = files.filter((_, i) => i !== index);
    const updatedPreviews = previewUrls.filter((_, i) => i !== index);
    
    setFiles(updatedFiles);
    setPreviewUrls(updatedPreviews);
    onFilesSelected(updatedFiles);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedTypes.reduce((acc, type) => ({ ...acc, [type]: [] }), {}),
    maxSize: maxSizeMB * 1024 * 1024,
    maxFiles,
    multiple: true,
    disabled: files.length >= maxFiles,
  });

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all backdrop-blur-sm
          ${
            isDragActive
              ? 'border-white/30 bg-white/10'
              : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
          }
          ${files.length >= maxFiles ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2">
          {files.length === 0 ? (
            <>
              <Upload className="w-6 h-6 text-white/40" />
              <p className="text-sm text-white/50">
                Drag and drop images here, or click to select
              </p>
              <p className="text-xs text-white/30">
                {acceptedTypes.join(', ').replace(/image\//g, '')} up to {maxSizeMB}MB each
              </p>
            </>
          ) : (
            <>
              <ImageIcon className="w-6 h-6 text-white/40" />
              <p className="text-sm text-white/50">
                {files.length} image{files.length !== 1 ? 's' : ''} selected
                {files.length < maxFiles && ' (click to add more)'}
              </p>
            </>
          )}
        </div>
      </div>

      {previewUrls.length > 0 && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {previewUrls.map((url, index) => (
            <div key={index} className="relative group">
              <img
                src={url}
                alt={`Preview ${index + 1}`}
                className="w-full h-24 object-cover rounded-lg border border-white/10 bg-white/5"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(index);
                }}
                className="absolute top-1.5 right-1.5 p-1 bg-red-500/90 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                aria-label="Remove image"
              >
                <X className="w-3 h-3" />
              </button>
              <p className="mt-1 text-xs text-white/40 truncate">
                {files[index].name}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

