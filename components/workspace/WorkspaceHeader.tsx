'use client';

import { useProjectStore } from '@/lib/state/project-store';
import Link from 'next/link';
import { Home, Settings } from 'lucide-react';
import { useState } from 'react';
import DevPanel from './DevPanel';

export default function WorkspaceHeader() {
  const { project } = useProjectStore();
  const [isDevPanelOpen, setIsDevPanelOpen] = useState(false);

  return (
    <>
      <div className="h-14 flex items-center justify-between px-4 border-b border-white/20 bg-black backdrop-blur-sm">
        {/* Left Section */}
        <div className="flex items-center gap-3 flex-1">
          {/* Home Button */}
          <Link
            href="/"
            className="p-2 hover:bg-white/10 rounded-lg transition-colors flex items-center justify-center"
            aria-label="Home"
          >
            <Home className="w-5 h-5 text-white/60 hover:text-white" />
          </Link>
          
          {/* Divider */}
          <div className="h-6 w-px bg-white/20" />
          
          {/* Project Info */}
          {project && (
            <div>
              <h1 className="text-base font-semibold text-white line-clamp-1">
                {project.prompt.length > 50
                  ? `${project.prompt.substring(0, 50)}...`
                  : project.prompt}
              </h1>
              <p className="text-sm text-white/60">
                {project.storyboard.length} scenes • {project.targetDuration}s target
              </p>
            </div>
          )}
        </div>

        {/* Center Section - Scen3 Logo */}
        <div className="flex-1 flex items-center justify-center">
          <h1 className="text-xl font-light text-white tracking-tighter select-none whitespace-nowrap leading-none">
            Scen3
          </h1>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2 flex-1 justify-end">
          {/* Settings Button */}
          <button
            onClick={() => setIsDevPanelOpen(!isDevPanelOpen)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors flex items-center justify-center"
            title="Model Configuration"
            aria-label="Open settings"
          >
            <Settings className="w-5 h-5 text-white/60 hover:text-white" />
          </button>
        </div>
      </div>
      
      {/* Dev Panel */}
      <DevPanel isOpen={isDevPanelOpen} onClose={() => setIsDevPanelOpen(false)} />
    </>
  );
}

