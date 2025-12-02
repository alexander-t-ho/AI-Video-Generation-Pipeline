/**
 * Prompt Updater - Updates scene prompts with asset information
 * 
 * Simple approach: Prepend asset description at top, keep "the car" in body
 */

// ============================================================================
// Types
// ============================================================================

export interface PromptUpdateResult {
  imagePrompt: string;
  videoPrompt: string;
  method: 'simple' | 'ai-rewrite' | 'unchanged';
  hasConflict: boolean;
}

export interface AssetInfo {
  description: string; // Full description: "red Porsche 911 Carrera"
  brand?: string;      // Optional: "Porsche"
  model?: string;      // Optional: "911 Carrera"
  color?: string;      // Optional: "red"
}

// ============================================================================
// Constants
// ============================================================================

const CAR_BRANDS = [
  'Porsche', 'BMW', 'Mercedes', 'Audi', 'Ferrari', 'Lamborghini',
  'Tesla', 'Ford', 'Chevrolet', 'Toyota', 'Honda', 'Nissan',
  'Lexus', 'Jaguar', 'Volvo', 'Jeep', 'Cadillac',
];

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4';

const AI_SYSTEM_PROMPT = `You are rewriting prompts to feature a specific vehicle.

Rules:
1. Start with the vehicle name (provided)
2. Replace conflicting brands with "the car"
3. Keep everything else identical
4. Keep prompts under 1500 characters
5. Output ONLY the rewritten prompt

Example:
Input: "BMW dashboard close-up"
Vehicle: "red Porsche 911"
Output: "red Porsche 911. The car's dashboard close-up"`;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if prompt mentions a conflicting car brand
 */
function hasConflictingBrand(prompt: string, assetBrand?: string): boolean {
  if (!assetBrand) return false;
  
  const lowerPrompt = prompt.toLowerCase();
  const lowerAssetBrand = assetBrand.toLowerCase();
  
  return CAR_BRANDS.some(brand => {
    const lowerBrand = brand.toLowerCase();
    return lowerBrand !== lowerAssetBrand && lowerPrompt.includes(lowerBrand);
  });
}

/**
 * Add asset description to top of prompt
 */
function prependAssetDescription(prompt: string, assetDescription: string, promptType: 'image' | 'video'): string {
  // Check if already has the description
  if (prompt.toLowerCase().startsWith(assetDescription.toLowerCase())) {
    return prompt;
  }
  
  if (promptType === 'image') {
    // Image: "red Porsche 911. [prompt]"
    return `${assetDescription}. ${prompt}`;
  } else {
    // Video: "Subject: red Porsche 911.\n\n[prompt]"
    return `Subject: ${assetDescription}.\n\n${prompt}`;
  }
}

/**
 * Use AI to rewrite prompt with asset info
 */
async function rewriteWithAI(prompt: string, assetDescription: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.warn('[PromptUpdater] No API key, skipping AI rewrite');
    return prompt; // Return original if no API key
  }

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'AI Video Generation Pipeline',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          { 
            role: 'user', 
            content: `Vehicle: "${assetDescription}"\n\nPrompt to rewrite:\n${prompt}` 
          },
        ],
        max_tokens: 1000,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || prompt;

  } catch (error) {
    console.error('[PromptUpdater] AI rewrite failed:', error);
    return prompt; // Return original on error
  }
}

/**
 * Extract color from CustomAsset
 */
