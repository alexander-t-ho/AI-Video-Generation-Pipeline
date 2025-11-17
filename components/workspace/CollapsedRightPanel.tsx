'use client';

import { MessageCircle, ChevronLeft } from 'lucide-react';

interface CollapsedRightPanelProps {
  onClick: () => void;
}

export default function CollapsedRightPanel({ onClick }: CollapsedRightPanelProps) {
  return (
    <div
      onClick={onClick}
      className="w-12 h-full bg-black border-l border-white/20 flex flex-col cursor-pointer hover:bg-white/5 transition-colors group backdrop-blur-sm"
      title="Expand Agent Panel"
    >
      {/* Expand Arrow at Top - Centered */}
      <div className="w-full py-2 flex items-center justify-center">
        <ChevronLeft className="w-4 h-4 text-white/60 group-hover:text-white transition-colors" />
      </div>
      
      {/* Icon in Center */}
      <div className="flex-1 flex items-center justify-center">
        <MessageCircle className="w-5 h-5 text-white/40 group-hover:text-white/60" />
      </div>
    </div>
  );
}

