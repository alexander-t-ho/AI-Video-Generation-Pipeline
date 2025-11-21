'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DevPanel from './workspace/DevPanel';
import { StartingScreenProps } from '@/lib/types/components';
import { Settings, ArrowRight, Image, X, Loader2, Play, Trash2, ChevronDown } from 'lucide-react';
import { useProjectStore } from '@/lib/state/project-store';
import { createProject, deleteProject } from '@/lib/api-client';
import { useProjects } from '@/lib/hooks/useProjects';
import UserMenu from './UserMenu';

export default function StartingScreen({
  onCreateProject,
  isLoading: externalLoading,
}: StartingScreenProps) {
  const [isDevPanelOpen, setIsDevPanelOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isGeneratingStoryboard, setIsGeneratingStoryboard] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [showProjects, setShowProjects] = useState(false);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | 'all'>('all');

  // Use ref to prevent race conditions from rapid clicks
  const isTransitioningRef = useRef(false);

  const router = useRouter();
  const { projects, isLoading: projectsLoading, error: projectsError, refetch: refetchProjects } = useProjects('mine');
  const store = useProjectStore();

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(file => 
      file.type.startsWith('image/')
    );
    if (files.length > 0) {
      setImages(prevImages => [...prevImages, ...files]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter(file => 
      file.type.startsWith('image/')
    );

    if (files.length > 0) {
      setImages(prevImages => [...prevImages, ...files]);
    }
  };

  const removeImage = (index: number) => {
    setImages(prevImages => prevImages.filter((_, i) => i !== index));
  };

  const handleLoadProject = async (projectId: string) => {
    try {
      setIsLoadingProject(true);
      await store.loadProject(projectId);
      // Navigate to workspace
      router.push(`/workspace?projectId=${projectId}`);
    } catch (error) {
      console.error('Failed to load project:', error);
      alert('Failed to load project. Please try again.');
    } finally {
      setIsLoadingProject(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      setIsDeletingProject(true);
      await deleteProject(projectId);
      // Refresh the projects list
      await refetchProjects();
      setProjectToDelete(null);
    } catch (error) {
      console.error('Failed to delete project:', error);
      alert('Failed to delete project. Please try again.');
    } finally {
      setIsDeletingProject(false);
    }
  };

  const filteredProjects = projects.filter((project) => {
    // Search filter
    const matchesSearch = searchQuery === '' ||
      project.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.prompt.toLowerCase().includes(searchQuery.toLowerCase());

    // Status filter
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const buildPrompt = (idea: string) => {
    const lines: string[] = [];

    lines.push(
      idea.trim()
        ? `Original idea: ${idea.trim()}`
        : 'Original idea: The user wants a high-impact performance advertising spot. Infer a strong automotive or product concept from the answers below.'
    );

    lines.push(
      'Ad context: Performance-focused commercial for a small brand, with a strong emphasis on products and automotive advertising.'
    );

    const styleLine = 'Leigh Powis–style commercial film, tight and action-driven, with bold, cinematic framing and punchy pacing.';
    lines.push(
      `Visual style: ${styleLine} (assume this is shot on Arri Alexa by default).`
    );

    if (idea.trim()) {
      lines.push(`Story focus: ${idea.trim()}.`);
    }

    lines.push(
      'Turn this into a 5-scene cinematic advertising storyboard. Each scene should be described as a single sentence using the structure: [SHOT TYPE] + [SUBJECT] + [ACTION] + [STYLE] + [CAMERA MOVEMENT] + [AUDIO CUES].'
    );

    return lines.join('\n');
  };

  const handleInitialPrompt = async () => {
    // Prevent multiple rapid clicks (race condition fix)
    if (!prompt.trim() || externalLoading || isTransitioning || isTransitioningRef.current || isGeneratingStoryboard) {
      console.warn('[StartingScreen] handleInitialPrompt called but already transitioning or invalid state');
      return;
    }

    isTransitioningRef.current = true;
    setIsGeneratingStoryboard(true);
    setGenerationStatus('Extracting details...');

    // Extract car model from prompt using AI
    let carParams = '';
    try {
      const response = await fetch('/api/extract-car-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.carInfo) {
          const { brand, model, year, confidence } = data.carInfo;
          if (confidence !== 'none') {
            const params = new URLSearchParams();
            if (brand) params.set('carBrand', brand);
            if (model) params.set('carModel', model);
            if (year) params.set('carYear', year.toString());
            params.set('carConfidence', confidence);
            carParams = `&${params.toString()}`;
          }
        }
      }
    } catch (error) {
      console.warn('[StartingScreen] Failed to extract car model:', error);
      // Continue without car info - not critical
    }

    // Navigate directly to style selection (storyboard will be generated after style is chosen)
    setIsGeneratingStoryboard(false);
    isTransitioningRef.current = false;
    router.push(`/style?prompt=${encodeURIComponent(prompt.trim())}${carParams}`);
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center p-6 cinematic-gradient relative overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Generating Storyboard Overlay */}
      {isGeneratingStoryboard && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
            <p className="text-2xl text-white font-semibold mb-2">Processing</p>
            <p className="text-white/60">{generationStatus}</p>
          </div>
        </div>
      )}

      {/* Drag overlay indicator */}
      {isDragging && (
        <div className="absolute inset-0 bg-white/10 backdrop-blur-sm z-50 flex items-center justify-center border-4 border-dashed border-white/40">
          <div className="text-center">
            <p className="text-2xl text-white font-semibold mb-2">Drop images here</p>
            <p className="text-white/60">Add reference images for your project</p>
          </div>
        </div>
      )}

      {/* Large Background Text - Monologue style */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <h1 className="text-[20vw] md:text-[18vw] font-light text-white/10 tracking-tighter select-none whitespace-nowrap leading-none">
          Scen3
        </h1>
      </div>
      
      {/* Top Left Logo */}
      <div className="fixed top-6 left-6 z-40">
        <h1 className="text-2xl font-light text-white tracking-tighter select-none whitespace-nowrap leading-none">
          Scen3
        </h1>
      </div>
      
      {/* Top Right - User Menu and Settings */}
      <div className="fixed top-6 right-6 z-40 flex items-center gap-3">
        <UserMenu />
        <button
          onClick={() => setIsDevPanelOpen(!isDevPanelOpen)}
          className="p-2.5 bg-white/5 text-white/60 rounded-lg hover:bg-white/10 hover:text-white/80 border border-white/10 backdrop-blur-sm transition-all"
          title="Model Configuration"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      <div className="relative z-10 w-full max-w-6xl px-6 mt-20">
        {/* Initial Prompt Screen - Monologue style */}
        <div className={`space-y-8 ${isTransitioning ? 'animate-fade-out' : 'animate-fade-in'}`}>
          {/* Tagline */}
          <div className="text-center mb-12 w-full overflow-x-hidden">
            <h2 className="text-[36px] uppercase text-white/80 tracking-[0.5em] whitespace-nowrap" style={{ fontFamily: 'Porsche911, sans-serif' }}>
              Build your vision
            </h2>
          </div>

          {/* Recent Projects Section */}
          {projects.length > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
              <div className="space-y-4">
                {/* Header */}
                <button
                  onClick={() => setShowProjects(!showProjects)}
                  className="w-full flex items-center justify-between text-white hover:text-white/80 transition-colors"
                >
                  <h3 className="text-lg font-semibold">Recent Projects ({projects.length})</h3>
                  <ChevronDown className={`w-5 h-5 transition-transform ${showProjects ? 'rotate-180' : ''}`} />
                </button>

                {/* Search and Filter */}
                {showProjects && (
                  <div className="space-y-3">
                    {/* Search Input */}
                    <input
                      type="text"
                      placeholder="Search projects..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/40 focus:bg-white/15 transition-all"
                    />

                    {/* Status Filter */}
                    <div className="flex gap-2 flex-wrap">
                      {(['all', 'STORYBOARD', 'SCENE_GENERATION', 'COMPLETED'] as const).map((status) => (
                        <button
                          key={status}
                          onClick={() => setStatusFilter(status)}
                          className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                            statusFilter === status
                              ? 'bg-white text-black'
                              : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
                          }`}
                        >
                          {status === 'all' ? 'All' : status.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Projects List */}
                {showProjects && (
                  <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
                    {filteredProjects.length === 0 ? (
                      <p className="text-white/40 text-center py-4">No projects found</p>
                    ) : (
                      filteredProjects.map((project) => (
                        <div
                          key={project.id}
                          className="flex items-center justify-between p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors group"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-white font-medium truncate">{project.name || 'Untitled Project'}</p>
                              <span className="px-2 py-0.5 bg-white/10 text-white/60 text-xs rounded whitespace-nowrap">
                                {project.status.replace('_', ' ')}
                              </span>
                            </div>
                            <p className="text-white/50 text-sm truncate">{project.prompt.substring(0, 60)}...</p>
                            <p className="text-white/40 text-xs mt-1">
                              {project._count?.scenes || 0} scenes • {new Date(project.updatedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="ml-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleLoadProject(project.id)}
                              disabled={isLoadingProject}
                              className="p-2 text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Load project"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setProjectToDelete(project.id)}
                              className="p-2 text-white/60 hover:text-red-400 bg-white/5 hover:bg-red-500/10 rounded-lg transition-all"
                              title="Delete project"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Delete Confirmation Modal */}
          {projectToDelete && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-black/80 border border-white/20 rounded-2xl p-6 max-w-sm w-full">
                <h3 className="text-lg font-semibold text-white mb-2">Delete Project?</h3>
                <p className="text-white/60 text-sm mb-6">
                  This action cannot be undone. All project data will be permanently deleted.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setProjectToDelete(null)}
                    disabled={isDeletingProject}
                    className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (projectToDelete) {
                        handleDeleteProject(projectToDelete);
                      }
                    }}
                    disabled={isDeletingProject}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isDeletingProject ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Divider */}
          {projects.length > 0 && (
            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-white/40 text-sm">OR</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>
          )}

          {/* New Project Section */}
          <div>
            <h3 className="text-sm font-semibold text-white/60 mb-4 uppercase tracking-widest">Create New</h3>

          {/* Main Prompt Box - Replaces the white device box */}
          <div className="relative group">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                // Tab fills in default prompt
                if (e.key === 'Tab' && !prompt.trim()) {
                  e.preventDefault();
                  setPrompt('Create a cinematic advertisement for a Porsche 911');
                }
                // Enter submits, Shift+Enter creates new line
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (prompt.trim() && !externalLoading) {
                    handleInitialPrompt();
                  }
                }
              }}
              placeholder="Create a cinematic advertisement for a Porsche 911"
              disabled={externalLoading}
              rows={6}
              className="w-full px-8 py-6 bg-white/5 border border-white/20 rounded-3xl text-white text-xl font-light placeholder-white/40 focus:outline-none focus:border-white/40 focus:bg-white/10 backdrop-blur-sm transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed shadow-2xl"
            />
            {/* Gallery Icon - Bottom Left */}
            <input
              type="file"
              id="image-upload"
              accept="image/*"
              multiple
              onChange={handleFileInput}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => document.getElementById('image-upload')?.click()}
              className="absolute bottom-4 left-4 p-2 text-white/20 hover:text-white/50 transition-colors"
              title="Add reference images"
            >
              <Image className="w-5 h-5" />
            </button>
          </div>

            {/* Image Previews */}
            {images.length > 0 && (
              <div className="flex flex-wrap gap-3 animate-slide-down">
                {images.map((image, index) => (
                  <div key={index} className="relative group/image">
                    <img
                      src={URL.createObjectURL(image)}
                      alt={`Reference ${index + 1}`}
                      className="w-24 h-24 object-cover rounded-lg border border-white/20"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute -top-2 -right-2 p-1 bg-white/90 hover:bg-white rounded-full text-black transition-all opacity-0 group-hover/image:opacity-100"
                      title="Remove image"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Continue Button */}
          <div className="fixed bottom-6 right-6 z-40">
            <button
              onClick={handleInitialPrompt}
              disabled={!prompt.trim() || externalLoading}
              className="group relative px-10 py-5 bg-white text-black rounded-full text-lg font-medium hover:bg-white/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-3 shadow-2xl shadow-white/20"
            >
              <span>Continue</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* Dev Panel */}
      <DevPanel isOpen={isDevPanelOpen} onClose={() => setIsDevPanelOpen(false)} />
    </div>
  );
}

