import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getS3Url } from '@/lib/storage/s3-uploader';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

/**
 * GET /api/cars/brand-assets
 *
 * Fetches car media assets (both interior and exterior) for a given car variant
 * Query params:
 * - variantId: Car variant ID (optional)
 * - companyId: Company ID (optional, returns all assets for company)
 * - type: Media type filter (INTERIOR, EXTERIOR, SOUND, THREE_D_MODEL) - optional
 *
 * Returns:
 * {
 *   assets: Array<{
 *     id: string;
 *     url: string;
 *     s3Key: string;
 *     filename: string;
 *     mimeType: string;
 *     type: 'INTERIOR' | 'EXTERIOR' | 'SOUND' | 'THREE_D_MODEL';
 *   }>
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const variantId = searchParams.get('variantId');
    const companyId = searchParams.get('companyId');
    const type = searchParams.get('type') as 'INTERIOR' | 'EXTERIOR' | 'SOUND' | 'THREE_D_MODEL' | null;

    if (!variantId && !companyId) {
      return NextResponse.json(
        { error: 'Either variantId or companyId is required' },
        { status: 400 }
      );
    }

    let whereClause: any = {};

    // Filter by type if provided
    if (type) {
      whereClause.type = type;
    }

    if (variantId) {
      // Fetch assets for a specific variant
      whereClause.variantId = variantId;
    } else if (companyId) {
      // Fetch all assets for the company
      whereClause.variant = {
        model: {
          companyId,
        },
      };
    }

    const carAssets = await prisma.carMedia.findMany({
      where: whereClause,
      include: {
        variant: {
          include: {
            model: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Convert to public URLs
    const assets = carAssets.map((asset) => ({
      id: asset.id,
      url: getS3Url(asset.s3Key),
      s3Key: asset.s3Key,
      filename: asset.filename,
      mimeType: asset.mimeType,
      size: asset.size,
      type: asset.type,
      variantId: asset.variantId,
      modelName: asset.variant.model.name,
      year: asset.variant.year,
      trim: asset.variant.trim,
    }));

    const typeFilter = type ? ` of type ${type}` : '';
    console.log(`[Brand Assets API] Found ${assets.length} brand asset(s)${typeFilter} for ${variantId ? `variant ${variantId}` : `company ${companyId}`}`);

    return NextResponse.json({ assets }, { status: 200 });
  } catch (error) {
    console.error('[Brand Assets API] Error fetching brand assets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch brand assets' },
      { status: 500 }
    );
  }
}
