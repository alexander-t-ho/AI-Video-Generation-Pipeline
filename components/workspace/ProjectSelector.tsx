'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Save, Loader2 } from 'lucide-react';
import { useProjects } from '@/lib/hooks/useProjects';
import { useProjectStore } from '@/lib/state/project-store';

export default function ProjectSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { project, updateProjectMetadata } = useProjectStore();
  const { projects, refetch } = useProjects('mine');

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

  // Auto-save project metadata when it changes
  const handleSaveProject = async () => {
    if (!project || !project.id) return;

    try {
      setIsSaving(true);
      await updateProjectMetadata({
        name: project.name || 'Untitled Project',
        characterDescription: project.characterDescription,
        status: project.status,
        finalVideoUrl: project.finalVideoUrl,
        finalVideoS3Key: project.finalVideoS3Key,
      });
      await refetch();
    } catch (error) {
      console.error('Failed to save project:', error);
    } finally {
      setIsSaving(false);
    }
  };

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
          {/* Header with save button */}
          <div className="px-3 py-2 border-b border-white/20 flex items-center justify-between">
            <h3 className="text-sm font-medium text-white">Your Projects</h3>
            <button
              onClick={handleSaveProject}
              disabled={isSaving}
              className="p-1.5 text-white/60 hover:text-white bg-white/10 hover:bg-white/20 rounded transition-all disabled:opacity-50 flex items-center gap-1"
              title="Save current project"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Projects list */}
          <div className="py-1">
            {projects.length === 0 ? (
              <div className="px-3 py-3 text-center text-white/40 text-sm">
                No projects yet
              </div>
            ) : (
              projects.map((proj) => (
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
                  <div className="font-medium truncate">{proj.name || 'Untitled Project'}</div>
                  <div className="text-xs text-white/50 truncate">{proj.prompt.substring(0, 50)}...</div>
                  <div className="text-xs text-white/40 mt-1">
                    {proj._count?.scenes || 0} scenes • {proj.status.replace('_', ' ')}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
