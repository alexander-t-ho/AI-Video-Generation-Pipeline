'use client';

import { useProjectStore } from '@/lib/state/project-store';
import ModeToggle from './ModeToggle';
import StoryboardView from './StoryboardView';
import TimelineView from './TimelineView';
import EditorView from './EditorView';
import { ErrorBoundary } from '@/components/ErrorBoundary';

interface MiddlePanelProps {
  children?: React.ReactNode;
}

export default function MiddlePanel({ children }: MiddlePanelProps) {
  const { viewMode } = useProjectStore();

  const renderView = () => {
    switch (viewMode) {
      case 'storyboard':
        return (
          <ErrorBoundary>
            <StoryboardView />
          </ErrorBoundary>
        );
      case 'timeline':
        return (
          <ErrorBoundary>
            <TimelineView />
          </ErrorBoundary>
        );
      case 'editor':
        return (
          <ErrorBoundary>
            <EditorView />
          </ErrorBoundary>
        );
      default:
        return (
          <ErrorBoundary>
            <StoryboardView />
          </ErrorBoundary>
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Panel Header with Mode Toggle */}
      <div className="px-3 py-2 border-b border-white/20 bg-black backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium text-white/80 uppercase tracking-wide">
            {viewMode === 'storyboard' && 'STORYBOARD'}
            {viewMode === 'timeline' && 'TIMELINE'}
            {viewMode === 'editor' && 'EDITOR'}
          </h2>
          <ModeToggle />
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {children || renderView()}
      </div>
    </div>
  );
}

