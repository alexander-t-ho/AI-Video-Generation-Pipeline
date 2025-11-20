import { NextRequest, NextResponse } from 'next/server';
import { getStorageService } from '@/lib/storage/storage-service';
import { CarDatabase, CarVariant, CarReferenceImage } from '@/components/brand-identity/types';

/**
 * GET /api/assets/cars
 * Fetch car assets database from S3
 *
 * Returns a CarDatabase object with variants and customAssets.
 */
export async function GET(request: NextRequest) {
  try {
    const storageService = getStorageService();

    // List all objects under the assets/cars/ prefix
    const s3Keys = await storageService.listObjects('assets/cars/');

    // Parse the S3 keys into a CarDatabase structure
    const carDatabase = parseS3KeysToCarDatabase(s3Keys, storageService);

    return NextResponse.json({
      success: true,
      data: carDatabase,
    });
  } catch (error: any) {
    console.error('[API] Error fetching car assets:', error);

    // Return empty database on error (client can fall back to mock data)
    return NextResponse.json({
      success: false,
      data: { variants: [], customAssets: [] },
      error: error.message || 'Failed to fetch car assets from S3',
    });
  }
}

/**
 * Parse S3 keys into a CarDatabase structure
 * Expected path structure: assets/cars/{brand}/{model}/{year}/{trim}/{filename}
 */
function parseS3KeysToCarDatabase(s3Keys: string[], storageService: any): CarDatabase {
  const variants: CarVariant[] = [];
  const variantMap = new Map<string, CarVariant>();

  // Filter out non-image files and parse each key
  const imageKeys = s3Keys.filter(key =>
    key.match(/\.(jpg|jpeg|png|webp)$/i) &&
    key.startsWith('assets/cars/')
  );

  for (const s3Key of imageKeys) {
    const parsed = parseS3Key(s3Key);
    if (!parsed) continue;

    const { brand, model, year, trim, filename, imageType } = parsed;

    // Create variant key for grouping
    const variantKey = `${brand}-${model}-${year}-${trim}`;
    const variantId = variantKey.toLowerCase().replace(/[^a-z0-9]/g, '-');

    // Get or create variant
    let variant = variantMap.get(variantId);
    if (!variant) {
      variant = {
        id: variantId,
        brand: brand.charAt(0).toUpperCase() + brand.slice(1),
        model: model.charAt(0).toUpperCase() + model.slice(1),
        year: parseInt(year, 10),
        trim: trim.charAt(0).toUpperCase() + trim.slice(1),
        displayName: `${brand.charAt(0).toUpperCase() + brand.slice(1)} ${model.charAt(0).toUpperCase() + model.slice(1)} ${trim.charAt(0).toUpperCase() + trim.slice(1)} (${year})`,
        s3Key: `assets/cars/${brand}/${model}/${year}/${trim}/`,
        referenceImages: [],
        availableColors: ['#000000', '#C0C0C0', '#FF0000', '#0000FF', '#FFFFFF', '#FFFF00'], // Default colors
      };
      variantMap.set(variantId, variant);
      variants.push(variant);
    }

    // Add reference image
    const imageId = `${variantId}-${imageType}`;
    const imageUrl = storageService.getS3Url(s3Key);

    variant.referenceImages.push({
      id: imageId,
      url: imageUrl,
      s3Key,
      type: imageType,
      filename,
      alt: `${variant.displayName} - ${imageType.charAt(0).toUpperCase() + imageType.slice(1)} View`,
    });
  }

  return {
    variants,
    customAssets: [], // Custom assets would be handled separately
  };
}

/**
 * Parse an S3 key to extract car metadata
 * Expected format: assets/cars/{brand}/{model}/{year}/{trim}/{filename}
 */
function parseS3Key(s3Key: string): {
  brand: string;
  model: string;
  year: string;
  trim: string;
  filename: string;
  imageType: CarReferenceImage['type'];
} | null {
  // Remove the prefix and split by '/'
  const pathParts = s3Key.replace('assets/cars/', '').split('/');

  if (pathParts.length < 5) return null; // Need at least brand/model/year/trim/filename

  const [brand, model, year, trim, ...filenameParts] = pathParts;
  const filename = filenameParts.join('/'); // In case filename has slashes

  // Map filename to image type
  const imageType = mapFilenameToImageType(filename);

  if (!imageType) return null;

  return {
    brand: brand.toLowerCase(),
    model: model.toLowerCase(),
    year,
    trim: trim.toLowerCase(),
    filename,
    imageType,
  };
}

/**
 * Map filename to image type based on naming patterns
 */
function mapFilenameToImageType(filename: string): CarReferenceImage['type'] | null {
  const filenameLower = filename.toLowerCase();

  // Check for common patterns
  if (filenameLower.includes('front')) return 'front';
  if (filenameLower.includes('side')) return 'side';
  if (filenameLower.includes('back') || filenameLower.includes('rear')) return 'back';
  if (filenameLower.includes('interior')) return 'interior';
  if (filenameLower.includes('tire') || filenameLower.includes('wheel')) return 'tires';
  if (filenameLower.includes('detail')) return 'detail';
  if (filenameLower.includes('left')) return 'left';
  if (filenameLower.includes('right')) return 'right';

  // Fallback: try to match exact filenames without extension
  const nameWithoutExt = filenameLower.replace(/\.[^/.]+$/, '');
  switch (nameWithoutExt) {
    case 'front': return 'front';
    case 'side': return 'side';
    case 'back': return 'back';
    case 'rear': return 'back';
    case 'interior': return 'interior';
    case 'tires': return 'tires';
    case 'wheels': return 'tires';
    case 'detail': return 'detail';
    case 'left': return 'left';
    case 'right': return 'right';
    default: return null;
  }
}
