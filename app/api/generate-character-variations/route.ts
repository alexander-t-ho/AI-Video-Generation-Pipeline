/**
 * API Route: Generate Character Variations
 * POST /api/generate-character-variations
 *
 * Generates character variations using unified service interface.
 * Supports both batch generation (turnaround sheets) and single iterations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateCharacterVariations } from '@/lib/services/character-generation';
import { convertUrlsInParallel } from '@/lib/utils/url-converter';
import { setRuntimeImageModel } from '@/lib/ai/image-generator';

interface GenerateCharacterVariationsRequest {
  description: string;
  projectId: string;
  count?: number;
  mode?: 'batch' | 'single';
  generateTurnaround?: boolean;
  referenceImages?: string[];
  feedback?: string;
  selectedReferenceImage?: string;
  ipAdapterScale?: number;
}

interface GenerateCharacterVariationsResponse {
  success: boolean;
  images?: Array<{ id: string; url: string; type?: string; angle?: number; scale?: string; metadata?: any }>;
  error?: string;
}

export async function POST(
  req: NextRequest
): Promise<NextResponse<GenerateCharacterVariationsResponse>> {
  try {
    // Parse and validate request
    const body: GenerateCharacterVariationsRequest = await req.json();

    if (!body.description || typeof body.description !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Description is required and must be a string' },
        { status: 400 }
      );
    }

    if (!body.projectId || typeof body.projectId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Project ID is required and must be a string' },
        { status: 400 }
      );
    }

    const count = body.count && typeof body.count === 'number' ? body.count : 5;
    if (count < 1 || count > 10) {
      return NextResponse.json(
        { success: false, error: 'Count must be between 1 and 10' },
        { status: 400 }
      );
    }

    // Check for runtime model override in headers
    const runtimeModel = req.headers.get('X-Model-T2I');
    if (runtimeModel) {
      setRuntimeImageModel(runtimeModel);
      console.log('[API:GenerateCharacterVariations] Using runtime model:', runtimeModel);
    }

    // Call service layer with all parameters
    const variations = await generateCharacterVariations({
      description: body.description,
      projectId: body.projectId,
      count,
      mode: body.mode || 'batch',
      generateTurnaround: body.generateTurnaround || false,
      referenceImages: body.referenceImages || [],
      feedback: body.feedback,
      selectedReferenceImage: body.selectedReferenceImage,
      model: runtimeModel || undefined,
      ipAdapterScale: body.ipAdapterScale,
    });

    // Return success response with full metadata
    return NextResponse.json({
      success: true,
      images: variations.map(v => ({
        id: v.id,
        url: v.url,
        type: v.type,
        angle: v.angle,
        scale: v.scale,
        metadata: v.metadata,
      })),
    });

  } catch (error) {
    console.error('[API:GenerateCharacterVariations] Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

