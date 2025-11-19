/**
 * Story Idea Generation API Route
 * 
 * POST /api/generate-story-idea
 * 
 * Takes a user's initial prompt and refines it into a compelling story idea
 * using OpenAI GPT-4o-mini via OpenRouter.
 */

import { NextRequest, NextResponse } from 'next/server';

interface StoryIdeaRequest {
  initialPrompt: string;
}

interface StoryIdeaResponse {
  success: boolean;
  idea?: string;
  error?: string;
  code?: string;
}

/**
 * POST /api/generate-story-idea
 * 
 * Generates a refined story idea from the user's initial prompt.
 * 
 * Request Body:
 * {
 *   initialPrompt: string;  // User's initial vision/prompt
 * }
 * 
 * Response:
 * {
 *   success: true;
 *   idea: string;  // Refined story idea
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse request body
    let body: StoryIdeaRequest;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('[Story Idea API] Failed to parse request body:', parseError);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid JSON in request body',
          code: 'INVALID_REQUEST',
        } as StoryIdeaResponse,
        { status: 400 }
      );
    }

    // Validate request
    if (!body.initialPrompt || typeof body.initialPrompt !== 'string' || body.initialPrompt.trim() === '') {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required field: initialPrompt',
          code: 'INVALID_REQUEST',
        } as StoryIdeaResponse,
        { status: 400 }
      );
    }

    // Check for API key
    if (!process.env.OPENROUTER_API_KEY) {
      console.error('[Story Idea API] OPENROUTER_API_KEY not configured');
      return NextResponse.json(
        {
          success: false,
          error: 'OpenRouter API key not configured',
          code: 'GENERATION_FAILED',
        } as StoryIdeaResponse,
        { status: 500 }
      );
    }

    console.log('[Story Idea API] Generating story idea...');

    // Build the prompt for the LLM
    const systemPrompt = `You are an expert advertising creative director and storytelling consultant. Your job is to refine raw ideas into compelling advertising narratives.

Given a user's initial vision or prompt, create a concise, compelling story idea that answers:
1. WHO is this for? (target audience)
2. WHAT are you selling? (focus on the FEELING, emotion, or aspiration - not just the product)
3. What should viewers FEEL or DO after watching?

Keep your response under 100 words. Write in a clear, punchy style. Focus on emotions and aspirations over technical details.`;

    const userPrompt = `Initial vision: ${body.initialPrompt.trim()}

Refine this into a compelling story idea for an advertisement.`;

    // Call OpenRouter API
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'Scene3 - AI Video Generation',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Story Idea API] OpenRouter error:', response.status, errorText);
      return NextResponse.json(
        {
          success: false,
          error: `OpenRouter API error: ${response.status}`,
          code: 'GENERATION_FAILED',
        } as StoryIdeaResponse,
        { status: 500 }
      );
    }

    const data = await response.json();
    const idea = data.choices?.[0]?.message?.content?.trim();

    if (!idea) {
      console.error('[Story Idea API] No content in response');
      return NextResponse.json(
        {
          success: false,
          error: 'No content generated',
          code: 'GENERATION_FAILED',
        } as StoryIdeaResponse,
        { status: 500 }
      );
    }

    const duration = Date.now() - startTime;
    console.log(`[Story Idea API] Successfully generated story idea in ${duration}ms`);

    return NextResponse.json(
      {
        success: true,
        idea,
      } as StoryIdeaResponse,
      { status: 200 }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Story Idea API] Error after ${duration}ms:`, error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'GENERATION_FAILED',
      } as StoryIdeaResponse,
      { status: 500 }
    );
  }
}



