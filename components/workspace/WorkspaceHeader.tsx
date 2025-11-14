'use client';

import { useProjectStore } from '@/lib/state/project-store';

export default function WorkspaceHeader() {
  const { project } = useProjectStore();

  return (
    <div className="h-14 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      {/* Left Section */}
      <div className="flex items-center gap-3">
        {/* Project Info */}
        {project && (
          <div>
            <h1 className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-1">
              {project.prompt.length > 50
                ? `${project.prompt.substring(0, 50)}...`
                : project.prompt}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {project.storyboard.length} scenes • {project.targetDuration}s target
            </p>
          </div>
        )}
      </div>

      {/* Right Section - Empty for now, can add actions later */}
      <div className="flex items-center gap-2">
      </div>
    </div>
  );
}

