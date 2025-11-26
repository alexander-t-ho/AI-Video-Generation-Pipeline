/**
 * Storyboard Generator - OpenRouter Integration
 * 
 * This module handles storyboard generation using OpenAI GPT-4o via OpenRouter API.
 * Generates dynamic scene count based on target duration (30s=3 scenes, 60s=7 scenes).
 */

import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { Scene, StoryboardResponse } from '../types';
import { convertUrlForAI } from '@/lib/utils/url-to-data-converter';

// ============================================================================
// Constants
// ============================================================================

// Support both OpenAI direct and OpenRouter
const USE_OPENAI_DIRECT = !!process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const API_URL = USE_OPENAI_DIRECT ? OPENAI_API_URL : OPENROUTER_API_URL;
// Use GPT-5 (o1) as default, fall back to gpt-4o-mini if not available
let OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/o1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'o1';
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
 * Generates system prompt based on target duration and scene count
 */
function generateSystemPrompt(targetDuration: number, sceneCount: number, assetDescription?: string): string {
  const durationPerScene = Math.round(targetDuration / sceneCount);

  // Add asset requirement if provided
  const assetRequirement = assetDescription 
    ? `\n\nCRITICAL ASSET REQUIREMENT: This is an advertisement featuring "${assetDescription}". You MUST include this exact asset description in EVERY scene's imagePrompt and videoPrompt. For example, in imagePrompts use "${assetDescription}" as the subject, and in videoPrompts describe actions/movements of "${assetDescription}".`
    : '';

  return `You are a professional video storyboard creator specializing in performance-focused advertising,
with particular strength in product and automotive commercials.

Given a short creative brief for a video advertisement, create exactly ${sceneCount} scenes for a ${targetDuration}-second video.

For each scene:
- Duration: approximately ${durationPerScene} seconds (total must equal ${targetDuration}s ±2s tolerance)
- Clear visual focus and logical progression from the previous scene
- Keep the scene description SHORT and CONCISE - 3-6 words maximum
- Provide a detailed imagePrompt for visual generation (static image description)
- Provide a detailed videoPrompt for video generation (motion/action description)${assetRequirement}

Scene description examples:
"driver close-up", "wide car approach", "interior cockpit"

Unless the brief clearly specifies otherwise, assume:
- The spot is shot on Arri Alexa with a high-end commercial finish
- The goal is to showcase the product or vehicle in a bold, cinematic way

IMPORTANT: All scene descriptions must be less than 1500 characters.

Output strictly valid JSON in this format:
{
  "scenes": [
    {
      "order": 0,
      "description": "Short 3-6 word phrase describing the scene",
      "imagePrompt": "[Subject/Scene]. [Style statement]. [Detailed visual description: shot type, subject details, lighting, visual style, focus, surface qualities, background effects]. Maximum 1500 characters.",
      "videoPrompt": "Break down into 2-3 shots with timing and bracketed format. Create cohesive audio narrative that evolves across shots. Use: Shot 1 (0:00-0:XX) [SHOT TYPE] [SUBJECT] [ACTION] [STYLE/LIGHTING] [CAMERA MOVEMENT] [AUDIO: detailed sound design]. Repeat for each shot, showing audio progression/build. Maximum 1500 characters.",
      "duration": ${durationPerScene}
    },
    ...
  ]
}

Keep imagePrompt focused on the opening frame composition. Keep videoPrompt front-loaded with key elements for Veo 3.1 optimization.

STYLE-SPECIFIC REQUIREMENTS: If the user's brief specifies "Wes Anderson style" or "whimsical", you MUST include those exact phrases in every imagePrompt (use "Wes Anderson style" and "whimsical") and in every videoPrompt (use "Wes Anderson style shot" and "whimsical"). Any human characters in Wes Anderson/whimsical scenes must be described as eccentrically dressed with distinctive vintage clothing and quirky accessories.`;
}

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
    videoPrompt: string;
    duration: number;
  }>;
}

// ============================================================================
// OpenRouter API Client
// ============================================================================

/**
 * Determines scene count based on target duration
 * 30s = 3 scenes, 60s = 7 scenes, default = 3 scenes
 */
function getSceneCountForDuration(targetDuration: number): number {
  if (targetDuration === 30) return 3;
  if (targetDuration === 60) return 7;
  // Default to 3 scenes for any other duration
  return 3;
}

/**
 * Helper function to convert hex color to description
 */
function colorToDescription(hexColor: string): string {
  const colorNames: Record<string, string> = {
    '#000000': 'black', '#FFFFFF': 'white', '#FF0000': 'red', '#00FF00': 'green',
    '#0000FF': 'blue', '#FFFF00': 'yellow', '#FF00FF': 'magenta', '#00FFFF': 'cyan',
    '#C0C0C0': 'silver', '#808080': 'gray', '#800000': 'maroon', '#808000': 'olive',
    '#008000': 'dark green', '#800080': 'purple', '#008080': 'teal', '#000080': 'navy',
    '#FFA500': 'orange', '#FFC0CB': 'pink', '#A52A2A': 'brown', '#FFD700': 'gold',
  };
  return colorNames[hexColor.toUpperCase()] || `${hexColor} color`;
}

/**
 * Calls OpenRouter API to generate storyboard
 * @param prompt User's product/ad description
 * @param targetDuration Target video duration in seconds (default: 30)
 * @param referenceImageUrls Optional array of reference image URLs
 * @param assetDescription Optional asset description (e.g., "Porsche 911 Carrera (2010)")
 * @param color Optional hex color code (e.g., "#FF5733")
 * @returns Raw JSON response from OpenRouter
 */
