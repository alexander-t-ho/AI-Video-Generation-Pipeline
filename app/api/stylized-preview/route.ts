import { NextRequest, NextResponse } from 'next/server';
import { generateStylizedPreviews } from '@/lib/services/stylized-preview-generator';
import type { StylizedPreviewRequest, StylizedPreviewResponse } from '@/lib/types/stylized';

export const dynamic = 'force-dynamic';

/**
 * POST /api/stylized-preview
 * Generates multiple stylized preview videos showcasing different directing styles
 * 
 * Request Body:
 * {
 *   subjectImageUrl: string;      // Required: URL to the subject image (car)
 *   selectedStyles: string[];     // Required: Array of style IDs to generate
 *   basePrompt?: string;          // Optional: Base prompt (auto-generated if not provided)
 * }
 * 
 * Response:
 * {
 *   success: boolean;
 *   previews?: StylizedPreview[];
 *   error?: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Check for required environment variables
    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json(
        {
          success: false,
          error: 'REPLICATE_API_TOKEN environment variable is not set.',
        } as StylizedPreviewResponse,
        { status: 500 }
      );
    }

    const body = await request.json();
    const { subjectImageUrl, selectedStyles, basePrompt } = body as StylizedPreviewRequest;

    // Validate required fields
    if (!subjectImageUrl || typeof subjectImageUrl !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'subjectImageUrl is required and must be a string',
        } as StylizedPreviewResponse,
        { status: 400 }
      );
    }

    if (!selectedStyles || !Array.isArray(selectedStyles) || selectedStyles.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'selectedStyles is required and must be a non-empty array',
        } as StylizedPreviewResponse,
        { status: 400 }
      );
    }

    // Validate that subjectImageUrl is an HTTP/HTTPS URL
    if (!subjectImageUrl.startsWith('http://') && !subjectImageUrl.startsWith('https://')) {
      return NextResponse.json(
        {
          success: false,
          error: 'subjectImageUrl must be a publicly accessible HTTP/HTTPS URL',
        } as StylizedPreviewResponse,
        { status: 400 }
      );
    }

    // Validate basePrompt if provided
    if (basePrompt !== undefined && typeof basePrompt !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'basePrompt must be a string if provided',
        } as StylizedPreviewResponse,
        { status: 400 }
      );
    }

    console.log('[Stylized Preview API] Starting generation');
    console.log('[Stylized Preview API] Subject Image:', subjectImageUrl);
    console.log('[Stylized Preview API] Selected Styles:', selectedStyles.join(', '));
    if (basePrompt) {
      console.log('[Stylized Preview API] Base Prompt:', basePrompt);
    }

    // Generate previews
    const previews = await generateStylizedPreviews(
      subjectImageUrl,
      selectedStyles,
      basePrompt
    );

    return NextResponse.json({
      success: true,
      previews,
    } as StylizedPreviewResponse);
  } catch (error: any) {
    console.error('[Stylized Preview API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to generate stylized previews',
      } as StylizedPreviewResponse,
      { status: 500 }
    );
  }
}

