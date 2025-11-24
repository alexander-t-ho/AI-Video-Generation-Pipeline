/**
 * Narration Script Generation API Route
 *
 * POST /api/generate-narration-script
 * Generates a cohesive narration script from storyboard scenes using Claude Sonnet via OpenRouter
 */

import { NextRequest, NextResponse } from 'next/server';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const CLAUDE_MODEL = 'anthropic/claude-sonnet-4';
const FALLBACK_MODEL = 'anthropic/claude-3.5-sonnet';

interface Scene {
  description: string;
  imagePrompt?: string;
  videoPrompt?: string;
  suggestedDuration?: number;
}

interface GenerateNarrationScriptBody {
  scenes: Scene[];
  projectName?: string;
  characterDescription?: string;
  targetDuration?: number;
  mood?: string;
}

const SYSTEM_PROMPT = `You are an expert voice-over scriptwriter specializing in creating compelling narration for video content.

Your task is to create a cohesive narration script from storyboard scene descriptions that:
1. Flows naturally from scene to scene
2. Captures the overall mood and tone of the video
3. Is timed appropriately for the video duration
4. Uses engaging, professional language suitable for voice-over
5. Avoids describing exactly what's shown - instead adds context, emotion, and story

Guidelines:
- Write in a natural, conversational tone
- Use short, punchy sentences that are easy to read aloud
- Include natural pauses (indicated by "..." or sentence breaks)
- Match the pacing to the scene durations
- Create emotional connection with the viewer
- Don't start with "Welcome" or cliche openers unless it fits the brand

Output ONLY the narration script text, no explanations or scene markers.`;

export async function POST(request: NextRequest) {
  try {
    const body: GenerateNarrationScriptBody = await request.json();

    if (!body.scenes || body.scenes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Scenes are required to generate narration script' },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'OpenRouter API key not configured' },
        { status: 500 }
      );
    }

    // Build the scene descriptions for the prompt
    const sceneDescriptions = body.scenes.map((scene, index) => {
      const duration = scene.suggestedDuration || 5;
      return `Scene ${index + 1} (${duration}s): ${scene.description}${scene.videoPrompt ? ` - ${scene.videoPrompt}` : ''}`;
    }).join('\n');

    const totalDuration = body.scenes.reduce((sum, s) => sum + (s.suggestedDuration || 5), 0);

    let userPrompt = `Create a cohesive narration dialogue from these storyboard scenes that captures the mood:\n\n${sceneDescriptions}`;

    if (body.projectName) {
      userPrompt += `\n\nProject/Brand: ${body.projectName}`;
    }

    if (body.characterDescription) {
      userPrompt += `\n\nSubject Description: ${body.characterDescription}`;
    }

    if (body.mood) {
      userPrompt += `\n\nDesired Mood: ${body.mood}`;
    }

    userPrompt += `\n\nTotal video duration: approximately ${totalDuration} seconds. The narration should fit within this timeframe.`;
    userPrompt += '\n\nProvide ONLY the narration script text, ready to be spoken.';

    console.log('[GenerateNarrationScript] Generating script for', body.scenes.length, 'scenes');

    // Try Claude Sonnet first
    let response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'AI Video Generation Pipeline - Narration Script',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    // Fallback to Claude 3.5 Sonnet if needed
    if (!response.ok) {
      console.warn('[GenerateNarrationScript] Claude 4 failed, trying fallback model');
      response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          'X-Title': 'AI Video Generation Pipeline - Narration Script',
        },
        body: JSON.stringify({
          model: FALLBACK_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 1000,
          temperature: 0.7,
        }),
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[GenerateNarrationScript] API error:', response.status, errorText);
      return NextResponse.json(
        { success: false, error: `Failed to generate narration script: ${response.status}` },
        { status: 500 }
      );
    }

    const data = await response.json();
    const narrationScript = data.choices?.[0]?.message?.content?.trim();

    if (!narrationScript) {
      return NextResponse.json(
        { success: false, error: 'No narration script returned' },
        { status: 500 }
      );
    }

    console.log('[GenerateNarrationScript] Script generated:', narrationScript.substring(0, 100) + '...');

    return NextResponse.json({
      success: true,
      data: {
        script: narrationScript,
        sceneCount: body.scenes.length,
        estimatedDuration: totalDuration,
      },
    });
  } catch (error) {
    console.error('[GenerateNarrationScript] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
