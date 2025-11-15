'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, Suspense, useState } from 'react';
import { useProjectStore } from '@/lib/state/project-store';
import LeftPanel from '@/components/workspace/LeftPanel';
import MiddlePanel from '@/components/workspace/MiddlePanel';
import RightPanel from '@/components/workspace/RightPanel';
import CollapsedLeftPanel from '@/components/workspace/CollapsedLeftPanel';
import CollapsedRightPanel from '@/components/workspace/CollapsedRightPanel';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import { ErrorBoundary } from '@/components/ErrorBoundary';

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');
  const { project, loadProject } = useProjectStore();
  // On mobile, panels start collapsed; on desktop, they start expanded
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Auto-collapse panels on mobile on mount
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        // Mobile/tablet: collapse panels by default
        setLeftPanelCollapsed(true);
        setRightPanelCollapsed(true);
      }
    };
    
    handleResize(); // Run on mount
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Load project if projectId is in URL but not in store
    if (projectId && !project) {
      setIsLoading(true);
      loadProject(projectId)
        .catch((error) => {
          console.error('Failed to load project:', error);
          // Redirect to home if project not found
          window.location.href = '/';
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else if (!project && !projectId) {
      // Redirect to home if no project
      window.location.href = '/';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, projectId]); // loadProject is stable, don't need it in deps

  if (!project || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            {isLoading ? 'Loading project...' : 'Loading workspace...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Workspace Header */}
      <WorkspaceHeader />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Panel - Responsive: hidden on mobile, collapsible on tablet/desktop */}
        {leftPanelCollapsed ? (
          <CollapsedLeftPanel onClick={() => setLeftPanelCollapsed(false)} />
        ) : (
          <div className="hidden lg:flex w-full lg:w-80 transition-all duration-300 ease-in-out flex-shrink-0 border-r border-gray-200 dark:border-gray-700">
            <LeftPanel onCollapse={() => setLeftPanelCollapsed(true)} />
          </div>
        )}

        {/* Middle Panel - Full width on mobile, flexible on larger screens */}
        <div className="flex-1 min-w-0 flex flex-col w-full lg:w-auto">
          <ErrorBoundary>
            <MiddlePanel />
          </ErrorBoundary>
        </div>

        {/* Right Panel - Responsive: full-screen overlay on mobile, collapsible on tablet/desktop */}
        {rightPanelCollapsed ? (
          <CollapsedRightPanel onClick={() => setRightPanelCollapsed(false)} />
        ) : (
          <div className="hidden lg:flex w-full lg:w-80 transition-all duration-300 ease-in-out flex-shrink-0 border-l border-gray-200 dark:border-gray-700">
            <RightPanel onCollapse={() => setRightPanelCollapsed(true)} />
          </div>
        )}
      </div>
      
      {/* Mobile: Floating action buttons for panels - show when panels are hidden */}
      <div className="lg:hidden fixed bottom-4 right-4 flex gap-2 z-50">
        {leftPanelCollapsed && (
          <button
            onClick={() => setLeftPanelCollapsed(false)}
            className="p-3 bg-blue-500 text-white rounded-full shadow-lg hover:bg-blue-600 active:scale-95 transition-all animate-scale-in"
            aria-label="Open agent panel"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>
        )}
        {rightPanelCollapsed && (
          <button
            onClick={() => setRightPanelCollapsed(false)}
            className="p-3 bg-blue-500 text-white rounded-full shadow-lg hover:bg-blue-600 active:scale-95 transition-all animate-scale-in"
            aria-label="Open media drawer"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
        )}
      </div>
      
      {/* Mobile: Full-screen overlay for panels */}
      {(!leftPanelCollapsed || !rightPanelCollapsed) && (
        <div 
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-fade-in" 
          onClick={() => {
            if (!leftPanelCollapsed) setLeftPanelCollapsed(true);
            if (!rightPanelCollapsed) setRightPanelCollapsed(true);
          }} 
        />
      )}
      
      {/* Mobile: Left Panel Overlay */}
      {!leftPanelCollapsed && (
        <div className="lg:hidden fixed inset-y-0 left-0 w-full sm:w-80 z-50 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 animate-slide-up shadow-xl">
          <LeftPanel onCollapse={() => setLeftPanelCollapsed(true)} />
        </div>
      )}
      
      {/* Mobile: Right Panel Overlay */}
      {!rightPanelCollapsed && (
        <div className="lg:hidden fixed inset-y-0 right-0 w-full sm:w-80 z-50 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 animate-slide-up shadow-xl">
          <RightPanel onCollapse={() => setRightPanelCollapsed(true)} />
        </div>
      )}
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Loading workspace...</p>
          </div>
        </div>
      }
    >
      <WorkspaceContent />
    </Suspense>
  );
}

