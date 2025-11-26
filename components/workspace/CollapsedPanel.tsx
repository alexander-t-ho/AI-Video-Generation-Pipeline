/**
 * Collapsed Panel - Unified component for collapsed left/right panels
 */

'use client';

import { ChevronLeft, ChevronRight, LucideIcon } from 'lucide-react';

interface CollapsedPanelProps {
  onClick: () => void;
  side: 'left' | 'right';
  icon: LucideIcon;
  title: string;
}

export default function CollapsedPanel({ onClick, side, icon: Icon, title }: CollapsedPanelProps) {
  const ChevronIcon = side === 'left' ? ChevronRight : ChevronLeft;
  const borderClass = side === 'left' ? 'border-r' : 'border-l';

  return (
    <div
      onClick={onClick}
      className={`w-12 h-full bg-black ${borderClass} border-white/20 flex flex-col cursor-pointer hover:bg-white/5 transition-colors group backdrop-blur-sm`}
      title={title}
    >
      <div className="w-full py-2 flex items-center justify-center">
        <ChevronIcon className="w-4 h-4 text-white/60 group-hover:text-white transition-colors" />
      </div>
      <div className="flex-1 flex items-center justify-center">
        <Icon className="w-5 h-5 text-white/40 group-hover:text-white/60" />
      </div>
    </div>
  );
}

