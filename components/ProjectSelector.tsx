'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { FolderOpen, Users, Plus, Loader2, Calendar, User } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  prompt: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    name: string;
    email: string;
  };
  _count: {
    scenes: number;
  };
}

interface ProjectSelectorProps {
  onSelect?: (projectId: string) => void;
  onCreateNew?: () => void;
}

export default function ProjectSelector({ onSelect, onCreateNew }: ProjectSelectorProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<'mine' | 'company'>('mine');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      fetchProjects();
    }
  }, [session, scope]);

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects?scope=${scope}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch projects');
      }

      setProjects(data.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch projects');
    } finally {
      setLoading(false);
    }
  };

  const handleProjectClick = (projectId: string) => {
    if (onSelect) {
      onSelect(projectId);
    } else {
      router.push(`/workspace?projectId=${projectId}`);
    }
  };

  const handleCreateNew = () => {
    if (onCreateNew) {
      onCreateNew();
    } else {
      router.push('/');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-500/20 text-green-400';
      case 'STITCHING':
        return 'bg-blue-500/20 text-blue-400';
      case 'SCENE_GENERATION':
        return 'bg-yellow-500/20 text-yellow-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  if (!session) {
    return (
      <div className="text-center py-8 text-gray-400">
        Please sign in to view projects
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Scope Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setScope('mine')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded text-sm transition-colors ${
              scope === 'mine'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            <span>My Projects</span>
          </button>
          <button
            onClick={() => setScope('company')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded text-sm transition-colors ${
              scope === 'company'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Company Projects</span>
          </button>
        </div>

        <button
          onClick={handleCreateNew}
          className="flex items-center space-x-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-sm text-white transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Project</span>
        </button>
      </div>

      {/* Projects List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : error ? (
        <div className="text-center py-8 text-red-400">
          {error}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <FolderOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No projects found</p>
          <button
            onClick={handleCreateNew}
            className="mt-4 text-blue-500 hover:text-blue-400"
          >
            Create your first project
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => handleProjectClick(project.id)}
              className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded-lg p-4 transition-colors border border-gray-700 hover:border-gray-600"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-white truncate">
                    {project.name}
                  </h3>
                  <p className="text-sm text-gray-400 line-clamp-2 mt-1">
                    {project.prompt}
                  </p>
                </div>
                <span className={`ml-4 px-2 py-1 rounded text-xs ${getStatusColor(project.status)}`}>
                  {project.status.replace('_', ' ')}
                </span>
              </div>

              <div className="flex items-center space-x-4 mt-3 text-xs text-gray-500">
                <span className="flex items-center space-x-1">
                  <Calendar className="w-3 h-3" />
                  <span>{formatDate(project.updatedAt)}</span>
                </span>
                <span>{project._count.scenes} scenes</span>
                {scope === 'company' && project.owner.id !== session.user.id && (
                  <span className="flex items-center space-x-1">
                    <User className="w-3 h-3" />
                    <span>{project.owner.name}</span>
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
