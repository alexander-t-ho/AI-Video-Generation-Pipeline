/**
 * Storyboard Generator - OpenRouter Integration
 * 
 * This module handles storyboard generation using OpenAI GPT-4o via OpenRouter API.
 * Generates exactly 5 scenes with descriptions, image prompts, and durations.
 */

import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { Scene, StoryboardResponse } from '../types';

// ============================================================================
// Constants
// ============================================================================

// Support both OpenAI direct and OpenRouter
const USE_OPENAI_DIRECT = !!process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const API_URL = USE_OPENAI_DIRECT ? OPENAI_API_URL : OPENROUTER_API_URL;
// Try gpt-4o-mini first as fallback if gpt-4o is not available
let OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

/**
 * Sets the runtime model override for text/storyboard generation
 * This allows the dev panel to dynamically change the model
 */
export function setRuntimeTextModel(model: string) {
  OPENROUTER_MODEL = model;
  console.log(`[Storyboard Generator] Runtime model set to: ${model}`);
}

/**
 * System prompt for storyboard generation
 * From PRD Appendix: Prompt Templates
 *
 * Updated to enforce SHORT, concise scene descriptions for advertising, with a default
 * bias toward product and automotive work and an Arri Alexa commercial look.
 */
const STORYBOARD_SYSTEM_PROMPT = `You are a professional video storyboard creator specializing in performance-focused advertising,
with particular strength in product and automotive commercials.

Given a short creative brief for a video advertisement, create exactly 3 scenes.

For each scene:
- Duration: 10 seconds
- Clear visual focus and logical progression from the previous scene
- Keep the scene description SHORT and CONCISE - 3-6 words maximum
- Provide a detailed imagePrompt for visual generation

Scene description examples:
"driver close-up", "wide car approach", "interior cockpit"

Unless the brief clearly specifies otherwise, assume:
- The spot is shot on Arri Alexa with a high-end commercial finish
- The goal is to showcase the product or vehicle in a bold, cinematic way

Output strictly valid JSON in this format:
{
  "scenes": [
    {
      "order": 0,
      "description": "Short 3-6 word phrase describing the scene",
      "imagePrompt": "Detailed prompt for image generation including shot type, subject, action, style, lighting, composition.",
      "duration": 10
    },
    ...
  ]
}

Keep image prompts specific, visual, and production-ready.`;

// ============================================================================
// Types
// ============================================================================

interface OpenRouterRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user';
    content: string | Array<{
      type: 'text' | 'image_url';
      text?: string;
      image_url?: {
        url: string;
      };
    }>;
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
 * @param referenceImageUrls Optional array of reference image URLs
 * @returns Raw JSON response from OpenRouter
 */
