/**
 * Storyboard Generator - OpenRouter Integration
 * 
 * This module handles storyboard generation using OpenAI GPT-4o via OpenRouter API.
 * Generates exactly 5 scenes with descriptions, image prompts, and durations.
 */

import { v4 as uuidv4 } from 'uuid';
import { Scene, StoryboardResponse } from '../types';

// ============================================================================
// Constants
// ============================================================================

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'openai/gpt-4o';
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

/**
 * System prompt for storyboard generation
 * From PRD Appendix: Prompt Templates
 */
const STORYBOARD_SYSTEM_PROMPT = `You are a professional video storyboard creator specializing in advertising content.

Given a product description and ad goal, create exactly 5 scenes that tell a compelling visual story.

Each scene should:
- Be 2-4 seconds long
- Have a clear visual focus
- Connect logically to the next scene
- Include detailed image generation prompts

Output format:
{
  "scenes": [
    {
      "order": 0,
      "description": "Brief narrative description",
      "imagePrompt": "Detailed prompt for image generation with style, lighting, composition",
      "duration": 3
    },
    ...
  ]
}

Keep prompts visual and specific. Avoid abstract concepts.`;

// ============================================================================
// Types
// ============================================================================

interface OpenRouterRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user';
    content: string;
  }>;
  response_format: {
    type: 'json_object';
  };
}

interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  error?: {
    message: string;
    type: string;
    code?: string;
  };
}

interface RawStoryboardResponse {
  scenes: Array<{
    order: number;
    description: string;
    imagePrompt: string;
    duration: number;
  }>;
}

// ============================================================================
// OpenRouter API Client
// ============================================================================

/**
 * Calls OpenRouter API to generate storyboard
 * @param prompt User's product/ad description
 * @param targetDuration Target video duration in seconds (default: 15)
 * @returns Raw JSON response from OpenRouter
 */
async function callOpenRouterAPI(
  prompt: string,
  targetDuration: number = 15
): Promise<OpenRouterResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set');
  }

  // Validate API key format
  if (!apiKey.startsWith('sk-or-v1-') && !apiKey.startsWith('sk-')) {
    console.warn('[OpenRouter] API key format may be invalid. Expected format: sk-or-v1-... or sk-...');
  }

  const userPrompt = `Create exactly 5 scenes for a ${targetDuration}-second video advertisement: ${prompt}

Ensure the total duration of all scenes equals ${targetDuration} seconds (±2 seconds tolerance).`;

  const requestBody: OpenRouterRequest = {
    model: OPENROUTER_MODEL,
    messages: [
      {
        role: 'system',
        content: STORYBOARD_SYSTEM_PROMPT + '\n\nIMPORTANT: You must respond with valid JSON only. Do not include any text before or after the JSON object.',
      },
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    response_format: {
      type: 'json_object',
    },
  };

  // Log request details for debugging (without sensitive data)
  console.log('[OpenRouter] Making request:', {
    url: OPENROUTER_API_URL,
    model: OPENROUTER_MODEL,
    hasApiKey: !!apiKey,
    apiKeyPrefix: apiKey.substring(0, 10) + '...',
    messageCount: requestBody.messages.length,
    hasResponseFormat: !!requestBody.response_format,
  });

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'AI Video Generation Pipeline',
    },
    body: JSON.stringify(requestBody),
  });

  console.log('[OpenRouter] Response status:', response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `OpenRouter API error: ${response.status} ${response.statusText}`;
    let errorDetails: any = null;
    
    // Try to parse error response
    try {
      const errorData = JSON.parse(errorText);
      errorDetails = errorData;
      
      // Extract error message from various possible formats
      if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      } else if (errorData.message) {
        errorMessage = errorData.message;
      } else if (typeof errorData === 'string') {
        errorMessage = errorData;
      }
      
      // Log full error for debugging
      console.error('[OpenRouter] Full error response:', JSON.stringify(errorData, null, 2));
      
      // Check for rate limiting
      if (response.status === 429) {
        throw new Error(`Rate limit exceeded: ${errorMessage}`);
      }
      
      // Check for authentication errors
      if (response.status === 401 || response.status === 403) {
        throw new Error(`Authentication failed: ${errorMessage}. Please check your OPENROUTER_API_KEY.`);
      }
    } catch (parseError) {
      // If parsing fails, log the raw error text
      console.error('[OpenRouter] Raw error response:', errorText);
    }
    
    // Include status code in error message
    throw new Error(`${errorMessage} (Status: ${response.status})`);
  }

  const data: OpenRouterResponse = await response.json();

  // Check for API-level errors
  if (data.error) {
    throw new Error(`OpenRouter API error: ${data.error.message}`);
  }

  if (!data.choices || data.choices.length === 0) {
    throw new Error('OpenRouter API returned no choices');
  }

  return data;
}

