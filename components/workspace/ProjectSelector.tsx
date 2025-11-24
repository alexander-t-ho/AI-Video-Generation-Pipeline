'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, User } from 'lucide-react';
import { useProjects } from '@/lib/hooks/useProjects';
import { useProjectStore } from '@/lib/state/project-store';
import { useSession } from 'next-auth/react';

export default function ProjectSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { data: session } = useSession();

  const { project } = useProjectStore();
  const { projects } = useProjects('all');

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!project) {
    return null;
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/20 rounded-lg hover:bg-white/10 transition-colors text-white text-sm"
      >
        <span className="truncate max-w-xs">{project.name || 'Untitled Project'}</span>
        <ChevronDown className={`w-4 h-4 text-white/60 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 bg-black/80 rounded-lg shadow-lg border border-white/20 py-2 z-50 backdrop-blur-sm max-h-96 overflow-y-auto">
          {/* Header */}
          <div className="px-3 py-2 border-b border-white/20">
            <h3 className="text-sm font-medium text-white">Projects</h3>
          </div>

          {/* Projects list */}
          <div className="py-1">
            {projects.length === 0 ? (
              <div className="px-3 py-3 text-center text-white/40 text-sm">
                No projects yet
              </div>
            ) : (
              projects.map((proj) => {
                const isOwned = session?.user?.id === proj.owner?.id;
                const companyName = proj.company?.name || 'Unknown Company';
                const ownerName = proj.owner?.name || proj.owner?.email || 'Unknown User';
                
                return (
                  <button
                    key={proj.id}
                    onClick={() => {
                      // Load the project
                      useProjectStore.getState().loadProject(proj.id);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      proj.id === project.id
                        ? 'bg-white/20 text-white'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="font-medium truncate flex-1">{proj.name || 'Untitled Project'}</div>
                      {isOwned && (
                        <span title="Your project">
                          <User className="w-3.5 h-3.5 text-white/40 flex-shrink-0" />
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-white/50 truncate mt-0.5">
                      {companyName} - {ownerName}
                    </div>
                    <div className="text-xs text-white/40 mt-1">
                      {proj._count?.scenes || 0} scenes • {proj.status.replace('_', ' ')}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
