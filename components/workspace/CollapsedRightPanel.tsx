'use client';

import { MessageCircle, ChevronLeft } from 'lucide-react';

interface CollapsedRightPanelProps {
  onClick: () => void;
}

export default function CollapsedRightPanel({ onClick }: CollapsedRightPanelProps) {
  return (
    <div
      onClick={onClick}
      className="w-12 h-full bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
      title="Expand Agent Panel"
    >
      {/* Expand Arrow at Top */}
      <div className="w-full py-2 flex items-center justify-center">
        <ChevronLeft className="w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors" />
      </div>
      
      {/* Icon in Center */}
      <div className="flex-1 flex items-center justify-center">
        <MessageCircle className="w-5 h-5 text-gray-400 dark:text-gray-500" />
      </div>
    </div>
  );
}