async function callOpenRouterAPI(
  prompt: string,
  targetDuration: number = 30,
  referenceImageUrls?: string[],
  assetDescription?: string,
  color?: string
): Promise<OpenRouterResponse> {
  const apiKey = USE_OPENAI_DIRECT ? process.env.OPENAI_API_KEY : process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(USE_OPENAI_DIRECT
      ? 'OPENAI_API_KEY environment variable is not set'
      : 'OPENROUTER_API_KEY environment variable is not set');
  }

  console.log(`[Storyboard] Using ${USE_OPENAI_DIRECT ? 'OpenAI Direct' : 'OpenRouter'} API`);

  const sceneCount = getSceneCountForDuration(targetDuration);
  console.log(`[Storyboard] Target duration: ${targetDuration}s → Scene count: ${sceneCount}`);
  
  // Build advertisement header if asset description is provided
  let advertisementHeader = '';
  if (assetDescription) {
    advertisementHeader = `Advertisement for a ${assetDescription}`;
    
    // Add color description if provided
    if (color) {
      const colorDesc = colorToDescription(color);
      advertisementHeader += ` in ${colorDesc}`;
    }
    
    advertisementHeader += '\n\n';
    console.log(`[Storyboard] Advertisement header: ${advertisementHeader.trim()}`);
  }
  
  const userPrompt = `${advertisementHeader}You are creating a performance-focused advertising storyboard (with strong support for product and automotive spots) for a ${targetDuration}-second video ad.

Creative brief from the user:
${prompt}

Use the structure [SHOT TYPE] + [SUBJECT] + [ACTION] + [STYLE] + [CAMERA MOVEMENT] + [AUDIO CUES] for each of the ${sceneCount} scene descriptions.

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
      // Convert URL to AI-accessible format
      // Strategy: Try presigned URL first (for S3), fall back to base64
      try {
        console.log(`[Storyboard] Converting image URL for AI: ${imageUrl.substring(0, 50)}...`);
        const converted = await convertUrlForAI(imageUrl);
        
        console.log(`[Storyboard] Converted using method: ${converted.method}`);
        
        userMessageContent.push({
          type: 'image_url',
          image_url: {
            url: converted.url,
          },
        });
      } catch (error) {
        console.warn(`[Storyboard] Failed to convert image ${imageUrl}, skipping:`, error);
        continue; // Skip this image if we can't convert it
      }
    }
  }

  const modelToUse = USE_OPENAI_DIRECT ? OPENAI_MODEL : OPENROUTER_MODEL;
  const systemPrompt = generateSystemPrompt(targetDuration, sceneCount, assetDescription);
  const requestBody: OpenRouterRequest = {
    model: modelToUse,
    messages: [
      {
        role: 'system',
        content: systemPrompt + '\n\nIMPORTANT: You must respond with valid JSON only. Do not include any text before or after the JSON object.',
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

  // Determine expected scene count based on target duration
  const expectedSceneCount = getSceneCountForDuration(targetDuration);

  // Validate we got the expected number of scenes
  if (rawResponse.scenes.length < expectedSceneCount) {
    throw new Error(
      `Invalid response: expected at least ${expectedSceneCount} scenes, got ${rawResponse.scenes.length}`
    );
  }
  // Truncate to expected scene count if more were returned
  rawResponse.scenes = rawResponse.scenes.slice(0, expectedSceneCount);

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
    if (typeof scene.videoPrompt !== 'string' || scene.videoPrompt.trim() === '') {
      throw new Error(`Scene ${index}: missing or invalid videoPrompt field`);
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
      videoPrompt: scene.videoPrompt.trim(),
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
 * Generates a storyboard from a user prompt
 * Scene count is determined by target duration: 30s = 3 scenes, 60s = 7 scenes
 * @param prompt User's product/ad description
 * @param targetDuration Target video duration in seconds (default: 30)
 * @param referenceImageUrls Optional array of reference image URLs for visual context
 * @param assetDescription Optional asset description (e.g., "Porsche 911 Carrera (2010)")
 * @param color Optional hex color code (e.g., "#FF5733")
 * @returns Array of validated scenes with UUIDs (3 scenes for 30s, 7 scenes for 60s)
 */
export async function generateStoryboard(
  prompt: string,
  targetDuration: number = 30,
  referenceImageUrls?: string[],
  assetDescription?: string,
  color?: string
): Promise<Scene[]> {
  // Validate inputs
  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    throw new Error('Prompt is required and must be a non-empty string');
  }

  if (typeof targetDuration !== 'number' || targetDuration < 10 || targetDuration > 60) {
    throw new Error('Target duration must be a number between 10 and 60 seconds');
  }

  const sceneCount = getSceneCountForDuration(targetDuration);

  const logPrefix = '[Storyboard]';
  console.log(`${logPrefix} ========================================`);
  console.log(`${logPrefix} Starting storyboard generation`);
  console.log(`${logPrefix} Prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);
  console.log(`${logPrefix} Target duration: ${targetDuration}s`);
  console.log(`${logPrefix} Scene count: ${sceneCount}`);
  if (assetDescription) {
    console.log(`${logPrefix} Asset description: "${assetDescription}"`);
  }
  if (color) {
    console.log(`${logPrefix} Color: ${color} (${colorToDescription(color)})`);
  }
  console.log(`${logPrefix} Timestamp: ${new Date().toISOString()}`);

  // Retry logic with exponential backoff
  const scenes = await retryWithBackoff(async () => {
    // Call OpenRouter API
    const apiResponse = await callOpenRouterAPI(prompt, targetDuration, referenceImageUrls, assetDescription, color);

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
