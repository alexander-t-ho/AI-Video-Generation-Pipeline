'use client';

import MediaDrawer from './MediaDrawer';
import { ChevronRight } from 'lucide-react';

interface RightPanelProps {
  children?: React.ReactNode;
  onCollapse?: () => void;
}

export default function RightPanel({ children, onCollapse }: RightPanelProps) {
  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800">
      {/* Panel Header */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors flex-shrink-0"
            aria-label="Collapse panel"
          >
            <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        )}
        <h2 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide flex-1">
          Media Drawer
        </h2>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {children || <MediaDrawer />}
      </div>
    </div>
  );
}