async function callOpenRouterAPI(
  prompt: string,
  targetDuration: number = 15,
  referenceImageUrls?: string[]
): Promise<OpenRouterResponse> {
  const apiKey = USE_OPENAI_DIRECT ? process.env.OPENAI_API_KEY : process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(USE_OPENAI_DIRECT
      ? 'OPENAI_API_KEY environment variable is not set'
      : 'OPENROUTER_API_KEY environment variable is not set');
  }

  console.log(`[Storyboard] Using ${USE_OPENAI_DIRECT ? 'OpenAI Direct' : 'OpenRouter'} API`);

  const userPrompt = `You are creating a performance-focused advertising storyboard (with strong support for product and automotive spots) for a ${targetDuration}-second video ad.

Creative brief from the user:
${prompt}

Use the structure [SHOT TYPE] + [SUBJECT] + [ACTION] + [STYLE] + [CAMERA MOVEMENT] + [AUDIO CUES] for each of the 5 scene descriptions.

Ensure the total duration of all scenes equals ${targetDuration} seconds (±2 seconds tolerance).`;

  // Build user message content
  // If reference images are provided, include them in the message
  const userMessageContent: any[] = [];
  
  // Add text prompt
  userMessageContent.push({
    type: 'text',
    text: userPrompt + (referenceImageUrls && referenceImageUrls.length > 0 
      ? `\n\nReference images have been provided. Use them to understand the visual style, color palette, composition, and overall aesthetic. Incorporate these visual elements into the storyboard scenes.`
      : ''),
  });

  // Add reference images if provided
  if (referenceImageUrls && referenceImageUrls.length > 0) {
    for (const imageUrl of referenceImageUrls) {
      // OpenRouter needs publicly accessible URLs or base64 data URLs
      // We need to convert both local paths AND S3 URLs to base64 because:
      // 1. S3 URLs may not be publicly accessible (403 errors)
      // 2. Local paths need to be read from filesystem
      let imageUrlForAPI = imageUrl;
      
      // Check if it's a local file path OR an S3 URL
      if (imageUrl.startsWith('/tmp') || imageUrl.startsWith('./') || !imageUrl.startsWith('http')) {
        // Local paths: read directly from filesystem
        try {
          const imageBuffer = fs.readFileSync(imageUrl);
          const base64Image = imageBuffer.toString('base64');
          const mimeType = imageUrl.endsWith('.png') ? 'image/png' : 'image/jpeg';
          imageUrlForAPI = `data:${mimeType};base64,${base64Image}`;
          console.log(`[Storyboard] Converted local path to base64: ${imageUrl.substring(0, 50)}...`);
        } catch (error) {
          console.warn(`[Storyboard] Failed to read local image ${imageUrl}, skipping:`, error);
          continue; // Skip this image if we can't read it
        }
      } else if (imageUrl.includes('s3.amazonaws.com') || imageUrl.includes('s3.')) {
        // S3 URLs: download and convert to base64 to avoid 403 errors
        try {
          console.log(`[Storyboard] Downloading S3 image for base64 conversion: ${imageUrl.substring(0, 50)}...`);
          const response = await fetch(imageUrl);
          if (!response.ok) {
            console.warn(`[Storyboard] Failed to download S3 image (${response.status}), skipping: ${imageUrl}`);
            continue;
          }
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const base64Image = buffer.toString('base64');
          const mimeType = imageUrl.endsWith('.png') ? 'image/png' : 'image/jpeg';
          imageUrlForAPI = `data:${mimeType};base64,${base64Image}`;
          console.log(`[Storyboard] Successfully converted S3 image to base64`);
        } catch (error) {
          console.warn(`[Storyboard] Failed to download S3 image ${imageUrl}, skipping:`, error);
          continue;
        }
      }
      // Otherwise, use the URL as-is (for publicly accessible URLs)
      
      userMessageContent.push({
        type: 'image_url',
        image_url: {
          url: imageUrlForAPI,
        },
      });
    }
  }

  const modelToUse = USE_OPENAI_DIRECT ? OPENAI_MODEL : OPENROUTER_MODEL;
  const requestBody: OpenRouterRequest = {
    model: modelToUse,
    messages: [
      {
        role: 'system',
        content: STORYBOARD_SYSTEM_PROMPT + '\n\nIMPORTANT: You must respond with valid JSON only. Do not include any text before or after the JSON object.',
      },
      {
        role: 'user',
        content: userMessageContent.length === 1 && userMessageContent[0].type === 'text'
          ? userMessageContent[0].text
          : userMessageContent, // Use array format for multimodal content
      },
    ],
    response_format: {
      type: 'json_object',
    },
  };

  // Log request details for debugging (without sensitive data)
  console.log('[Storyboard] Making request:', {
    url: API_URL,
    model: modelToUse,
    provider: USE_OPENAI_DIRECT ? 'OpenAI' : 'OpenRouter',
    hasApiKey: !!apiKey,
    apiKeyPrefix: apiKey.substring(0, 10) + '...',
    messageCount: requestBody.messages.length,
    hasResponseFormat: !!requestBody.response_format,
  });

  // Build headers - OpenRouter needs extra headers, OpenAI just needs auth
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (!USE_OPENAI_DIRECT) {
    headers['HTTP-Referer'] = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    headers['X-Title'] = 'AI Video Generation Pipeline';
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers,
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

  // Take first 3 scenes (LLM might return more)
  if (rawResponse.scenes.length < 3) {
    throw new Error(
      `Invalid response: expected at least 3 scenes, got ${rawResponse.scenes.length}`
    );
  }
  // Truncate to 3 scenes if more were returned
  rawResponse.scenes = rawResponse.scenes.slice(0, 3);

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
      throw new Error(`Scene ${index}: invalid duration (must be 1-10 seconds)`);
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
      order: index,
      description: scene.description.trim(),
      imagePrompt: scene.imagePrompt.trim(),
      suggestedDuration: scene.duration,
    };
  });

  // Log total duration (don't enforce strict validation since LLM output varies)
  const totalDuration = validatedScenes.reduce(
    (sum, scene) => sum + scene.suggestedDuration,
    0
  );
  console.log(`[Storyboard] Generated ${validatedScenes.length} scenes, total duration: ${totalDuration}s (target: ${targetDuration}s)`);

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
 * @param referenceImageUrls Optional array of reference image URLs for visual context
 * @returns Array of 5 validated scenes with UUIDs
 */
export async function generateStoryboard(
  prompt: string,
  targetDuration: number = 15,
  referenceImageUrls?: string[]
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
    const apiResponse = await callOpenRouterAPI(prompt, targetDuration, referenceImageUrls);

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

  if (errorMessage.includes('authentication') || errorMessage.includes('api key') || errorMessage.includes('user not found') || errorMessage.includes('status: 401')) {
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
