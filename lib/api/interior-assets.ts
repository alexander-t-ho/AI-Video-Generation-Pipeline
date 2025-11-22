/**
 * Brand Assets API Client
 *
 * Utilities for fetching car media assets (interior/exterior) for enhanced scene generation
 */

export type CarMediaType = 'INTERIOR' | 'EXTERIOR' | 'SOUND' | 'THREE_D_MODEL';

export interface BrandAsset {
  id: string;
  url: string;
  s3Key: string;
  filename: string;
  mimeType: string;
  size: number;
  type: CarMediaType;
  variantId: string;
  modelName: string;
  year: number;
  trim: string;
}

// Backward compatibility
export type InteriorAsset = BrandAsset;

export interface FetchBrandAssetsParams {
  variantId?: string;
  companyId?: string;
  type?: CarMediaType;
}

/**
 * Fetches car brand assets (interior, exterior, etc.)
 * @param params - Query parameters (variantId or companyId, optional type filter)
 * @returns Array of brand assets
 */
export async function fetchBrandAssets(
  params: FetchBrandAssetsParams
): Promise<BrandAsset[]> {
  const { variantId, companyId, type } = params;

  if (!variantId && !companyId) {
    console.warn('[Brand Assets] No variantId or companyId provided, skipping fetch');
    return [];
  }

  try {
    const queryParams = new URLSearchParams();
    if (variantId) queryParams.append('variantId', variantId);
    if (companyId) queryParams.append('companyId', companyId);
    if (type) queryParams.append('type', type);

    const response = await fetch(`/api/cars/brand-assets?${queryParams.toString()}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch brand assets: ${response.statusText}`);
    }

    const data = await response.json();
    const assets = data.assets || [];

    const typeLabel = type ? `${type.toLowerCase()} ` : '';
    console.log(`[Brand Assets] Fetched ${assets.length} ${typeLabel}asset(s)`);
    return assets;
  } catch (error) {
    console.error('[Brand Assets] Error fetching brand assets:', error);
    return [];
  }
}

// Backward compatibility - interior assets
export type FetchInteriorAssetsParams = FetchBrandAssetsParams;
export async function fetchInteriorAssets(
  params: FetchInteriorAssetsParams
): Promise<InteriorAsset[]> {
  return fetchBrandAssets({ ...params, type: 'INTERIOR' });
}

/**
 * Detects if a scene is an interior scene based on keywords
 * @param prompt - Scene image prompt
 * @returns true if interior scene detected
 */
export function isInteriorScene(prompt: string): boolean {
  const lowerPrompt = prompt.toLowerCase();
  return (
    lowerPrompt.includes('interior') ||
    lowerPrompt.includes('inside') ||
    lowerPrompt.includes('room') ||
    lowerPrompt.includes('indoor') ||
    lowerPrompt.includes('cockpit') ||
    lowerPrompt.includes('cabin') ||
    lowerPrompt.includes('dashboard') ||
    lowerPrompt.includes('steering wheel') ||
    lowerPrompt.includes('driver seat') ||
    lowerPrompt.includes('passenger seat')
  );
}
