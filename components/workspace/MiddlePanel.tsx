'use client';

import { useProjectStore } from '@/lib/state/project-store';
import ModeToggle from './ModeToggle';
import StoryboardView from './StoryboardView';
import TimelineView from './TimelineView';
import EditorView from './EditorView';
import MediaGenerationView from './MediaGenerationView';
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
      case 'video':
        return (
          <ErrorBoundary>
            <EditorView />
          </ErrorBoundary>
        );
      case 'images':
        return (
          <ErrorBoundary>
            <MediaGenerationView />
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
      <div className="h-10 px-3 border-b border-white/20 bg-black backdrop-blur-sm flex items-center justify-between">
        <h2 className="text-xs font-medium text-white/80 uppercase tracking-wide">
          {viewMode === 'storyboard' && 'STORYBOARD'}
          {viewMode === 'images' && 'IMAGES'}
          {viewMode === 'video' && 'VIDEO'}
          {viewMode === 'timeline' && 'TIMELINE'}
        </h2>
        <ModeToggle />
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {children || renderView()}
      </div>
    </div>
  );
}

