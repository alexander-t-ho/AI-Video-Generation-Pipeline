import { NextResponse } from 'next/server';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface ExtractedCarInfo {
  brand?: string;
  model?: string;
  year?: number;
  confidence: 'high' | 'medium' | 'low' | 'none';
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Prompt is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'OPENROUTER_API_KEY not configured' },
        { status: 500 }
      );
    }

    console.log('[ExtractCarModel] Extracting car model from prompt');

    const systemPrompt = `You are extracting car/vehicle information from a user's video advertisement prompt.

Your task is to identify if a specific car brand, model, or year is mentioned in the prompt.

Return a JSON object with the following structure:
{
  "brand": "string or null - the car manufacturer (e.g., 'Porsche', 'BMW', 'Ford', 'Tesla')",
  "model": "string or null - the car model (e.g., '911', 'M3', 'Mustang', 'Model S')",
  "year": "number or null - the model year if specified (e.g., 2024)",
  "confidence": "high | medium | low | none"
}

Confidence levels:
- "high": Exact brand and model clearly mentioned (e.g., "Porsche 911 GT3")
- "medium": Brand mentioned but model unclear or vice versa (e.g., "a Porsche" or "a sports car")
- "low": Generic car reference that could match multiple vehicles (e.g., "luxury sedan")
- "none": No car/vehicle mentioned in the prompt

Common variations to recognize:
- "Bimmer" = BMW
- "Stang" = Mustang
- "Vette" = Corvette
- Model numbers like "911", "M3", "GT-R"

Return ONLY the JSON object, no other text.`;

    let response;
    let modelUsed = 'anthropic/claude-sonnet-4';

    try {
      response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          'X-Title': 'AI Video Generation Pipeline',
        },
        body: JSON.stringify({
          model: 'anthropic/claude-sonnet-4',
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: `Extract car information from this prompt:\n\n"${prompt}"`,
            },
          ],
          max_tokens: 200,
          temperature: 0.1,
        }),
      });
    } catch (error) {
      console.warn('[ExtractCarModel] Claude Sonnet 4 failed, trying GPT-4o fallback:', error);
      modelUsed = 'openai/gpt-4o';
      response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          'X-Title': 'AI Video Generation Pipeline',
        },
        body: JSON.stringify({
          model: 'openai/gpt-4o',
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: `Extract car information from this prompt:\n\n"${prompt}"`,
            },
          ],
          max_tokens: 200,
          temperature: 0.1,
        }),
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ExtractCarModel] OpenRouter API error (${modelUsed}):`, errorText);
      return NextResponse.json(
        { success: false, error: 'Failed to extract car model' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content?.trim() || '';

    if (!responseText) {
      return NextResponse.json({
        success: true,
        carInfo: { confidence: 'none' } as ExtractedCarInfo,
      });
    }

    // Parse the JSON response
    try {
      // Clean the response - remove markdown code blocks if present
      let cleanedResponse = responseText;
      if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/```json?\n?/g, '').replace(/```\n?/g, '');
      }

      const carInfo: ExtractedCarInfo = JSON.parse(cleanedResponse);

      console.log(`[ExtractCarModel] Successfully extracted car info using ${modelUsed}:`, carInfo);

      return NextResponse.json({
        success: true,
        carInfo,
      });
    } catch (parseError) {
      console.error('[ExtractCarModel] Failed to parse response:', responseText);
      return NextResponse.json({
        success: true,
        carInfo: { confidence: 'none' } as ExtractedCarInfo,
      });
    }

  } catch (error) {
    console.error('[ExtractCarModel] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
