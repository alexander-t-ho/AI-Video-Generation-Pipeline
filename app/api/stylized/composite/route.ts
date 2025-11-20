/**
 * API Route: Stylized Composite
 * POST /api/stylized/composite
 * Creates a styled composite of car on background
 */

import { NextRequest, NextResponse } from 'next/server';
import { createStyledComposite } from '@/lib/services/stylized-compositor';
import { CompositingRequest, CompositingResponse, PRESET_STYLES } from '@/lib/types/stylized';

export const dynamic = 'force-dynamic';

/**
 * POST /api/stylized/composite
 * Creates a styled composite of car on background
 * 
 * Request Body:
 * {
 *   carImageUrl: string;           // Required: URL to car image
 *   backgroundImageUrl: string;    // Required: URL to background image
 *   styleId: string;               // Required: Director style ID
 *   carPosition?: { x: number; y: number }; // Optional: Car position
 *   carScale?: number;             // Optional: Car scale (0-1)
 * }
 * 
 * Response:
 * {
 *   success: boolean;
 *   result?: CompositingResult;
 *   error?: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { carImageUrl, backgroundImageUrl, styleId, carPosition, carScale } = body as CompositingRequest;

    // Validate required fields
    if (!carImageUrl || typeof carImageUrl !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'carImageUrl is required and must be a string',
        } as CompositingResponse,
        { status: 400 }
      );
    }

    if (!backgroundImageUrl || typeof backgroundImageUrl !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'backgroundImageUrl is required and must be a string',
        } as CompositingResponse,
        { status: 400 }
      );
    }

    if (!styleId || typeof styleId !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'styleId is required and must be a string',
        } as CompositingResponse,
        { status: 400 }
      );
    }

    // Validate style ID
    const validStyle = PRESET_STYLES.find(s => s.id === styleId);
    if (!validStyle) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid styleId: ${styleId}. Must be one of: ${PRESET_STYLES.map(s => s.id).join(', ')}`,
        } as CompositingResponse,
        { status: 400 }
      );
    }

    // Validate URLs are HTTP/HTTPS or data URLs
    const isValidUrl = (url: string) => {
      return url.startsWith('http://') || 
             url.startsWith('https://') || 
             url.startsWith('data:');
    };

    if (!isValidUrl(carImageUrl)) {
      return NextResponse.json(
        {
          success: false,
          error: 'carImageUrl must be a valid HTTP/HTTPS URL or data URL',
        } as CompositingResponse,
        { status: 400 }
      );
    }

    if (!isValidUrl(backgroundImageUrl)) {
      return NextResponse.json(
        {
          success: false,
          error: 'backgroundImageUrl must be a valid HTTP/HTTPS URL or data URL',
        } as CompositingResponse,
        { status: 400 }
      );
    }

    // Validate optional fields
    if (carPosition !== undefined) {
      if (typeof carPosition !== 'object' || 
          typeof carPosition.x !== 'number' || 
          typeof carPosition.y !== 'number') {
        return NextResponse.json(
          {
            success: false,
            error: 'carPosition must be an object with x and y number properties',
          } as CompositingResponse,
          { status: 400 }
        );
      }
    }

    if (carScale !== undefined) {
      if (typeof carScale !== 'number' || carScale <= 0 || carScale > 1) {
        return NextResponse.json(
          {
            success: false,
            error: 'carScale must be a number between 0 and 1',
          } as CompositingResponse,
          { status: 400 }
        );
      }
    }

    console.log('[Stylized Composite API] Creating composite');
    console.log('[Stylized Composite API] Car:', carImageUrl);
    console.log('[Stylized Composite API] Background:', backgroundImageUrl);
    console.log('[Stylized Composite API] Style:', styleId);

    // Create composite
    const result = await createStyledComposite({
      carImageUrl,
      backgroundImageUrl,
      styleId,
      carPosition,
      carScale,
    });

    return NextResponse.json({
      success: true,
      result,
    } as CompositingResponse);
  } catch (error: any) {
    console.error('[Stylized Composite API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to create composite',
      } as CompositingResponse,
      { status: 500 }
    );
  }
}