function extractColor(asset: any): string | null {
  // Check adjustments for hex code
  if (asset.adjustments && Array.isArray(asset.adjustments)) {
    for (const adj of asset.adjustments) {
      const match = adj.match(/recolored to (#[0-9A-Fa-f]{6})/i);
      if (match) return hexToColorName(match[1]);
    }
  }
  
  // Check name for color in parentheses
  if (asset.name && typeof asset.name === 'string') {
    const match = asset.name.match(/\(([a-z]+)\)/i);
    if (match) {
      const color = match[1].toLowerCase();
      const validColors = ['red', 'blue', 'green', 'black', 'white', 'silver', 'gray', 'yellow', 'orange', 'purple', 'brown', 'gold'];
      if (validColors.includes(color)) return color;
    }
  }
  
  return null;
}

/**
 * Convert hex to color name (simplified)
 */
function hexToColorName(hex: string): string | null {
  const h = hex.replace('#', '').toUpperCase();
  const colorMap: Record<string, string> = {
    'FF0000': 'red', 'FF4444': 'red',
    '0000FF': 'blue', '4169E1': 'blue',
    '00FF00': 'green', '008000': 'green',
    'FFFFFF': 'white', 'F8F8FF': 'white',
    '000000': 'black', '1C1C1C': 'black',
    'C0C0C0': 'silver', 'D3D3D3': 'silver',
    '808080': 'gray', 'A9A9A9': 'gray',
    'FFFF00': 'yellow', 'FFD700': 'gold',
    'FFA500': 'orange', 'FF8C00': 'orange',
  };
  
  return colorMap[h] || null;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Update scene prompts with asset information
 */
export async function updateScenePrompts(
  imagePrompt: string,
  videoPrompt: string,
  assetInfo: AssetInfo
): Promise<PromptUpdateResult> {
  const { description, brand } = assetInfo;

  // Check if already updated
  const alreadyHasAsset = 
    imagePrompt.toLowerCase().includes(description.toLowerCase()) &&
    videoPrompt.toLowerCase().includes(description.toLowerCase());

  if (alreadyHasAsset) {
    return {
      imagePrompt,
      videoPrompt,
      method: 'unchanged',
      hasConflict: false,
    };
  }

  // Check for conflicts
  const hasConflict = 
    hasConflictingBrand(imagePrompt, brand) || 
    hasConflictingBrand(videoPrompt, brand);

  if (hasConflict) {
    // Use AI to rewrite
    console.log('[PromptUpdater] Conflict detected, using AI rewrite');
    const [updatedImagePrompt, updatedVideoPrompt] = await Promise.all([
      rewriteWithAI(imagePrompt, description),
      rewriteWithAI(videoPrompt, description),
    ]);
    
    return {
      imagePrompt: updatedImagePrompt,
      videoPrompt: updatedVideoPrompt,
      method: 'ai-rewrite',
      hasConflict: true,
    };
  } else {
    // Simple prepend
    console.log('[PromptUpdater] No conflict, using simple prepend');
    return {
      imagePrompt: prependAssetDescription(imagePrompt, description, 'image'),
      videoPrompt: prependAssetDescription(videoPrompt, description, 'video'),
      method: 'simple',
      hasConflict: false,
    };
  }
}

/**
 * Batch update multiple scenes
 */
export async function updateMultipleScenePrompts(
  scenes: Array<{ imagePrompt: string; videoPrompt: string }>,
  assetInfo: AssetInfo
): Promise<PromptUpdateResult[]> {
  console.log(`[PromptUpdater] Updating ${scenes.length} scenes with: ${assetInfo.description}`);
  
  const results = await Promise.all(
    scenes.map(scene => updateScenePrompts(scene.imagePrompt, scene.videoPrompt, assetInfo))
  );

  // Log summary
  const stats = {
    simple: results.filter(r => r.method === 'simple').length,
    aiRewrite: results.filter(r => r.method === 'ai-rewrite').length,
    unchanged: results.filter(r => r.method === 'unchanged').length,
  };
  console.log('[PromptUpdater] Complete:', stats);

  return results;
}

/**
 * Build asset description from car object
 */
export function buildAssetDescription(selectedCar: any): string {
  // Get base name
  let baseName = '';
  if ('brand' in selectedCar && 'model' in selectedCar) {
    baseName = selectedCar.displayName || `${selectedCar.brand} ${selectedCar.model}`;
  } else if ('name' in selectedCar) {
    // Remove hex codes and color suffixes
    baseName = selectedCar.name
      .replace(/\s*\(#[0-9A-Fa-f]{6}\)/g, '')
      .replace(/\s*\([a-z]+\)\s*$/i, '')
      .trim();
  } else {
    return 'vehicle';
  }

  // Add color for CustomAssets only
  if ('adjustments' in selectedCar) {
    const color = extractColor(selectedCar);
    if (color && !baseName.toLowerCase().includes(color)) {
      return `${color} ${baseName}`;
    }
  }

  return baseName;
}

/**
 * Parse asset info from car object
 */
export function parseAssetInfo(selectedCar: any): AssetInfo {
  const description = buildAssetDescription(selectedCar);
  const assetInfo: AssetInfo = { description };

  if ('brand' in selectedCar) assetInfo.brand = selectedCar.brand;
  if ('model' in selectedCar) assetInfo.model = selectedCar.model;
  
  if ('adjustments' in selectedCar) {
    assetInfo.color = extractColor(selectedCar) || undefined;
  }

  return assetInfo;
}
