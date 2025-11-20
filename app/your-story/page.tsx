'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import SceneCard from '@/components/wizard/SceneCard';
import { DndContext, closestCenter, DragEndEvent, DragStartEvent, DragOverEvent, MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, DragOverlay, MeasuringStrategy } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Scene } from '@/lib/types';
import { useProjectStore } from '@/lib/state/project-store';
import { createProject } from '@/lib/api-client';
import { Loader2, ArrowRight, Sparkles } from 'lucide-react';

// Wrapper component that uses useSearchParams
function YourStoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { project } = useProjectStore();

  // Storyboard editor state - structured fields for WHO/WHAT/STORY/FEEL
  const [storyFields, setStoryFields] = useState({
    who: '',
    what: '',
    storyIdea: '',
    feelDo: '',
  });
  const [storyboardScenes, setStoryboardScenes] = useState<Scene[] | null>(null);
  const [isGeneratingStoryboard, setIsGeneratingStoryboard] = useState(false);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [isGeneratingIdea, setIsGeneratingIdea] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [activeScene, setActiveScene] = useState<Scene | null>(null);
  const [regeneratingSceneId, setRegeneratingSceneId] = useState<string | null>(null);

  // Helper to convert structured fields to idea string
  const getIdeaFromFields = () => {
    const parts: string[] = [];
    if (storyFields.who.trim()) parts.push(`**WHO**: ${storyFields.who.trim()}`);
    if (storyFields.what.trim()) parts.push(`**WHAT**: ${storyFields.what.trim()}`);
    if (storyFields.storyIdea.trim()) parts.push(`**STORY IDEA**: ${storyFields.storyIdea.trim()}`);
    if (storyFields.feelDo.trim()) parts.push(`**FEEL/DO**: ${storyFields.feelDo.trim()}`);
    return parts.join('\n');
  };

  // Helper to parse idea string into structured fields
  const parseIdeaToFields = (idea: string) => {
    // Use regex that captures content until the next header (with possible blank lines) or end of string
    const whoMatch = idea.match(/\*\*WHO\*\*:\s*(.+?)(?=\n\s*\n\s*\*\*|\n\*\*|$)/s);
    const whatMatch = idea.match(/\*\*WHAT\*\*:\s*(.+?)(?=\n\s*\n\s*\*\*|\n\*\*|$)/s);
    const storyMatch = idea.match(/\*\*STORY IDEA\*\*:\s*(.+?)(?=\n\s*\n\s*\*\*|\n\*\*|$)/s);
    const feelDoMatch = idea.match(/\*\*FEEL\/DO\*\*:\s*(.+?)(?=\n\s*\n\s*\*\*|\n\*\*|$)/s);

    return {
      who: whoMatch ? whoMatch[1].trim() : '',
      what: whatMatch ? whatMatch[1].trim() : '',
      storyIdea: storyMatch ? storyMatch[1].trim() : '',
      feelDo: feelDoMatch ? feelDoMatch[1].trim() : '',
    };
  };

  // Check if any field has content
  const hasContent = storyFields.who.trim() || storyFields.what.trim() || storyFields.storyIdea.trim() || storyFields.feelDo.trim();

  // Configure sensors with activation constraints for better UX
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10, // 10px threshold before drag starts (prevents accidental drags)
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250, // 250ms delay for touch devices
        tolerance: 5, // 5px tolerance for touch movement
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Measuring configuration for better performance
  const measuring = {
    droppable: {
      strategy: MeasuringStrategy.Always,
    },
  };

  // Get duration from project store or default to 15
  const duration = project?.targetDuration || 15;

  // Load existing storyboard and idea from project store on mount
  useEffect(() => {
    // First, check for generated idea in localStorage (from StartingScreen)
    const generatedIdea = localStorage.getItem('generatedStoryIdea');
    if (generatedIdea) {
      const parsed = parseIdeaToFields(generatedIdea);
      setStoryFields(parsed);
      localStorage.removeItem('generatedStoryIdea'); // Clean up
    } else if (project?.prompt) {
      // Fallback: try to extract the original idea from the project prompt
      // Use a regex that captures everything after "Original idea:" until "Ad context:"
      const ideaMatch = project.prompt.match(/Original idea:\s*(.+?)(?=\nAd context:|$)/s);
      if (ideaMatch) {
        const parsed = parseIdeaToFields(ideaMatch[1].trim());
        setStoryFields(parsed);
      }
    }

    // Load storyboard from project store
    if (project?.storyboard && project.storyboard.length > 0) {
      setStoryboardScenes(project.storyboard);
    }
  }, []); // Only run on mount

  // Fallback: Auto-generate story idea only if no storyboard exists (e.g., direct URL access)
  useEffect(() => {
    const initialPrompt = searchParams.get('prompt');
    // Only generate if we have a prompt, no content, and no storyboard from store
    if (initialPrompt && !hasContent && !storyboardScenes && !project?.storyboard?.length) {
      generateStoryIdea(initialPrompt);
    }
  }, [searchParams]); // Only run when searchParams changes

  // Fallback: Auto-generate storyboard only if not pre-generated
  useEffect(() => {
    // Only auto-generate if:
    // 1. We have content
    // 2. We don't already have a storyboard (neither local nor from store)
    // 3. We're not currently generating anything
    if (hasContent && !storyboardScenes && !project?.storyboard?.length && !isGeneratingStoryboard && !isGeneratingIdea) {
      // Small delay to ensure state is settled
      const timer = setTimeout(() => {
        handleGenerateStoryboard();
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [hasContent, storyboardScenes, isGeneratingStoryboard, isGeneratingIdea]);

  const generateStoryIdea = async (initialPrompt: string) => {
    setIsGeneratingIdea(true);
    try {
      const response = await fetch('/api/generate-story-idea', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ initialPrompt }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate story idea');
      }

      const data = await response.json();
      if (data.success && data.idea) {
        const parsed = parseIdeaToFields(data.idea);
        setStoryFields(parsed);
      }
    } catch (error) {
      console.error('Failed to generate story idea:', error);
      // Fallback: use the initial prompt as WHAT
      setStoryFields({
        who: '',
        what: initialPrompt,
        storyIdea: '',
        feelDo: '',
      });
    } finally {
      setIsGeneratingIdea(false);
    }
  };

  const buildPrompt = () => {
    const lines: string[] = [];
    const idea = getIdeaFromFields();
    const store = useProjectStore.getState();
    const selectedStylePrompt = store.selectedStylePrompt;

    lines.push(
      idea.trim()
        ? `Original idea: ${idea.trim()}`
        : 'Original idea: The user wants a high-impact performance advertising spot. Infer a strong automotive or product concept from the answers below.'
    );

    lines.push(
      'Ad context: Performance-focused commercial for a small brand, with a strong emphasis on products and automotive advertising.'
    );

    // Inject the selected style prompt if available, otherwise use default
    const styleLine = selectedStylePrompt 
      ? selectedStylePrompt 
      : 'Leigh Powis–style commercial film, tight and action-driven, with bold, cinematic framing and punchy pacing.';
    lines.push(
      `Visual style: ${styleLine}${!selectedStylePrompt ? ' (assume this is shot on Arri Alexa by default).' : ''}`
    );

    if (idea.trim()) {
      lines.push(`Story focus: ${idea.trim()}.`);
    }

    lines.push(
      'Turn this into a 5-scene cinematic advertising storyboard. Each scene should be described as a single sentence using the structure: [SHOT TYPE] + [SUBJECT] + [ACTION] + [STYLE] + [CAMERA MOVEMENT] + [AUDIO CUES].'
    );

    return lines.join('\n');
  };

  const handleGenerateStoryboard = async () => {
    if (isGeneratingStoryboard || !hasContent) return;

    setIsGeneratingStoryboard(true);
    try {
      // Build prompt using the same logic as Scen3Wizard
      const prompt = buildPrompt();

      // Ensure project exists in store with the prompt
      const store = useProjectStore.getState();
      if (!store.project) {
        // Create new project with prompt
        store.createProject(prompt, duration);
      } else {
        // Update existing project with new prompt
        // We need to update the project's prompt while keeping the same project ID
        const currentProject = store.project;
        store.createProject(prompt, duration);
        // Restore the project ID to maintain continuity
        if (currentProject.id) {
          useProjectStore.setState({
            project: {
              ...useProjectStore.getState().project!,
              id: currentProject.id,
            },
          });
        }
      }

      // Generate storyboard using the API
      const result = await createProject(prompt, duration);

      if (result.storyboard.success && result.storyboard.scenes) {
        setStoryboardScenes(result.storyboard.scenes);
        // Store in project store for persistence - this will use the project created above
        store.setStoryboard(result.storyboard.scenes);
      } else {
        throw new Error(result.storyboard.error || 'Failed to generate storyboard');
      }
    } catch (error) {
      console.error('Failed to generate storyboard:', error);
      // TODO: Add proper error handling/display
    } finally {
      setIsGeneratingStoryboard(false);
    }
  };

  const handleUpdateScene = (sceneId: string, updates: Partial<Scene>) => {
    useProjectStore.getState().updateScene(sceneId, updates);

    // Update local state
    if (storyboardScenes) {
      setStoryboardScenes(storyboardScenes.map(scene =>
        scene.id === sceneId ? { ...scene, ...updates } : scene
      ));
    }
  };

  const handleRegenerateScene = async (sceneId: string) => {
    if (!storyboardScenes) return;

    const scene = storyboardScenes.find(s => s.id === sceneId);
    if (!scene) return;

    setRegeneratingSceneId(sceneId);

    try {
      // Get context from other scenes
      const otherScenes = storyboardScenes.filter(s => s.id !== sceneId);
      const context = otherScenes
        .map((s, idx) => `Scene ${idx + 1}: ${s.description}`)
        .join('; ');

      const response = await fetch('/api/regenerate-scene', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sceneId,
          currentDescription: scene.description,
          currentImagePrompt: scene.imagePrompt,
          context,
          idea: getIdeaFromFields().trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to regenerate scene');
      }

      const data = await response.json();
      if (data.success && data.scene) {
        // Update the scene
        handleUpdateScene(sceneId, {
          description: data.scene.description,
          imagePrompt: data.scene.imagePrompt,
          suggestedDuration: data.scene.suggestedDuration,
        });
      }
    } catch (error) {
      console.error('Failed to regenerate scene:', error);
      // You could add a toast notification here
    } finally {
      setRegeneratingSceneId(null);
    }
  };

  // Compute the current order of scenes (including during drag)
  const orderedScenes = storyboardScenes ? (() => {
    if (!activeId || !overId || activeId === overId) {
      return storyboardScenes;
    }

    const activeIndex = storyboardScenes.findIndex(s => s.id === activeId);
    const overIndex = storyboardScenes.findIndex(s => s.id === overId);

    if (activeIndex === -1 || overIndex === -1) {
      return storyboardScenes;
    }

    return arrayMove(storyboardScenes, activeIndex, overIndex);
  })() : null;

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string;
    setActiveId(id);
    // Find and store the active scene for the drag overlay
    if (storyboardScenes) {
      const scene = storyboardScenes.find(s => s.id === id);
      setActiveScene(scene || null);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over?.id as string || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveId(null);
    setOverId(null);
    setActiveScene(null);

    if (!over || !storyboardScenes) return;

    const oldIndex = storyboardScenes.findIndex(scene => scene.id === active.id);
    const newIndex = storyboardScenes.findIndex(scene => scene.id === over.id);

    if (oldIndex === newIndex) return;

    // Reorder the scenes array
    const reorderedScenes = arrayMove(storyboardScenes, oldIndex, newIndex);

    // Update the store and local state
    useProjectStore.getState().reorderScenes(reorderedScenes);
    setStoryboardScenes(reorderedScenes);
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setOverId(null);
    setActiveScene(null);
  };

  const handleContinue = () => {
    // Navigate to brand identity page, preserving car extraction params
    const carBrand = searchParams.get('carBrand');
    const carModel = searchParams.get('carModel');
    const carYear = searchParams.get('carYear');
    const carConfidence = searchParams.get('carConfidence');

    const params = new URLSearchParams();
    if (carBrand) params.set('carBrand', carBrand);
    if (carModel) params.set('carModel', carModel);
    if (carYear) params.set('carYear', carYear);
    if (carConfidence) params.set('carConfidence', carConfidence);

    const queryString = params.toString();
    router.push(`/brand-identity${queryString ? `?${queryString}` : ''}`);
  };

  return (
    <div className="min-h-screen flex flex-col cinematic-gradient relative overflow-hidden">

      {/* Top Left Logo */}
      <div className="fixed top-6 left-6 z-40">
        <h1 className="text-2xl font-light text-white tracking-tighter select-none whitespace-nowrap leading-none">
          Scen3
        </h1>
      </div>

      {/* Back Button */}
      <button
        onClick={() => router.push('/style')}
        className="fixed top-6 right-6 z-40 px-6 py-2 bg-white/10 text-white/80 rounded-lg hover:bg-white/20 border border-white/20 backdrop-blur-sm transition-all"
      >
        Back
      </button>

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 mt-20 mb-6">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <h2 className="text-4xl sm:text-5xl font-light text-white/90 tracking-tight mb-2">
            Your Story
          </h2>
          <p className="text-sm sm:text-base text-white/60">
            Create your core story idea and watch it transform into a 5-scene cinematic storyboard
          </p>
        </div>

        {/* Story Input Card */}
        <div className="rounded-3xl border border-white/20 bg-white/5 backdrop-blur-sm p-6 sm:p-8 mb-6 sm:mb-8">
          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-lg sm:text-xl font-medium text-white">
                What's the core idea?
              </h3>
              <p className="text-sm text-white/60">
                Who is this for, what are you selling, and what should viewers feel or do after watching?
              </p>
            </div>

            {/* Story Input - Structured Fields */}
            <div className="space-y-3">
              {/* Loading State for Idea Generation */}
              {isGeneratingIdea && (
                <div className="flex items-center gap-2 text-white/60 text-sm mb-2">
                  <Sparkles className="w-4 h-4 animate-pulse" />
                  <span>Crafting your story idea...</span>
                </div>
              )}

              {/* WHO Field */}
              <div className="grid grid-cols-[80px_1fr] gap-1 items-center">
                <label className="text-sm font-medium text-white/80">WHO</label>
                <input
                  type="text"
                  value={storyFields.who}
                  onChange={(e) => setStoryFields(prev => ({ ...prev, who: e.target.value }))}
                  className="w-full rounded-lg border border-white/20 bg-white/[0.02] px-3 py-1.5 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/40 focus:bg-white/[0.05] backdrop-blur-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="e.g., Ambitious professionals aged 30-50 who crave success and freedom"
                  disabled={isGeneratingStoryboard || isGeneratingIdea}
                />
              </div>

              {/* WHAT Field */}
              <div className="grid grid-cols-[80px_1fr] gap-1 items-center">
                <label className="text-sm font-medium text-white/80">WHAT</label>
                <input
                  type="text"
                  value={storyFields.what}
                  onChange={(e) => setStoryFields(prev => ({ ...prev, what: e.target.value }))}
                  className="w-full rounded-lg border border-white/20 bg-white/[0.02] px-3 py-1.5 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/40 focus:bg-white/[0.05] backdrop-blur-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="e.g., The Porsche 911 isn't just a car; it's a symbol of achievement"
                  disabled={isGeneratingStoryboard || isGeneratingIdea}
                />
              </div>

              {/* STORY IDEA Field */}
              <div className="grid grid-cols-[80px_1fr] gap-1 items-start">
                <label className="text-sm font-medium text-white/80 pt-1.5">STORY</label>
                <textarea
                  value={storyFields.storyIdea}
                  onChange={(e) => setStoryFields(prev => ({ ...prev, storyIdea: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-white/20 bg-white/[0.02] px-3 py-1.5 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/40 focus:bg-white/[0.05] backdrop-blur-sm transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="e.g., Open on a foggy morning, a solitary figure starts their Porsche. As they accelerate through winding roads..."
                  disabled={isGeneratingStoryboard || isGeneratingIdea}
                />
              </div>

              {/* FEEL/DO Field */}
              <div className="grid grid-cols-[80px_1fr] gap-1 items-center">
                <label className="text-sm font-medium text-white/80">FEEL/DO</label>
                <input
                  type="text"
                  value={storyFields.feelDo}
                  onChange={(e) => setStoryFields(prev => ({ ...prev, feelDo: e.target.value }))}
                  className="w-full rounded-lg border border-white/20 bg-white/[0.02] px-3 py-1.5 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/40 focus:bg-white/[0.05] backdrop-blur-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="e.g., Feel inspired to chase their dreams and take action"
                  disabled={isGeneratingStoryboard || isGeneratingIdea}
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleGenerateStoryboard}
                  disabled={isGeneratingStoryboard || !hasContent}
                  className="px-4 py-2 rounded-lg bg-white/20 text-white text-sm font-medium hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {isGeneratingStoryboard ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating Storyboard...
                    </>
                  ) : storyboardScenes ? (
                    'Regenerate Storyboard'
                  ) : (
                    'Generate Storyboard'
                  )}
                </button>

                {!storyboardScenes && (
                  <p className="text-xs text-white/40">
                    Generate a storyboard to see and edit your 5 scenes
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Storyboard Scenes */}
        {storyboardScenes && (
          <div className="rounded-3xl border border-white/20 bg-white/5 backdrop-blur-sm p-6 sm:p-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-white/80">Your Storyboard</h3>
                <span className="text-xs text-white/40">Drag scenes to reorder</span>
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                measuring={measuring}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
              >
                <SortableContext
                  items={storyboardScenes.map(scene => scene.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {orderedScenes?.map((scene, index) => (
                      <SceneCard
                        key={scene.id}
                        scene={scene}
                        index={index}
                        onUpdate={handleUpdateScene}
                        isEditing={editingSceneId === scene.id}
                        onEditToggle={setEditingSceneId}
                        onRegenerate={handleRegenerateScene}
                        isRegenerating={regeneratingSceneId === scene.id}
                      />
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay
                  dropAnimation={{
                    duration: 200,
                    easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
                  }}
                  style={{
                    cursor: 'grabbing',
                  }}
                >
                  {activeScene ? (
                    <div 
                      className="p-5 rounded-lg border-2 bg-white/10 border-white/30 shadow-xl backdrop-blur-md"
                    >
                      <div className="grid grid-cols-[auto_1fr_3fr_auto] gap-4 items-start">
                        <div className="flex flex-col items-center gap-2">
                          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-white/20 text-base font-semibold text-white/90 border border-white/30">
                            {activeScene.order + 1}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-base font-medium text-white leading-tight line-clamp-3">
                            {activeScene.description.charAt(0).toUpperCase() + activeScene.description.slice(1)}
                          </h3>
                          <div className="flex items-center gap-2 mt-2 text-sm text-white/40">
                            <span>{activeScene.suggestedDuration}s</span>
                          </div>
                        </div>
                        <div className="min-w-0">
                          {activeScene.imagePrompt && (
                            <p className="text-sm text-white/60 leading-relaxed line-clamp-4">
                              {activeScene.imagePrompt}
                            </p>
                          )}
                        </div>
                        {/* Empty div to maintain grid layout without the buttons */}
                        <div className="w-[34px]"></div>
                      </div>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          </div>
        )}

        {/* Continue Button */}
        {storyboardScenes && (
          <div className="flex items-center justify-center pt-8">
            <button
              onClick={handleContinue}
              className="group relative px-10 py-5 bg-white text-black rounded-full text-lg font-medium hover:bg-white/90 transition-all flex items-center gap-3 shadow-2xl shadow-white/20"
            >
              <span>Continue to Brand Identity</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Main page component with Suspense boundary
export default function YourStoryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col cinematic-gradient relative overflow-hidden">
        <div className="fixed top-6 left-6 z-40">
          <h1 className="text-2xl font-light text-white tracking-tighter select-none whitespace-nowrap leading-none">
            Scen3
          </h1>
        </div>
        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 mt-20 mb-6 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-white/60">Loading your story...</p>
          </div>
        </div>
      </div>
    }>
      <YourStoryContent />
    </Suspense>
  );
}
