'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchProjects, loadProject } from '@/lib/api-client';

export interface ProjectSummary {
  id: string;
  name: string;
  prompt: string;
  targetDuration: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  owner?: {
    id: string;
    name: string;
    email: string;
  };
  _count?: {
    scenes: number;
  };
}

export interface UseProjectsReturn {
  projects: ProjectSummary[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  loadProject: (projectId: string) => Promise<any>;
}

/**
 * Hook to fetch and manage user's projects
 */
export function useProjects(scope: 'mine' | 'company' = 'mine'): UseProjectsReturn {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchProjects(scope);
      setProjects(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch projects';
      setError(message);
      console.error('Error fetching projects:', err);
    } finally {
      setIsLoading(false);
    }
  }, [scope]);

  // Fetch projects on mount and when scope changes
  useEffect(() => {
    refetch();
  }, [scope, refetch]);

  const loadProjectData = useCallback(async (projectId: string) => {
    try {
      setError(null);
      const project = await loadProject(projectId);
      return project;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load project';
      setError(message);
      console.error('Error loading project:', err);
      throw err;
    }
  }, []);

  return {
    projects,
    isLoading,
    error,
    refetch,
    loadProject: loadProjectData,
  };
}
