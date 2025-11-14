'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';
import { useProjectStore } from '@/lib/state/project-store';

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');
  const { project } = useProjectStore();

  useEffect(() => {
    if (!project && !projectId) {
      // Redirect to home if no project
      window.location.href = '/';
    }
  }, [project, projectId]);

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">Loading workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Workspace</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Project: {project.prompt.substring(0, 50)}...
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
          Workspace UI will be implemented in Phase 3-6
        </p>
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">Loading workspace...</p>
        </div>
      </div>
    }>
      <WorkspaceContent />
    </Suspense>
  );
}

