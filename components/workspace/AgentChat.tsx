'use client';

import { useProjectStore } from '@/lib/state/project-store';
import { ChatMessage } from '@/lib/types/components';
import { AlertCircle, Lightbulb, Loader2 } from 'lucide-react';

export default function AgentChat() {
  const { chatMessages } = useProjectStore();

  const renderMessage = (message: ChatMessage) => {
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
        return <Loader2 className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 animate-spin" />;
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
      {chatMessages.map(renderMessage)}
    </div>
  );
}

