'use client';

import { useProjectStore } from '@/lib/state/project-store';
import { ChatMessage } from '@/lib/types/components';
import { AlertCircle, Lightbulb, Loader2 } from 'lucide-react';

export default function AgentChat() {
  const { chatMessages } = useProjectStore();

  // Check if a message has been superseded by a completion message
  const isSuperseded = (messageIndex: number, message: ChatMessage): boolean => {
    if (message.type !== 'status') return false;
    const contentLower = message.content.toLowerCase();
    
    // Check if this is a "generating" message
    if (contentLower.includes('generating') && contentLower.endsWith('...')) {
      // Look for a later completion message
      for (let i = messageIndex + 1; i < chatMessages.length; i++) {
        const laterMessage = chatMessages[i];
        if (laterMessage.type === 'status') {
          const laterContent = laterMessage.content.toLowerCase();
          // Check if later message indicates completion
          if (laterContent.includes('storyboard generated') && contentLower.includes('storyboard')) {
            return true; // This "generating storyboard" has been completed
          }
          if (laterContent.includes('image generated') && contentLower.includes('image')) {
            return true; // This "generating image" has been completed
          }
          if (laterContent.includes('video generated') && contentLower.includes('video')) {
            return true; // This "generating video" has been completed
          }
        }
      }
    }
    return false;
  };

  const renderMessage = (message: ChatMessage, messageIndex: number) => {
    const isUser = message.role === 'user';
    const isStatus = message.type === 'status';
    const isError = message.type === 'error';
    const isSuggestion = message.type === 'suggestion';

    // User message styling - Cursor style: subtle, right-aligned
    if (isUser) {
      return (
        <div
          key={message.id}
          className="mb-2 flex justify-end group"
        >
          <div className="max-w-[85%]">
            <div className="rounded-md bg-gray-100 dark:bg-gray-800/50 px-2.5 py-1.5">
              <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words leading-normal">
                {message.content}
              </p>
            </div>
          </div>
        </div>
      );
    }

    // Agent message styling - Cursor style: clean, left-aligned with subtle background
    const getStatusIcon = () => {
      if (isError) {
        return <AlertCircle className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />;
      } else if (isSuggestion) {
        return <Lightbulb className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />;
      } else if (isStatus) {
        // Only show spinner for "in progress" messages, not completed ones
        const contentLower = message.content.toLowerCase();
        
        // Check if this message has been superseded by a completion message
        if (isSuperseded(messageIndex, message)) {
          return null; // Don't show spinner for superseded messages
        }
        
        // Check for completion indicators first (these take priority)
        const hasCheckmark = message.content.includes('✓');
        const isCompleted = hasCheckmark || 
                           contentLower.includes('complete') ||
                           (contentLower.includes('generated') && !contentLower.includes('generating')) ||
                           contentLower.includes('ready') ||
                           contentLower.includes('success') ||
                           contentLower.includes('finished');
        
        // Only show spinner if NOT completed AND contains in-progress indicators
        if (!isCompleted) {
          const isInProgress = contentLower.includes('generating') || 
                              contentLower.includes('uploading') ||
                              contentLower.includes('processing') ||
                              contentLower.includes('extracting') ||
                              contentLower.includes('progress') ||
                              contentLower.endsWith('...');
          if (isInProgress) {
            return <Loader2 className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 animate-spin" />;
          }
        }
        
        // For completed status messages, show no icon (or could show checkmark)
        return null;
      }
      return null;
    };

    return (
      <div
        key={message.id}
        className={`mb-2 flex items-start gap-2 group ${
          isError
            ? 'text-red-700 dark:text-red-300'
            : isSuggestion
            ? 'text-amber-700 dark:text-amber-300'
            : 'text-gray-800 dark:text-gray-200'
        }`}
      >
        {/* Icon */}
        {getStatusIcon() && (
          <div className="flex-shrink-0 mt-0.5">{getStatusIcon()}</div>
        )}
        
        {/* Message Content */}
        <div className="flex-1 min-w-0">
          <div
            className={`rounded-md px-2.5 py-1.5 ${
              isError
                ? 'bg-red-50/50 dark:bg-red-950/20'
                : isSuggestion
                ? 'bg-amber-50/50 dark:bg-amber-950/20'
                : isStatus
                ? 'bg-gray-50/50 dark:bg-gray-800/30'
                : 'bg-gray-50/50 dark:bg-gray-800/30'
            }`}
          >
            <p className="text-sm whitespace-pre-wrap break-words leading-normal">
              {message.content}
            </p>
          </div>
          
          {/* Timestamp - subtle, only on hover */}
          {message.timestamp && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
        </div>
      </div>
    );
  };

  if (chatMessages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Start a conversation with the agent...
        </p>
      </div>
    );
  }

  return (
    <div className="py-2">
      {chatMessages.map((message, index) => renderMessage(message, index))}
    </div>
  );
}

