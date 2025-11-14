'use client';

import { useProjectStore } from '@/lib/state/project-store';
import ModeToggle from './ModeToggle';
import StoryboardView from './StoryboardView';
import TimelineView from './TimelineView';
import EditorView from './EditorView';

interface MiddlePanelProps {
  children?: React.ReactNode;
}

export default function MiddlePanel({ children }: MiddlePanelProps) {
  const { viewMode } = useProjectStore();

  const renderView = () => {
    switch (viewMode) {
      case 'storyboard':
        return <StoryboardView />;
      case 'timeline':
        return <TimelineView />;
      case 'editor':
        return <EditorView />;
      default:
        return <StoryboardView />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Panel Header with Mode Toggle */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white capitalize">
            {viewMode === 'storyboard' && 'Storyboard'}
            {viewMode === 'timeline' && 'Timeline'}
            {viewMode === 'editor' && 'Editor'}
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

