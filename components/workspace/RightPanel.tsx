'use client';

import MediaDrawer from './MediaDrawer';
import { ChevronRight } from 'lucide-react';

interface RightPanelProps {
  children?: React.ReactNode;
  onCollapse?: () => void;
}

export default function RightPanel({ children, onCollapse }: RightPanelProps) {
  return (
    <div className="flex flex-col h-full w-full bg-black">
      {/* Panel Header */}
      <div className="px-3 py-2 border-b border-white/20 flex items-center justify-between">
        <h2 className="text-xs font-medium text-white/80 uppercase tracking-wide">
          Media Drawer
        </h2>
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
            aria-label="Collapse panel"
          >
            <ChevronRight className="w-4 h-4 text-white/60 hover:text-white" />
          </button>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {children || <MediaDrawer />}
      </div>
    </div>
  );
}

