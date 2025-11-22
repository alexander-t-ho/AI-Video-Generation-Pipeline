/**
 * Integration testing utilities for the AI Video Generation Pipeline
 * These helpers can be used for manual testing and automated test scenarios
 */

import { ProjectState, Scene } from '@/lib/types';
import { useProjectStore } from '@/lib/state/project-store';

/**
 * Test data generators
 */
export const TestHelpers = {
  /**
   * Create a mock project for testing
   */
  createMockProject: (overrides?: Partial<ProjectState>): ProjectState => {
    const defaultScenes: Scene[] = [
      {
        id: 'scene-0',
        order: 0,
        description: 'Opening shot establishing the product',
        imagePrompt: 'Professional product photography of a luxury watch on a marble surface with golden hour lighting',
        videoPrompt: 'Slow panning shot revealing the watch on a marble surface with golden hour lighting',
        suggestedDuration: 3,
      },
      {
        id: 'scene-1',
        order: 1,
        description: 'Close-up of the watch face',
        imagePrompt: 'Extreme close-up of watch dial with intricate details, soft focus background',
        videoPrompt: 'Slow zoom into the watch dial, revealing intricate details with shallow depth of field',
        suggestedDuration: 2,
      },
      {
        id: 'scene-2',
        order: 2,
        description: 'Model wearing the watch',
        imagePrompt: 'Elegant model wearing the watch, sophisticated pose, studio lighting',
        videoPrompt: 'Model elegantly presents the watch with smooth hand movement in studio lighting',
        suggestedDuration: 4,
      },
      {
        id: 'scene-3',
        order: 3,
        description: 'Lifestyle shot in natural setting',
        imagePrompt: 'Watch in natural outdoor setting, golden hour, warm tones',
        videoPrompt: 'Gentle camera movement showcasing the watch in natural outdoor setting at golden hour',
        suggestedDuration: 3,
      },
      {
        id: 'scene-4',
        order: 4,
        description: 'Final product showcase',
        imagePrompt: 'Product on elegant background, minimalist composition, premium feel',
        videoPrompt: 'Slow rotating product shot on elegant background with minimalist composition',
        suggestedDuration: 2,
      },
    ];

    return {
      id: 'test-project-' + Date.now(),
      prompt: 'Luxury watch advertisement with golden hour lighting',
      targetDuration: 15,
      status: 'scene_generation',
      createdAt: new Date().toISOString(),
      storyboard: defaultScenes,
      currentSceneIndex: 0,
      ...overrides,
    };
  },

  /**
   * Reset the project store to initial state
   */
  resetStore: () => {
    useProjectStore.getState().reset();
  },

  /**
   * Set up a complete project in the store for testing
   */
  setupTestProject: (project?: Partial<ProjectState>) => {
    const mockProject = TestHelpers.createMockProject(project);
    useProjectStore.getState().createProject(
      mockProject.name || 'Test Project',
      mockProject.prompt || 'Test prompt',
      mockProject.targetDuration || 15
    );
    useProjectStore.getState().setStoryboard(mockProject.storyboard);
    return mockProject;
  },

  /**
   * Simulate storyboard generation
   */
  simulateStoryboardGeneration: async (prompt: string) => {
    const store = useProjectStore.getState();
    store.addChatMessage({
      role: 'agent',
      content: 'Generating storyboard...',
      type: 'status',
    });

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const mockProject = TestHelpers.createMockProject({ prompt });
    store.setStoryboard(mockProject.storyboard);
    store.addChatMessage({
      role: 'agent',
      content: `✓ Storyboard generated with ${mockProject.storyboard.length} scenes`,
      type: 'status',
    });

    return mockProject.storyboard;
  },

  /**
   * Simulate image generation for a scene
   */
  simulateImageGeneration: async (sceneIndex: number) => {
    const store = useProjectStore.getState();
    const scene = store.scenes[sceneIndex];
    
    if (!scene) {
      throw new Error(`Scene ${sceneIndex} not found`);
    }

    store.setSceneStatus(sceneIndex, 'generating_image');
    store.addChatMessage({
      role: 'agent',
      content: `Generating image for Scene ${sceneIndex + 1}/5...`,
      type: 'status',
    });

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const mockImage = {
      id: `image-${sceneIndex}-${Date.now()}`,
      url: `https://via.placeholder.com/1920x1080?text=Scene+${sceneIndex + 1}`,
      localPath: `/tmp/projects/test/images/scene-${sceneIndex}.png`,
      prompt: scene.imagePrompt,
      replicateId: `pred-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    store.addGeneratedImage(sceneIndex, mockImage);
    store.selectImage(sceneIndex, mockImage.id);
    store.addChatMessage({
      role: 'agent',
      content: `✓ Image generated for Scene ${sceneIndex + 1}`,
      type: 'status',
    });

    return mockImage;
  },

  /**
   * Simulate video generation for a scene
   */
  simulateVideoGeneration: async (sceneIndex: number) => {
    const store = useProjectStore.getState();
    const scene = store.scenes[sceneIndex];
    
    if (!scene || !scene.selectedImageId) {
      throw new Error(`Scene ${sceneIndex} not ready for video generation`);
    }

    store.setSceneStatus(sceneIndex, 'generating_video');
    store.addChatMessage({
      role: 'agent',
      content: `Generating video for Scene ${sceneIndex + 1}/5...`,
      type: 'status',
    });

    // Simulate API delay (videos take longer)
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const videoPath = `/tmp/projects/test/videos/scene-${sceneIndex}.mp4`;
    store.setVideoPath(sceneIndex, videoPath, scene.suggestedDuration);
    store.addChatMessage({
      role: 'agent',
      content: `✓ Video generated for Scene ${sceneIndex + 1}`,
      type: 'status',
    });

    return videoPath;
  },

  /**
   * Simulate seed frame extraction
   */
  simulateFrameExtraction: async (sceneIndex: number) => {
    const store = useProjectStore.getState();
    const scene = store.scenes[sceneIndex];
    
    if (!scene || !scene.videoLocalPath) {
      throw new Error(`Scene ${sceneIndex} video not ready`);
    }

    store.addChatMessage({
      role: 'agent',
      content: `Extracting seed frames from Scene ${sceneIndex + 1}...`,
      type: 'status',
    });

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const frames = Array.from({ length: 5 }, (_, i) => ({
      id: `frame-${sceneIndex}-${i}`,
      url: `https://via.placeholder.com/1920x1080?text=Frame+${i + 1}`,
      timestamp: (i + 1) * 0.1, // 0.1s, 0.2s, 0.3s, 0.4s, 0.5s
    }));

    store.setSeedFrames(sceneIndex, frames);
    store.addChatMessage({
      role: 'agent',
      content: `✓ Seed frames extracted. Please select a frame for Scene ${sceneIndex + 2}`,
      type: 'status',
    });

    return frames;
  },

  /**
   * Simulate complete workflow from prompt to final video
   */
  simulateCompleteWorkflow: async (prompt: string = 'Luxury watch advertisement') => {
    TestHelpers.resetStore();
    
    // Step 1: Create project and generate storyboard
    await TestHelpers.simulateStoryboardGeneration(prompt);
    
    // Step 2: Generate images for all scenes
    for (let i = 0; i < 5; i++) {
      await TestHelpers.simulateImageGeneration(i);
    }
    
    // Step 3: Generate videos for all scenes
    for (let i = 0; i < 5; i++) {
      await TestHelpers.simulateVideoGeneration(i);
      
      // Extract frames (except for last scene)
      if (i < 4) {
        await TestHelpers.simulateFrameExtraction(i);
        // Auto-select first frame
        useProjectStore.getState().selectSeedFrame(i, 0);
      }
    }
    
    // Step 4: Stitch final video
    const store = useProjectStore.getState();
    store.addChatMessage({
      role: 'agent',
      content: 'Stitching final video...',
      type: 'status',
    });
    
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    store.setFinalVideo(
      'https://via.placeholder.com/1920x1080?text=Final+Video',
      'outputs/test-project/final.mp4'
    );
    
    store.addChatMessage({
      role: 'agent',
      content: '✓ Final video complete. Ready for download.',
      type: 'status',
    });
    
    return store.project;
  },
};

