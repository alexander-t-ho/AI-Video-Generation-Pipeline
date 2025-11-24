'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Loader2, Video, Calendar, Trash2, FolderKanban, ArrowLeft, Building2, User, Check, X } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  prompt: string;
  status: string;
  targetDuration: number;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  owner?: {
    id: string;
    name: string | null;
    email: string;
  };
  _count?: {
    scenes: number;
  };
}

type TabType = 'mine' | 'company';

export default function ProjectsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('mine');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    async function fetchProjects() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/projects?scope=${activeTab === 'company' ? 'company' : 'mine'}`);
        if (!response.ok) {
          throw new Error('Failed to fetch projects');
        }
        const data = await response.json();
        setProjects(data.projects || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }

    if (session) {
      fetchProjects();
    }
  }, [session, activeTab]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleDelete = async (projectId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      return;
    }

    setDeletingId(projectId);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete project');
      }

      setProjects(projects.filter(p => p.id !== projectId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete project');
    } finally {
      setDeletingId(null);
    }
  };

  const handleStartEdit = (project: Project, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(project.id);
    setEditingName(project.name || 'Untitled Project');
  };

  const handleSaveName = async (projectId: string) => {
    const trimmedName = editingName.trim();
    if (!trimmedName) {
      setEditingId(null);
      return;
    }

    const project = projects.find(p => p.id === projectId);
    if (project && project.name === trimmedName) {
      setEditingId(null);
      return;
    }

    setSavingId(projectId);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update project name');
      }

      const data = await response.json();
      setProjects(projects.map(p =>
        p.id === projectId ? { ...p, name: data.project.name } : p
      ));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update project name');
    } finally {
      setSavingId(null);
      setEditingId(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent, projectId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveName(projectId);
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-500/20 text-green-300 border-green-400/30';
      case 'SCENE_GENERATION':
      case 'STITCHING':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-400/30';
      case 'STORYBOARD':
      default:
        return 'bg-blue-500/20 text-blue-300 border-blue-400/30';
    }
  };

  const isOwnProject = (project: Project) => {
    return project.ownerId === session?.user?.id;
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white/60 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <FolderKanban className="w-7 h-7 text-blue-400" />
                Projects
              </h1>
              <p className="text-white/60 text-sm mt-1">
                Manage and view your video projects
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-white/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Project
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 bg-white/5 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab('mine')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'mine'
                ? 'bg-white text-black'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            <User className="w-4 h-4" />
            My Projects
          </button>
          <button
            onClick={() => setActiveTab('company')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'company'
                ? 'bg-white text-black'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Company Projects
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-white/60 animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          /* Empty State */
          <div className="text-center py-16 bg-white/5 rounded-xl border border-white/10">
            <FolderKanban className="w-12 h-12 text-white/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              {activeTab === 'mine' ? 'No projects yet' : 'No company projects'}
            </h3>
            <p className="text-white/60 mb-6">
              {activeTab === 'mine'
                ? 'Create your first video project to get started'
                : 'No projects have been created by your company members yet'}
            </p>
            {activeTab === 'mine' && (
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-black rounded-lg font-medium hover:bg-white/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Project
              </Link>
            )}
          </div>
        ) : (
          /* Projects Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl overflow-hidden transition-all"
              >
                <div className="p-5">
                  {/* Project Title - Editable */}
                  {editingId === project.id ? (
                    <div className="flex items-center gap-2 mb-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => handleSaveName(project.id)}
                        onKeyDown={(e) => handleKeyDown(e, project.id)}
                        className="flex-1 px-2 py-1 text-lg font-medium bg-white/10 border border-blue-400/50 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                        disabled={savingId === project.id}
                      />
                      {savingId === project.id && (
                        <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                      )}
                    </div>
                  ) : (
                    <h3
                      className="text-lg font-medium text-white mb-2 truncate group-hover:text-blue-300 transition-colors cursor-pointer"
                      onDoubleClick={(e) => handleStartEdit(project, e)}
                      title="Double-click to edit name"
                    >
                      {project.name || 'Untitled Project'}
                    </h3>
                  )}

                  {/* Owner Info (for company tab) */}
                  {activeTab === 'company' && project.owner && (
                    <div className="flex items-center gap-1 text-xs text-white/50 mb-2">
                      <User className="w-3 h-3" />
                      <span>{project.owner.name || project.owner.email}</span>
                      {isOwnProject(project) && (
                        <span className="ml-1 px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded text-[10px]">You</span>
                      )}
                    </div>
                  )}

                  <Link href={`/workspace?projectId=${project.id}`} className="block">
                    {/* Prompt Preview */}
                    <p className="text-sm text-white/60 line-clamp-2 mb-4 min-h-[40px]">
                      {project.prompt || 'No description'}
                    </p>

                    {/* Status Badge */}
                    <div className="flex items-center gap-2 mb-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded border ${getStatusColor(project.status)}`}>
                        {project.status.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-white/40">
                        {project._count?.scenes || 0} scenes
                      </span>
                    </div>

                    {/* Meta Info */}
                    <div className="flex items-center gap-4 text-xs text-white/40">
                      <div className="flex items-center gap-1">
                        <Video className="w-3.5 h-3.5" />
                        {project.targetDuration}s
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(project.createdAt)}
                      </div>
                    </div>
                  </Link>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 bg-white/5">
                  <Link
                    href={`/workspace?projectId=${project.id}`}
                    className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors"
                  >
                    Open Project
                  </Link>
                  {(activeTab === 'mine' || isOwnProject(project)) && (
                    <button
                      onClick={(e) => handleDelete(project.id, e)}
                      disabled={deletingId === project.id}
                      className="p-2 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                      title="Delete project"
                    >
                      {deletingId === project.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
