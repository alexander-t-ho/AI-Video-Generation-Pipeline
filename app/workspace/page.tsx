'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, Suspense, useState } from 'react';
import { useProjectStore, useProjectStore as projectStore } from '@/lib/state/project-store';
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
  // On mobile, panels start collapsed; on desktop, media drawer starts expanded, agent starts collapsed
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(true);
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
    // Handle invalid projectId (e.g., "undefined" string)
    if (projectId === 'undefined' || projectId === 'null') {
      console.error('Invalid projectId in URL, redirecting to home');
      window.location.href = '/';
      return;
    }

    // Load project if projectId is in URL but not in store
    if (projectId && !project) {
      setIsLoading(true);
      loadProject(projectId)
        .catch((error) => {
          console.error('Failed to load project:', error);
          // Don't redirect immediately - projects are in-memory only
          // If project is not in store, it might be a navigation issue
          // Wait a bit and check if project appears in store
          setTimeout(() => {
            const { project: currentProject } = projectStore.getState();
            if (!currentProject) {
              console.error('Project not found in store after retry, redirecting to home');
              window.location.href = '/';
            }
          }, 500);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else if (!project && !projectId) {
      // Redirect to home if no project and no projectId
      window.location.href = '/';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, projectId]); // loadProject is stable, don't need it in deps

  if (!project || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60">
            {isLoading ? 'Loading project...' : 'Loading workspace...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-black">
      {/* Workspace Header */}
      <WorkspaceHeader />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Panel - Media Drawer (swapped from right) */}
        {leftPanelCollapsed ? (
          <CollapsedLeftPanel onClick={() => setLeftPanelCollapsed(false)} />
        ) : (
          <div className="hidden lg:flex lg:w-80 transition-all duration-300 ease-in-out flex-shrink-0 border-r border-white/20 h-full">
            <RightPanel onCollapse={() => setLeftPanelCollapsed(true)} />
          </div>
        )}

        {/* Middle Panel - Full width on mobile, flexible on larger screens */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <ErrorBoundary>
            <MiddlePanel />
          </ErrorBoundary>
        </div>

        {/* Right Panel - Agent Chat (swapped from left) */}
        {rightPanelCollapsed ? (
          <CollapsedRightPanel onClick={() => setRightPanelCollapsed(false)} />
        ) : (
          <div className="hidden lg:flex lg:w-80 transition-all duration-300 ease-in-out flex-shrink-0 border-l border-white/20 h-full">
            <LeftPanel onCollapse={() => setRightPanelCollapsed(true)} />
          </div>
        )}
      </div>
      
      {/* Mobile: Floating action buttons for panels - show when panels are hidden */}
      <div className="lg:hidden fixed bottom-4 right-4 flex gap-2 z-50">
        {leftPanelCollapsed && (
          <button
            onClick={() => setLeftPanelCollapsed(false)}
            className="p-3 bg-white/10 text-white rounded-full shadow-lg hover:bg-white/20 active:scale-95 transition-all animate-scale-in border border-white/20 backdrop-blur-sm"
            aria-label="Open media drawer"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
        )}
        {rightPanelCollapsed && (
          <button
            onClick={() => setRightPanelCollapsed(false)}
            className="p-3 bg-white/10 text-white rounded-full shadow-lg hover:bg-white/20 active:scale-95 transition-all animate-scale-in border border-white/20 backdrop-blur-sm"
            aria-label="Open agent panel"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
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
      
      {/* Mobile: Left Panel Overlay - Media Drawer (swapped) */}
      {!leftPanelCollapsed && (
        <div className="lg:hidden fixed inset-y-0 left-0 w-full sm:w-80 z-50 bg-black border-r border-white/20 animate-slide-up shadow-xl backdrop-blur-sm">
          <RightPanel onCollapse={() => setLeftPanelCollapsed(true)} />
        </div>
      )}
      
      {/* Mobile: Right Panel Overlay - Agent Chat (swapped) */}
      {!rightPanelCollapsed && (
        <div className="lg:hidden fixed inset-y-0 right-0 w-full sm:w-80 z-50 bg-black border-l border-white/20 animate-slide-up shadow-xl backdrop-blur-sm">
          <LeftPanel onCollapse={() => setRightPanelCollapsed(true)} />
        </div>
      )}
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-black">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white/60">Loading workspace...</p>
          </div>
        </div>
      }
    >
      <WorkspaceContent />
    </Suspense>
  );
}

