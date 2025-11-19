'use client';

import { useState, useRef, useEffect, KeyboardEvent, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { ArrowRight, X, Plus, Image as ImageIcon } from 'lucide-react';

interface ChatInputProps {
  onSubmit: (message: string, images?: File[]) => void;
  placeholder?: string;
  disabled?: boolean;
  maxFiles?: number;
  maxSizeMB?: number;
}

export default function ChatInput({
  onSubmit,
  placeholder = 'Type a message...',
  disabled = false,
  maxFiles = 5,
  maxSizeMB = 10,
}: ChatInputProps) {
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
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [value]);

  const handleSubmit = () => {
    if ((value.trim() || images.length > 0) && !disabled) {
      onSubmit(value.trim(), images.length > 0 ? images : undefined);
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
    <div className="relative w-full">
      {/* Image Previews */}
      {previewUrls.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 px-3 pt-3">
          {previewUrls.map((url, index) => (
            <div key={index} className="relative group">
              <div className="w-14 h-14 rounded-md overflow-hidden border border-white/20 bg-white/5">
                <img
                  src={url}
                  alt={`Preview ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
              <button
                onClick={() => removeImage(index)}
                className="absolute -top-1.5 -right-1.5 p-0.5 bg-white/20 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md border border-white/20"
                aria-label="Remove image"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Container - Cursor style: clean, minimal border */}
      <div
        {...getRootProps()}
        className={`
          border-t border-white/20 bg-black
          ${isDragActive ? 'bg-white/10 border-white/40' : ''}
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
        <div className="px-3 py-2.5">
          <div className="flex items-end gap-2">
            {/* Attach Button - subtle */}
            <button
              type="button"
              onClick={handleAttachClick}
              disabled={images.length >= maxFiles || disabled}
              className="flex-shrink-0 p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Attach image"
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* Textarea - Cursor style: no border, clean */}
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
              className="flex-1 resize-none border-none outline-none bg-transparent text-white placeholder-white/40 text-base leading-6 min-h-[28px] max-h-[120px] overflow-y-auto custom-scrollbar"
            />

            {/* Send Button - subtle when disabled */}
            <button
              onClick={handleSubmit}
              disabled={(!value.trim() && images.length === 0) || disabled}
              className="flex-shrink-0 p-1.5 rounded text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Send message"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Drag indicator - subtle */}
      {isDragActive && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/10 border-t border-white/40 pointer-events-none z-10">
          <div className="flex items-center gap-2 text-white/80">
            <ImageIcon className="w-5 h-5" />
            <span className="text-sm font-medium">Drop images here</span>
          </div>
        </div>
      )}
    </div>
  );
}

