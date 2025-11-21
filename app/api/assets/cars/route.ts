import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/auth-utils';
import prisma from '@/lib/db/prisma';

// Force dynamic rendering for routes that use headers/cookies
export const dynamic = 'force-dynamic';
import { CarDatabase, CarVariant, CarReferenceImage } from '@/components/brand-identity/types';
import { CarMediaType } from '@prisma/client';
import { getStorageService } from '@/lib/storage/storage-service';

/**
 * GET /api/assets/cars
 * Fetch car assets database from Database (Postgres)
 * 
 * Returns a CarDatabase object with variants and customAssets.
 * Filters by the authenticated user's company.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    
    if (!session?.user?.companyId) {
      // If no session/company, return empty list (or could return 401)
      return NextResponse.json({
        success: true,
        data: { variants: [], customAssets: [] }
      });
    }

    const companyId = session.user.companyId;
    const storageService = getStorageService();

    // Fetch cars for this company with all relations
    const carModels = await prisma.carModel.findMany({
      where: { companyId },
      include: {
        variants: {
          include: {
            media: true
          },
          orderBy: [{ year: 'desc' }, { trim: 'asc' }]
        }
      },
      orderBy: { name: 'asc' }
    });

    // Transform to frontend types
    const variants: CarVariant[] = [];

    for (const model of carModels) {
      for (const variant of model.variants) {
        // Process media items in parallel to generate signed URLs
        const referenceImages = await Promise.all(variant.media.map(async (media) => {
          const viewType = mapMediaToViewType(media.type, media.filename);
          
          // Generate URL (signed if S3, raw if already HTTP)
          let url = media.s3Key;
          if (!media.s3Key.startsWith('http')) {
            try {
              // Generate signed URL valid for 1 hour
              url = await storageService.getPreSignedUrl(media.s3Key, 3600);
            } catch (e) {
              console.warn(`Failed to generate signed URL for ${media.s3Key}:`, e);
              // Fallback to public URL structure if signing fails
              const bucket = process.env.AWS_S3_BUCKET || 'ai-video-pipeline-outputs';
              const region = process.env.AWS_REGION || 'us-east-1';
              url = `https://${bucket}.s3.${region}.amazonaws.com/${media.s3Key}`;
            }
          }

          const image: CarReferenceImage = {
            id: media.id,
            url: url,
            s3Key: media.s3Key,
            type: viewType,
            filename: media.filename,
            alt: `${model.name} ${variant.trim} - ${viewType} View`
          };
          return image;
        }));

        // Only include variants that have media (optional, but keeps UI clean)
        if (referenceImages.length > 0) {
          variants.push({
            id: variant.id,
            brand: model.name,
            model: variant.trim, // Using trim as model name (e.g. "GT3")
            year: variant.year,
            trim: variant.trim,
            displayName: `${model.name} ${variant.trim} (${variant.year})`,
            s3Key: `cars/${companyId}/${model.id}/${variant.id}/`, // Virtual path
            referenceImages: referenceImages,
            availableColors: ['#000000', '#C0C0C0', '#FF0000', '#0000FF', '#FFFFFF', '#FFFF00'],
          });
        }
      }
    }

    const carDatabase: CarDatabase = {
      variants,
      customAssets: [], // TODO: Fetch custom assets if we have a table for them
    };

    return NextResponse.json({
      success: true,
      data: carDatabase,
    });

  } catch (error: any) {
    console.error('[API] Error fetching car assets:', error);

    return NextResponse.json({
      success: false,
      data: { variants: [], customAssets: [] },
      error: error.message || 'Failed to fetch car assets',
    });
  }
}

/**
 * Map database media type and filename to frontend view type
 */
function mapMediaToViewType(dbType: CarMediaType, filename: string): CarReferenceImage['type'] {
  const lowerName = filename.toLowerCase();

  // If it's Interior, map directly
  if (dbType === 'INTERIOR') return 'interior';
  
  // If it's a tire/wheel close up
  if (lowerName.includes('tire') || lowerName.includes('wheel') || lowerName.includes('rim')) return 'tires';
  
  // If it's a detail shot
  if (lowerName.includes('detail') || lowerName.includes('close')) return 'detail';

  // For Exterior, try to determine angle
  if (lowerName.includes('front')) return 'front';
  if (lowerName.includes('back') || lowerName.includes('rear')) return 'back';
  if (lowerName.includes('side') || lowerName.includes('profile')) return 'side';
  if (lowerName.includes('left')) return 'left';
  if (lowerName.includes('right')) return 'right';
  if (lowerName.includes('aerial') || lowerName.includes('top')) return 'detail';

  // Default fallback
  return 'custom';
}
