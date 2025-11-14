'use client';

import { useProjectStore } from '@/lib/state/project-store';
import { ViewMode } from '@/lib/types/components';
import { LayoutGrid, Clock, Edit } from 'lucide-react';

const modes: { mode: ViewMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'storyboard', label: 'Storyboard', icon: <LayoutGrid className="w-4 h-4" /> },
  { mode: 'timeline', label: 'Timeline', icon: <Clock className="w-4 h-4" /> },
  { mode: 'editor', label: 'Editor', icon: <Edit className="w-4 h-4" /> },
];

export default function ModeToggle() {
  const { viewMode, setViewMode } = useProjectStore();

  return (
    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
      {modes.map(({ mode, label, icon }) => (
        <button
          key={mode}
          onClick={() => setViewMode(mode)}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
            viewMode === mode
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50'
          }`}
          aria-label={`Switch to ${label} view`}
          aria-pressed={viewMode === mode}
        >
          {icon}
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

