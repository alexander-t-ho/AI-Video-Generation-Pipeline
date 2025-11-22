/**
 * Public sample backgrounds loader
 * Loads pre-included background images from /public/sample-backgrounds
 */

export interface PublicBackground {
  id: string;
  filename: string;
  name: string;
  description: string;
  tags: string[];
}

/**
 * Get all available public backgrounds
 */
export async function getPublicBackgrounds(): Promise<PublicBackground[]> {
  try {
    const response = await fetch('/sample-backgrounds/backgrounds.json');
    if (!response.ok) {
      console.warn('Failed to load public backgrounds manifest');
      return [];
    }
    const backgrounds: PublicBackground[] = await response.json();
    return backgrounds;
  } catch (error) {
    console.error('Error loading public backgrounds:', error);
    return [];
  }
}

/**
 * Get URL for a public background
 */
export function getPublicBackgroundUrl(filename: string): string {
  return `/sample-backgrounds/${filename}`;
}

/**
 * Convert public background to UploadedImage format for consistency
 */
export function publicBackgroundToUploadedImage(bg: PublicBackground) {
  return {
    id: `public-bg-${bg.id}`,
    url: getPublicBackgroundUrl(bg.filename),
    localPath: getPublicBackgroundUrl(bg.filename),
    originalName: bg.name,
    mimeType: 'image/jpeg',
    size: 0, // Unknown for public assets
    createdAt: new Date().toISOString(),
    processedVersions: [],
    metadata: {
      isPublicBackground: true,
      description: bg.description,
      tags: bg.tags,
    },
  };
}
