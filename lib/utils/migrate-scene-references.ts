/**
 * One-time migration utility to clear old scene references and trigger AI re-analysis
 * This ensures each scene gets AI-selected references based on its specific prompt
 */

import { ProjectState, Scene } from '@/lib/types';

export function shouldMigrateSceneReferences(project: ProjectState | null): boolean {
  if (!project || !project.storyboard || project.storyboard.length === 0) {
    return false;
  }

  // Check if any scene has referenceImageUrls that match the global ones
  // This indicates they were copied from the global array and need AI re-analysis
  const globalRefs = project.referenceImageUrls || [];

  // If there are no global refs, no migration needed
  if (globalRefs.length === 0) {
    return false;
  }

  // Check if any scene has the exact same references as global (indicating they were copied)
  const hasIdenticalRefs = project.storyboard.some(scene => {
    if (!scene.referenceImageUrls || scene.referenceImageUrls.length === 0) {
      return false;
    }
    // Check if scene refs are identical to global refs
    return JSON.stringify(scene.referenceImageUrls) === JSON.stringify(globalRefs);
  });

  return hasIdenticalRefs;
}

export function clearSceneReferencesForMigration(scenes: Scene[]): Scene[] {
  console.log('[Migration] Clearing scene-specific references to trigger AI re-analysis');

  return scenes.map(scene => ({
    ...scene,
    referenceImageUrls: undefined, // Clear to trigger AI analysis
  }));
}