// ============================================================================
// Response Validation
// ============================================================================

/**
 * Validates the storyboard response structure
 * @param rawResponse Raw JSON response from OpenRouter
 * @param targetDuration Target video duration for validation
 * @returns Validated scenes with UUIDs
 */
function validateStoryboardResponse(
  rawResponse: RawStoryboardResponse,
  targetDuration: number
): Scene[] {
  // Check if scenes array exists
  if (!rawResponse.scenes || !Array.isArray(rawResponse.scenes)) {
    throw new Error('Invalid response: missing or invalid scenes array');
  }

  // Check for exactly 5 scenes
  if (rawResponse.scenes.length !== 5) {
    throw new Error(
      `Invalid response: expected exactly 5 scenes, got ${rawResponse.scenes.length}`
    );
  }

  // Validate each scene
  const validatedScenes: Scene[] = rawResponse.scenes.map((scene, index) => {
    // Validate required fields
    if (typeof scene.order !== 'number') {
      throw new Error(`Scene ${index}: missing or invalid order field`);
    }
    if (typeof scene.description !== 'string' || scene.description.trim() === '') {
      throw new Error(`Scene ${index}: missing or invalid description field`);
    }
    if (typeof scene.imagePrompt !== 'string' || scene.imagePrompt.trim() === '') {
      throw new Error(`Scene ${index}: missing or invalid imagePrompt field`);
    }
    if (typeof scene.duration !== 'number' || scene.duration < 1 || scene.duration > 10) {
      throw new Error(`Scene ${index}: missing or invalid duration field (must be 1-10 seconds)`);
    }

    // Validate order matches index
    if (scene.order !== index) {
      console.warn(
        `Scene ${index}: order field (${scene.order}) doesn't match index, correcting to ${index}`
      );
    }

    // Generate UUID for scene
    return {
      id: uuidv4(),
      order: index, // Use index to ensure correct ordering
      description: scene.description.trim(),
      imagePrompt: scene.imagePrompt.trim(),
      suggestedDuration: scene.duration,
    };
  });

  // Validate total duration (±2 seconds tolerance)
  const totalDuration = validatedScenes.reduce(
    (sum, scene) => sum + scene.suggestedDuration,
    0
  );
  const durationDiff = Math.abs(totalDuration - targetDuration);

  if (durationDiff > 2) {
    throw new Error(
      `Total duration (${totalDuration}s) doesn't match target duration (${targetDuration}s). Difference: ${durationDiff}s (max tolerance: 2s)`
    );
  }

  return validatedScenes;
}

// ============================================================================
// Retry Logic
// ============================================================================

/**
 * Retries a function with exponential backoff
 * @param fn Function to retry
 * @param maxRetries Maximum number of retries
 * @param initialDelay Initial delay in milliseconds
 * @returns Result of the function
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  initialDelay: number = INITIAL_RETRY_DELAY
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on validation errors (these won't be fixed by retrying)
      if (error instanceof Error && error.message.includes('Invalid response')) {
        throw error;
      }

      // Don't retry on rate limit errors (wait longer)
      if (error instanceof Error && error.message.includes('Rate limit')) {
        if (attempt < maxRetries - 1) {
          const delay = initialDelay * Math.pow(2, attempt) * 10; // Longer delay for rate limits
          console.log(`Rate limit hit, waiting ${delay}ms before retry ${attempt + 1}/${maxRetries}`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }

      // Retry with exponential backoff
      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

// ============================================================================
// Main Storyboard Generation Function
// ============================================================================

/**
 * Generates a 5-scene storyboard from a user prompt
 * @param prompt User's product/ad description
 * @param targetDuration Target video duration in seconds (default: 15)
 * @returns Array of 5 validated scenes with UUIDs
 */
