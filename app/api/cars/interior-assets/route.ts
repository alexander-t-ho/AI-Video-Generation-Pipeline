import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getS3Url } from '@/lib/storage/s3-uploader';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

/**
 * GET /api/cars/interior-assets
 *
 * Fetches interior car media assets for a given car variant
 * Query params:
 * - variantId: Car variant ID (optional)
 * - companyId: Company ID (optional, returns all interior assets for company)
 *
 * Returns:
 * {
 *   assets: Array<{
 *     id: string;
 *     url: string;
 *     s3Key: string;
 *     filename: string;
 *     mimeType: string;
 *   }>
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const variantId = searchParams.get('variantId');
    const companyId = searchParams.get('companyId');

    if (!variantId && !companyId) {
      return NextResponse.json(
        { error: 'Either variantId or companyId is required' },
        { status: 400 }
      );
    }

    let whereClause: any = {
      type: 'INTERIOR',
    };

    if (variantId) {
      // Fetch interior assets for a specific variant
      whereClause.variantId = variantId;
    } else if (companyId) {
      // Fetch all interior assets for the company
      whereClause.variant = {
        model: {
          companyId,
        },
      };
    }

    const interiorAssets = await prisma.carMedia.findMany({
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
    const assets = interiorAssets.map((asset) => ({
      id: asset.id,
      url: getS3Url(asset.s3Key),
      s3Key: asset.s3Key,
      filename: asset.filename,
      mimeType: asset.mimeType,
      size: asset.size,
      variantId: asset.variantId,
      modelName: asset.variant.model.name,
      year: asset.variant.year,
      trim: asset.variant.trim,
    }));

    console.log(`[Interior Assets API] Found ${assets.length} interior asset(s) for ${variantId ? `variant ${variantId}` : `company ${companyId}`}`);

    return NextResponse.json({ assets }, { status: 200 });
  } catch (error) {
    console.error('[Interior Assets API] Error fetching interior assets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch interior assets' },
      { status: 500 }
    );
  }
}
