export interface CarReferenceImage {
  id: string;
  url: string;
  s3Key?: string; // Optional S3 key for direct S3 access
  type: 'front' | 'side' | 'back' | 'left' | 'right' | 'tires' | 'interior' | 'detail' | 'custom';
  filename: string;
  alt: string;
}

export interface CarVariant {
  id: string;
  brand: string;
  model: string;
  year: number;
  trim: string;
  displayName: string; // e.g., "Porsche 911 Carrera (2010)"
  s3Key: string; // e.g., "porsche/911/2010/carrera/"
  referenceImages: CarReferenceImage[];
  availableColors?: string[]; // Array of hex color codes for preset colors
}

export interface CustomAsset {
  id: string;
  name: string;
  createdAt: string;
  baseCarId: string; // References the original CarVariant
  s3Key: string; // e.g., "porsche/911/2010/custom/red-variant/"
  referenceImages: CarReferenceImage[];
  adjustments: string[]; // List of adjustments made
}

export interface CarDatabase {
  variants: CarVariant[];
  customAssets: CustomAsset[];
}
