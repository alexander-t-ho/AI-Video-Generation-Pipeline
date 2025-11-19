'use client';

import { useState, useEffect, useRef, useLayoutEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import SceneCard from '@/components/wizard/SceneCard';
import { DndContext, closestCenter, DragEndEvent, DragStartEvent, DragOverEvent, PointerSensor, MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, DragOverlay, MeasuringStrategy } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Scene } from '@/lib/types';
import { useProjectStore } from '@/lib/state/project-store';
import { createProject } from '@/lib/api-client';
import { Loader2, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';

// Wrapper component that uses useSearchParams
function YourStoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { project } = useProjectStore();

  // Storyboard editor state
  const [idea, setIdea] = useState('');
  const [storyboardScenes, setStoryboardScenes] = useState<Scene[] | null>(null);
  const [isGeneratingStoryboard, setIsGeneratingStoryboard] = useState(false);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [isGeneratingIdea, setIsGeneratingIdea] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [activeScene, setActiveScene] = useState<Scene | null>(null);
  const [regeneratingSceneId, setRegeneratingSceneId] = useState<string | null>(null);
  const ideaTextareaRef = useRef<HTMLTextAreaElement>(null);

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

  // Auto-resize textarea to fit content (minimum 4 lines)
  const adjustTextareaHeight = () => {
    if (ideaTextareaRef.current) {
      ideaTextareaRef.current.style.height = 'auto';
      const scrollHeight = ideaTextareaRef.current.scrollHeight;
      // Calculate minimum height for 4 lines (line-height ~1.5rem for text-sm, plus padding)
      const minHeight = 4 * 1.5 * 16 + 16; // 4 lines * 1.5rem * 16px + padding (1rem = 16px)
      ideaTextareaRef.current.style.height = `${Math.max(scrollHeight, minHeight)}px`;
    }
  };

  // Auto-resize when idea changes (useLayoutEffect for synchronous DOM updates)
  useLayoutEffect(() => {
    adjustTextareaHeight();
  }, [idea]);

  // Load existing storyboard from project store on mount
  useEffect(() => {
    if (project?.storyboard && project.storyboard.length > 0) {
      setStoryboardScenes(project.storyboard);
      // If there's a project prompt, try to extract the idea from it
      if (project.prompt && !idea) {
        // Try to extract the original idea from the prompt
        const ideaMatch = project.prompt.match(/Original idea:\s*(.+?)(?:\n|$)/);
        if (ideaMatch) {
          setIdea(ideaMatch[1].trim());
        }
      }
    }
  }, []); // Only run on mount

  // Auto-generate story idea on mount
  useEffect(() => {
    const initialPrompt = searchParams.get('prompt');
    if (initialPrompt && !idea) {
      generateStoryIdea(initialPrompt);
    }
  }, [searchParams]); // Only run when searchParams changes

  // Auto-generate storyboard when story idea is ready
  useEffect(() => {
    // Only auto-generate if:
    // 1. We have an idea
    // 2. We don't already have a storyboard
    // 3. We're not currently generating anything
    if (idea && !storyboardScenes && !isGeneratingStoryboard && !isGeneratingIdea) {
      // Small delay to ensure state is settled
      const timer = setTimeout(() => {
        handleGenerateStoryboard();
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [idea, storyboardScenes, isGeneratingStoryboard, isGeneratingIdea]);

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
        setIdea(data.idea);
      }
    } catch (error) {
      console.error('Failed to generate story idea:', error);
      // Fallback: use the initial prompt as-is
      setIdea(initialPrompt);
    } finally {
      setIsGeneratingIdea(false);
    }
  };

  const buildPrompt = () => {
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
      `Visual style: ${styleLine}${true ? ' (assume this is shot on Arri Alexa by default).' : '.'}`
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
    if (isGeneratingStoryboard || !idea.trim()) return;

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
          idea: idea.trim(),
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
          Scene3
        </h1>
      </div>

      {/* Back Button */}
      <button
        onClick={() => router.push('/')}
        className="fixed top-6 right-6 z-40 px-6 py-2 bg-white/10 text-white/80 rounded-lg hover:bg-white/20 border border-white/20 backdrop-blur-sm transition-all"
      >
        Back
      </button>

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 mt-20 mb-6">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <h2 className="text-3xl sm:text-4xl font-light text-white/90 tracking-tight mb-2">
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
                Write it messy. Who is this for, what are you selling, and what should viewers feel or do after
                watching?
              </p>
            </div>

            {/* Story Input */}
            <div className="space-y-3">
              {/* Loading State for Idea Generation */}
              {isGeneratingIdea && (
                <div className="flex items-center gap-2 text-white/60 text-sm mb-2">
                  <Sparkles className="w-4 h-4 animate-pulse" />
                  <span>Crafting your story idea...</span>
                </div>
              )}

              <textarea
                ref={ideaTextareaRef}
                value={idea}
                onChange={(e) => {
                  setIdea(e.target.value);
                  adjustTextareaHeight();
                }}
                onInput={adjustTextareaHeight}
                rows={4}
                className="w-full rounded-lg border border-white/20 bg-white/[0.02] px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/40 focus:bg-white/[0.05] backdrop-blur-sm transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                placeholder="E.g., A high-energy launch film for a new electric sports car that feels cinematic and aspirational, ending on a bold brand line."
                disabled={isGeneratingStoryboard || isGeneratingIdea}
              />

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleGenerateStoryboard}
                  disabled={isGeneratingStoryboard || !idea.trim()}
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
            Scene3
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
