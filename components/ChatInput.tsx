'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { ChatInputProps } from '@/lib/types/components';

export default function ChatInput({
  onSubmit,
  placeholder = 'Describe your video idea...',
  disabled = false,
  autoFocus = true,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    if (value.trim() && !disabled) {
      onSubmit(value.trim());
      setValue('');
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

  return (
    <div className="relative w-full max-w-3xl mx-auto">
      <div className="flex items-end gap-2 p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none border-none outline-none bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 text-base leading-6 min-h-[24px] max-h-[200px] overflow-y-auto"
        />
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || disabled}
          className="flex-shrink-0 p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          aria-label="Send message"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

