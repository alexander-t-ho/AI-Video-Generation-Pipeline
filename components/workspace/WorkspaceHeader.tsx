'use client';

import { useProjectStore } from '@/lib/state/project-store';
import Link from 'next/link';
import { Home, Settings, MessageSquare, Share2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import DevPanel from './DevPanel';
import SystemPromptsPanel from './SystemPromptsPanel';
import UserMenu from '@/components/UserMenu';
import ProjectSelector from './ProjectSelector';
import ShareModal from './ShareModal';
import { saveProject } from '@/lib/api-client';

export default function WorkspaceHeader() {
  const {
    project,
    updateProjectMetadata,
    updateProject,
    isProjectSavedToBackend,
    setIsProjectSavedToBackend,
  } = useProjectStore();
  const [isDevPanelOpen, setIsDevPanelOpen] = useState(false);
  const [isSystemPromptsOpen, setIsSystemPromptsOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  const hasFinalVideo = project?.finalVideoUrl || project?.finalVideoS3Key;

  // Initialize title value when project changes
  useEffect(() => {
    if (project?.name) {
      setTitleValue(project.name);
    }
  }, [project?.name]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleTitleDoubleClick = () => {
    if (!project) return;
    setTitleValue(project.name || 'Untitled Project');
    setIsEditingTitle(true);
  };

  const handleTitleBlur = async () => {
    if (!project || !isEditingTitle) return;

    setIsEditingTitle(false);
    const trimmedValue = titleValue.trim();

    if (trimmedValue && trimmedValue !== project.name) {
      try {
        // If project doesn't exist in backend, create it first
        if (!isProjectSavedToBackend) {
          const backendProject = await saveProject(
            trimmedValue,
            project.prompt || '',
            project.targetDuration || 15,
            project.characterDescription
          );
          updateProject({ id: backendProject.id, name: trimmedValue });
          setIsProjectSavedToBackend(true);
        } else {
          await updateProjectMetadata({ name: trimmedValue });
          updateProject({ name: trimmedValue });
        }
      } catch (error) {
        console.error('Failed to update project name:', error);
        setTitleValue(project.name || 'Untitled Project');
      }
    } else {
      setTitleValue(project.name || 'Untitled Project');
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      titleInputRef.current?.blur();
    } else if (e.key === 'Escape') {
      setTitleValue(project?.name || 'Untitled Project');
      setIsEditingTitle(false);
    }
  };

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

          {/* Project Selector */}
          <ProjectSelector />

          {/* Divider */}
          <div className="h-6 w-px bg-white/20" />

          {/* Project Info */}
          {project && (
            <div className="hidden md:flex items-center gap-2">
              {isEditingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  onBlur={handleTitleBlur}
                  onKeyDown={handleTitleKeyDown}
                  className="text-base font-semibold text-white bg-white/10 border border-white/20 rounded px-2 py-1 focus:outline-none focus:border-white/40 min-w-[200px]"
                />
              ) : (
                <h1
                  className="text-base font-semibold text-white line-clamp-1 cursor-pointer hover:text-white/80 transition-colors"
                  onDoubleClick={handleTitleDoubleClick}
                  title="Double-click to edit"
                >
                  {project.name || 'Untitled Project'}
                </h1>
              )}
              <div className="flex flex-col">
                <p className="text-sm text-white/60">
                  {project.storyboard.length} scenes • {project.targetDuration}s target
                </p>
              </div>
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
          {/* User Menu */}
          <UserMenu />

          {/* Share Button - only show if project has final video */}
          {hasFinalVideo && (
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors flex items-center justify-center"
              title="Share Project"
              aria-label="Share project"
            >
              <Share2 className="w-5 h-5 text-white/60 hover:text-white" />
            </button>
          )}

          {/* System Prompts Button */}
          <button
            onClick={() => setIsSystemPromptsOpen(!isSystemPromptsOpen)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors flex items-center justify-center"
            title="View System Prompts"
            aria-label="View system prompts"
          >
            <MessageSquare className="w-5 h-5 text-white/60 hover:text-white" />
          </button>

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

      {/* System Prompts Panel */}
      <SystemPromptsPanel isOpen={isSystemPromptsOpen} onClose={() => setIsSystemPromptsOpen(false)} />

      {/* Share Modal */}
      {project && (
        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          projectId={project.id}
        />
      )}
    </>
  );
}
