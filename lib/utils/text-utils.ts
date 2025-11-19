/**
 * Text utility functions
 */

/**
 * Summarizes a scene description by extracting key elements
 * @param description Full scene description
 * @param maxLength Maximum length of summary (default: 60)
 * @returns Summarized description
 */
export function summarizeSceneDescription(description: string, maxLength: number = 60): string {
  if (description.length <= maxLength) {
    return description;
  }

  // Try to extract the main subject/action (usually at the start)
  // Look for patterns like "Close-up +", "Wide shot +", etc.
  const parts = description.split(' + ');
  
  if (parts.length > 0) {
    // Get the first meaningful part (skip shot type if it's generic)
    const firstPart = parts[0].trim();
    const secondPart = parts[1]?.trim() || '';
    
    // Combine first two parts if they're short enough
    const combined = secondPart 
      ? `${firstPart} + ${secondPart}`
      : firstPart;
    
    if (combined.length <= maxLength) {
      return combined;
    }
    
    // If still too long, truncate intelligently
    if (combined.length > maxLength) {
      // Try to cut at a word boundary
      const truncated = combined.substring(0, maxLength - 3);
      const lastSpace = truncated.lastIndexOf(' ');
      if (lastSpace > maxLength * 0.7) {
        return truncated.substring(0, lastSpace) + '...';
      }
      return truncated + '...';
    }
  }
  
  // Fallback: simple truncation
  return description.substring(0, maxLength - 3) + '...';
}

