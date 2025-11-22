import { NextRequest, NextResponse } from 'next/server';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

const SCENE_REWRITE_SYSTEM_PROMPT = `You are a professional video storyboard creator specializing in performance-focused advertising,
with particular strength in product and automotive commercials.

Your task is to rewrite a single scene from a storyboard. The scene description should be SHORT and CONCISE - 3-6 words maximum.

The description must be a SHORT phrase like:
"driver close-up", "wide car approach", "interior cockpit", "engine roar", "hero product shot"

For the imagePrompt field, provide detailed visual guidance for image generation including shot type, subject, style, lighting, composition.
For the videoPrompt field, provide detailed guidance for video generation describing motion, action, camera movement, and dynamic elements.

Output strictly valid JSON in this format:
{
  "description": "Short 3-6 word phrase describing the scene",
  "imagePrompt": "Detailed prompt for image generation that matches the description, including shot type, subject, style, lighting, composition.",
  "videoPrompt": "Detailed prompt for video generation describing motion, action, camera movement, and dynamic elements.",
  "duration": 3
}

Keep image prompts specific, visual, and production-ready. Keep video prompts focused on motion, action, and dynamic elements. The description field should be short and punchy, while imagePrompt and videoPrompt contain all the detail.`;

export async function POST(request: NextRequest) {
  try {
    const { sceneId, currentDescription, currentImagePrompt, context, idea } = await request.json();

    if (!sceneId) {
      return NextResponse.json({ success: false, error: 'Missing sceneId' }, { status: 400 });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'OpenRouter API key not configured' },
        { status: 500 }
      );
    }

    // Build the prompt for rewriting
    const userPrompt = `Rewrite this scene from a storyboard:

Current scene description: "${currentDescription || 'Not provided'}"
Current scene details: "${currentImagePrompt || 'Not provided'}"

${context ? `Context from other scenes: ${context}` : ''}
${idea ? `Overall story idea: ${idea}` : ''}

Generate a new version of this scene that fits the storyboard. Keep the description short (3-6 words) and provide detailed visual guidance in the imagePrompt.`;

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'Scen3 - AI Video Generation',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: SCENE_REWRITE_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `OpenRouter API error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content?.trim();

    if (!content) {
      throw new Error('Failed to generate scene from LLM');
    }

    let sceneData;
    try {
      sceneData = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse scene JSON:', parseError);
      throw new Error('Invalid JSON response from LLM');
    }

    // Validate the response
    if (!sceneData.description || !sceneData.imagePrompt) {
      throw new Error('Invalid scene data from LLM');
    }

    // Ensure duration is between 2-4 seconds
    const duration = Math.max(2, Math.min(4, sceneData.duration || 3));

    return NextResponse.json({
      success: true,
      scene: {
        description: sceneData.description.trim(),
        imagePrompt: sceneData.imagePrompt.trim(),
        videoPrompt: sceneData.videoPrompt?.trim() || sceneData.imagePrompt.trim(), // Fallback to imagePrompt if not provided
        suggestedDuration: duration,
      },
    });
  } catch (error) {
    console.error('Error regenerating scene:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

