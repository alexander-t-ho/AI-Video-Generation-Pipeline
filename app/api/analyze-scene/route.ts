import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { scenePrompt } = await req.json();

    if (!scenePrompt) {
      return NextResponse.json(
        { error: 'Scene prompt is required' },
        { status: 400 }
      );
    }

    // Use Claude via OpenRouter to analyze the scene type
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'AI Video Generation Pipeline'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          {
            role: 'user',
            content: `Analyze this car video scene prompt and determine if it's focused on the INTERIOR or EXTERIOR of the vehicle.

Scene prompt: "${scenePrompt}"

Rules:
- If the scene focuses on interior elements (dashboard, cockpit, steering wheel, seats, console, etc.), respond with: INTERIOR
- If the scene focuses on exterior elements (front, back, side, aerial views, silhouettes, body, etc.), respond with: EXTERIOR
- If uncertain or mixed, default to: EXTERIOR

Respond with ONLY one word: either "INTERIOR" or "EXTERIOR"`
          }
        ],
        max_tokens: 200,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content?.trim().toUpperCase() || 'EXTERIOR';
    const sceneType = responseText.includes('INTERIOR') ? 'interior' : 'exterior';

    console.log('[AI Scene Analysis] OpenRouter + Claude:', {
      prompt: scenePrompt.substring(0, 100),
      analysis: responseText,
      sceneType,
      model: data.model
    });

    return NextResponse.json({
      sceneType,
      confidence: 'high'
    });

  } catch (error) {
    console.error('[AI Scene Analysis] Error:', error);

    // Fallback to exterior on error
    return NextResponse.json({
      sceneType: 'exterior',
      confidence: 'low',
      error: 'Failed to analyze scene, defaulting to exterior'
    });
  }
}
