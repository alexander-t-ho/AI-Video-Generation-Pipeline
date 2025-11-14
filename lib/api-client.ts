/**
 * API client for making requests to backend endpoints
 */

import { StoryboardRequest, StoryboardResponse } from '@/lib/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Generate a storyboard from a prompt
 */
export async function generateStoryboard(
  prompt: string,
  targetDuration: number = 15
): Promise<StoryboardResponse> {
  const response = await fetch(`${API_BASE_URL}/api/storyboard`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      targetDuration,
    } as StoryboardRequest),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to generate storyboard');
  }

  return response.json();
}

/**
 * Create a new project
 */
export async function createProject(
  prompt: string,
  targetDuration: number = 15
): Promise<{ projectId: string; storyboard: StoryboardResponse }> {
  const storyboard = await generateStoryboard(prompt, targetDuration);
  
  if (!storyboard.success || !storyboard.scenes) {
    throw new Error(storyboard.error || 'Failed to generate storyboard');
  }

  // Project ID will be generated on the client side
  return {
    projectId: '', // Will be set by the store
    storyboard,
  };
}

