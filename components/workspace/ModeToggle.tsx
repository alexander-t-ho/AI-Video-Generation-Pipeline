'use client';

import { useProjectStore } from '@/lib/state/project-store';
import { ViewMode } from '@/lib/types/components';
import { LayoutGrid, Clock, Edit } from 'lucide-react';

const modes: { mode: ViewMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'storyboard', label: 'Storyboard', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
  { mode: 'timeline', label: 'Timeline', icon: <Clock className="w-3.5 h-3.5" /> },
  { mode: 'editor', label: 'Editor', icon: <Edit className="w-3.5 h-3.5" /> },
];

export default function ModeToggle() {
  const { viewMode, setViewMode } = useProjectStore();

  return (
    <div className="flex items-center gap-0 bg-white/5 rounded-lg p-1">
      {modes.map(({ mode, label, icon }, index) => (
        <div key={mode} className="flex items-center">
          {index > 0 && (
            <div className="h-5 w-px bg-white/20" />
          )}
          <button
            onClick={() => setViewMode(mode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
              viewMode === mode
                ? 'bg-white/20 text-white shadow-sm'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
            aria-label={`Switch to ${label} view`}
            aria-pressed={viewMode === mode}
          >
            {icon}
            <span className="hidden sm:inline">{label}</span>
          </button>
        </div>
      ))}
    </div>
  );
}

