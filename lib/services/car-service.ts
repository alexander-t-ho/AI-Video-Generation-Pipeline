import { CarDatabase } from '@/components/brand-identity/types';
import { mockCarDatabase } from '@/components/brand-identity/mockData';

/**
 * Car Service - Handles fetching car database from API with fallback to mock data
 */

/**
 * Fetch car database from API
 * Falls back to mock data if API is unavailable or returns no data
 */
export async function fetchCarDatabase(): Promise<CarDatabase> {
  try {
    const response = await fetch('/api/assets/cars', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    // Check if the API returned success and has data
    if (result.success && result.data && Array.isArray(result.data.variants) && result.data.variants.length > 0) {
      return result.data as CarDatabase;
    } else {
      console.warn('[CarService] API returned empty or invalid data, falling back to mock data');
      return mockCarDatabase;
    }
  } catch (error: any) {
    console.warn('[CarService] Failed to fetch car database from API, falling back to mock data:', error.message);
    return mockCarDatabase;
  }
}

/**
 * Check if S3-based car database is available
 * Useful for UI hints about data source
 */
export async function isS3CarDatabaseAvailable(): Promise<boolean> {
  try {
    const response = await fetch('/api/assets/cars', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) return false;

    const result = await response.json();
    return result.success && result.data && Array.isArray(result.data.variants) && result.data.variants.length > 0;
  } catch {
    return false;
  }
}
