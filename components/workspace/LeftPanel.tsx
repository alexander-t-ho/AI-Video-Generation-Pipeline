'use client';

import { useEffect, useRef } from 'react';
import AgentChat from './AgentChat';
import ChatInput from './ChatInput';
import { useProjectStore } from '@/lib/state/project-store';
import { useGenerationStatus } from '@/lib/hooks/useGenerationStatus';
import { ChevronLeft } from 'lucide-react';

interface LeftPanelProps {
  onCollapse?: () => void;
}

export default function LeftPanel({ onCollapse }: LeftPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { project, chatMessages, addChatMessage } = useProjectStore();

  // Enable real-time status updates
  useGenerationStatus({
    projectId: project?.id || null,
    enabled: !!project && project.status !== 'completed',
    interval: 5000, // Poll every 5 seconds
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSendMessage = (message: string, images?: File[]) => {
    if (!message.trim() && (!images || images.length === 0)) return;

    // Add user message
    addChatMessage({
      role: 'user',
      content: message || `Uploaded ${images?.length || 0} image(s)`,
      type: 'message',
    });

    // TODO: Handle message processing and image uploads
    // For now, just add a placeholder agent response
    setTimeout(() => {
      addChatMessage({
        role: 'agent',
        content: 'I received your message. This feature will be fully integrated in the next phase.',
        type: 'message',
      });
    }, 500);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
      {/* Panel Header - Cursor style: minimal */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h2 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
          Agent
        </h2>
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            aria-label="Collapse panel"
          >
            <ChevronLeft className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        )}
      </div>

      {/* Chat Container - Cursor style: clean padding */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-3"
        style={{ scrollBehavior: 'smooth' }}
      >
        <AgentChat />
      </div>

      {/* Chat Input */}
      <div className="flex-shrink-0">
        <ChatInput
          onSubmit={handleSendMessage}
          placeholder="Type a message or drag images here..."
          maxFiles={5}
          maxSizeMB={10}
        />
      </div>
    </div>
  );
}