export async function generateStoryboard(
  prompt: string,
  targetDuration: number = 15
): Promise<Scene[]> {
  // Validate inputs
  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    throw new Error('Prompt is required and must be a non-empty string');
  }

  if (typeof targetDuration !== 'number' || targetDuration < 10 || targetDuration > 60) {
    throw new Error('Target duration must be a number between 10 and 60 seconds');
  }

  const logPrefix = '[Storyboard]';
  console.log(`${logPrefix} ========================================`);
  console.log(`${logPrefix} Starting storyboard generation`);
  console.log(`${logPrefix} Prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);
  console.log(`${logPrefix} Target duration: ${targetDuration}s`);
  console.log(`${logPrefix} Timestamp: ${new Date().toISOString()}`);

  // Retry logic with exponential backoff
  const scenes = await retryWithBackoff(async () => {
    // Call OpenRouter API
    const apiResponse = await callOpenRouterAPI(prompt, targetDuration);

    // Extract JSON content from response
    const content = apiResponse.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenRouter API returned empty content');
    }

    // Parse JSON response
    let rawResponse: RawStoryboardResponse;
    try {
      rawResponse = JSON.parse(content);
    } catch (parseError) {
      throw new Error(`Failed to parse JSON response: ${parseError}`);
    }

    // Validate and transform response
    const validatedScenes = validateStoryboardResponse(rawResponse, targetDuration);

    const logPrefix = '[Storyboard]';
    console.log(`${logPrefix} Successfully generated ${validatedScenes.length} scenes`);
    const totalDuration = validatedScenes.reduce((sum, s) => sum + s.suggestedDuration, 0);
    console.log(`${logPrefix} Total duration: ${totalDuration}s`);
    console.log(`${logPrefix} Scene breakdown:`);
    validatedScenes.forEach((scene, idx) => {
      console.log(`  ${logPrefix} Scene ${idx}: ${scene.suggestedDuration}s - "${scene.description.substring(0, 50)}${scene.description.length > 50 ? '...' : ''}"`);
    });
    console.log(`${logPrefix} ========================================`);

    return validatedScenes;
  });

  return scenes;
}

// ============================================================================
// Error Handling Helpers
// ============================================================================

/**
 * Determines if an error is retryable
 * @param error Error object
 * @returns True if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorMessage = error.message.toLowerCase();

  // Retryable errors
  const retryablePatterns = [
    'rate limit',
    'timeout',
    'network',
    'connection',
    'temporary',
    'service unavailable',
    'internal server error',
  ];

  // Non-retryable errors
  const nonRetryablePatterns = [
    'invalid response',
    'missing or invalid',
    'environment variable',
    'authentication',
    'unauthorized',
  ];

  // Check for non-retryable first
  if (nonRetryablePatterns.some((pattern) => errorMessage.includes(pattern))) {
    return false;
  }

  // Check for retryable
  return retryablePatterns.some((pattern) => errorMessage.includes(pattern));
}

/**
 * Creates a user-friendly error message from technical error
 * @param error Error object
 * @returns User-friendly error message
 */
function getUserFriendlyErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'An unexpected error occurred. Please try again.';
  }

  const errorMessage = error.message.toLowerCase();

  // User-friendly error messages
  if (errorMessage.includes('rate limit')) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  if (errorMessage.includes('authentication') || errorMessage.includes('api key')) {
    return 'API authentication failed. Please contact support.';
  }

  if (errorMessage.includes('network') || errorMessage.includes('connection') || errorMessage.includes('timeout')) {
    return 'Network error. Please check your connection and try again.';
  }

  if (errorMessage.includes('invalid response') || errorMessage.includes('missing or invalid')) {
    return 'The storyboard format was invalid. Please try again with a different prompt.';
  }

  if (errorMessage.includes('required') || errorMessage.includes('invalid')) {
    return 'Invalid request. Please check your input and try again.';
  }

  // Default: return original message but make it more user-friendly
  return error.message || 'Failed to generate storyboard. Please try again.';
}

/**
 * Determines the error code from an error
 * @param error Error object
 * @returns Error code
 */
function getErrorCode(error: unknown): 'INVALID_REQUEST' | 'GENERATION_FAILED' | 'RATE_LIMIT' | 'AUTHENTICATION_FAILED' | 'NETWORK_ERROR' | 'VALIDATION_ERROR' {
  if (!(error instanceof Error)) {
    return 'GENERATION_FAILED';
  }

  const errorMessage = error.message.toLowerCase();

  if (errorMessage.includes('rate limit')) {
    return 'RATE_LIMIT';
  }

  if (errorMessage.includes('authentication') || errorMessage.includes('api key')) {
    return 'AUTHENTICATION_FAILED';
  }

  if (errorMessage.includes('network') || errorMessage.includes('connection') || errorMessage.includes('timeout')) {
    return 'NETWORK_ERROR';
  }

  if (errorMessage.includes('invalid response') || errorMessage.includes('missing or invalid')) {
    return 'VALIDATION_ERROR';
  }

  if (errorMessage.includes('required') || errorMessage.includes('invalid')) {
    return 'INVALID_REQUEST';
  }

  return 'GENERATION_FAILED';
}

/**
 * Creates a standardized error response
 * @param error Error object
 * @returns StoryboardResponse with error details
 */
export function createErrorResponse(error: unknown): StoryboardResponse {
  const userFriendlyMessage = getUserFriendlyErrorMessage(error);
  const retryable = isRetryableError(error);
  const code = getErrorCode(error);

  return {
    success: false,
    error: userFriendlyMessage,
    code,
    retryable,
  };
}

