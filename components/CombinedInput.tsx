'use client';

import { useState, useRef, useEffect, KeyboardEvent, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { ArrowRight, X, Plus, Image as ImageIcon } from 'lucide-react';

interface CombinedInputProps {
  onSubmit: (message: string, images?: File[]) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  maxFiles?: number;
  maxSizeMB?: number;
  preserveValueOnSubmit?: boolean; // Keep value visible after submit (useful during loading)
}

export default function CombinedInput({
  onSubmit,
  placeholder = 'Describe your video idea...',
  disabled = false,
  autoFocus = true,
  maxFiles = 5,
  maxSizeMB = 10,
  preserveValueOnSubmit = false,
}: CombinedInputProps) {
  const [value, setValue] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const handleSubmit = () => {
    if ((value.trim() || images.length > 0) && !disabled) {
      const messageText = value.trim();
      const filesToSubmit = images.length > 0 ? images : undefined;
      onSubmit(messageText, filesToSubmit);
      // Only clear if preserveValueOnSubmit is false (default behavior)
      // This keeps the text visible while generating when preserveValueOnSubmit is true
      if (!preserveValueOnSubmit) {
        setValue('');
        setImages([]);
        // Clean up preview URLs
        previewUrls.forEach(url => URL.revokeObjectURL(url));
        setPreviewUrls([]);
        // Reset textarea height
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

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
      const newFiles = acceptedFiles.slice(0, maxFiles - images.length);
      if (newFiles.length === 0) {
        alert(`Maximum ${maxFiles} files allowed`);
        return;
      }

      // Create preview URLs
      const newPreviewUrls = newFiles.map((file) => URL.createObjectURL(file));
      
      const updatedFiles = [...images, ...newFiles];
      const updatedPreviews = [...previewUrls, ...newPreviewUrls];

      setImages(updatedFiles);
      setPreviewUrls(updatedPreviews);
    },
    [images, previewUrls, maxFiles, maxSizeMB]
  );

  const removeImage = (index: number) => {
    // Revoke object URL to prevent memory leaks
    URL.revokeObjectURL(previewUrls[index]);
    
    const updatedFiles = images.filter((_, i) => i !== index);
    const updatedPreviews = previewUrls.filter((_, i) => i !== index);
    
    setImages(updatedFiles);
    setPreviewUrls(updatedPreviews);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': [],
      'image/png': [],
      'image/webp': [],
      'image/gif': [],
    },
    maxSize: maxSizeMB * 1024 * 1024,
    maxFiles,
    multiple: true,
    disabled: images.length >= maxFiles || disabled,
    noClick: true, // Don't trigger on click, only drag
  });

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onDrop(files, []);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="relative w-full max-w-3xl mx-auto">
      {/* Image Previews */}
      {previewUrls.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {previewUrls.map((url, index) => (
            <div key={index} className="relative group">
              <div className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
                <img
                  src={url}
                  alt={`Preview ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
              <button
                onClick={() => removeImage(index)}
                className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                aria-label="Remove image"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Container */}
      <div
        {...getRootProps()}
        className={`
          bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm transition-colors
          ${isDragActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}
        `}
      >
        <input {...getInputProps()} />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          onChange={handleFileInputChange}
          className="hidden"
        />

        {/* Text Input Area */}
        <div className="p-4 pb-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="w-full resize-none border-none outline-none bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 text-base leading-6 min-h-[24px] max-h-[200px] overflow-y-auto focus:ring-0 focus:outline-none"
          />
        </div>

        {/* Button Row */}
        <div className="flex items-center justify-between px-4 pb-4 pt-2">
          {/* Attach Button */}
          <button
            type="button"
            onClick={handleAttachClick}
            disabled={images.length >= maxFiles || disabled}
            className="flex-shrink-0 p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Attach image"
          >
            <Plus className="w-5 h-5" />
          </button>

          {/* Send Button */}
          <button
            onClick={handleSubmit}
            disabled={(!value.trim() && images.length === 0) || disabled}
            className="flex-shrink-0 p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            aria-label="Send message"
          >
            <ArrowRight className="w-5 h-5 text-blue-600 dark:text-blue-500" />
          </button>
        </div>
      </div>

      {/* Drag indicator */}
      {isDragActive && (
        <div className="absolute inset-0 flex items-center justify-center bg-blue-500/10 rounded-lg pointer-events-none z-10">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <ImageIcon className="w-6 h-6" />
            <span className="font-medium">Drop images here</span>
          </div>
        </div>
      )}
    </div>
  );
}

