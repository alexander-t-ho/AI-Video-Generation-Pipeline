// lib/store.ts
// Zustand store for managing project state

import { create } from 'zustand';
import { ProjectState, Scene } from './types';

interface ProjectStore {
  // Current project
  project: ProjectState | null;
  
  // Actions
  createProject: (prompt: string, targetDuration: number) => void;
  setStoryboard: (scenes: Scene[]) => void;
  updateScene: (sceneIndex: number, updates: Partial<Scene>) => void;
  setCurrentScene: (sceneIndex: number) => void;
  setFinalVideo: (url: string, s3Key: string) => void;
  resetProject: () => void;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: null,

  // Create a new project
  createProject: (prompt: string, targetDuration: number) => {
    const projectId = `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const newProject: ProjectState = {
      id: projectId,
      prompt,
      targetDuration,
      status: 'storyboard',
      createdAt: new Date().toISOString(),
      storyboard: [],
      currentSceneIndex: 0,
    };

    set({ project: newProject });
  },

  // Set the storyboard (5 scenes)
  setStoryboard: (scenes: Scene[]) => {
    const project = get().project;
    if (!project) return;

    set({
      project: {
        ...project,
        storyboard: scenes,
        status: 'scene_generation',
      },
    });
  },

  // Update a specific scene
  updateScene: (sceneIndex: number, updates: Partial<Scene>) => {
    const project = get().project;
    if (!project) return;

    const updatedStoryboard = [...project.storyboard];
    updatedStoryboard[sceneIndex] = {
      ...updatedStoryboard[sceneIndex],
      ...updates,
    };

    set({
      project: {
        ...project,
        storyboard: updatedStoryboard,
      },
    });
  },

  // Set current scene being worked on
  setCurrentScene: (sceneIndex: number) => {
    const project = get().project;
    if (!project) return;

    set({
      project: {
        ...project,
        currentSceneIndex: sceneIndex,
      },
    });
  },

  // Set final video
  setFinalVideo: (url: string, s3Key: string) => {
    const project = get().project;
    if (!project) return;

    set({
      project: {
        ...project,
        finalVideoUrl: url,
        finalVideoS3Key: s3Key,
        status: 'completed',
      },
    });
  },

  // Reset project (start over)
  resetProject: () => {
    set({ project: null });
  },
}));