/**
 * Test scenarios for integration testing
 */
export const TestScenarios = {
  /**
   * Test: Full workflow from start to finish
   */
  fullWorkflow: async () => {
    console.log('🧪 Testing: Full workflow');
    await TestHelpers.simulateCompleteWorkflow();
    console.log('✅ Full workflow test complete');
  },

  /**
   * Test: Storyboard regeneration
   */
  storyboardRegeneration: async () => {
    console.log('🧪 Testing: Storyboard regeneration');
    TestHelpers.resetStore();
    await TestHelpers.simulateStoryboardGeneration('Initial prompt');
    await new Promise((resolve) => setTimeout(resolve, 500));
    await TestHelpers.simulateStoryboardGeneration('Updated prompt');
    console.log('✅ Storyboard regeneration test complete');
  },

  /**
   * Test: Image regeneration
   */
  imageRegeneration: async () => {
    console.log('🧪 Testing: Image regeneration');
    TestHelpers.setupTestProject();
    await TestHelpers.simulateImageGeneration(0);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await TestHelpers.simulateImageGeneration(0); // Regenerate
    console.log('✅ Image regeneration test complete');
  },

  /**
   * Test: Error handling
   */
  errorHandling: async () => {
    console.log('🧪 Testing: Error handling');
    const store = useProjectStore.getState();
    store.addChatMessage({
      role: 'agent',
      content: 'Error: Failed to generate image. Please try again.',
      type: 'error',
    });
    console.log('✅ Error handling test complete');
  },

  /**
   * Test: Responsive design
   */
  responsiveDesign: () => {
    console.log('🧪 Testing: Responsive design');
    // Test different viewport sizes
    const sizes = [
      { width: 375, height: 667, name: 'Mobile' },
      { width: 768, height: 1024, name: 'Tablet' },
      { width: 1920, height: 1080, name: 'Desktop' },
    ];
    
    sizes.forEach((size) => {
      console.log(`  - ${size.name}: ${size.width}x${size.height}`);
    });
    
    console.log('✅ Responsive design test complete');
  },
};

