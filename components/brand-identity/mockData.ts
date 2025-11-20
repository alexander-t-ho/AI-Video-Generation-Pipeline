import { CarDatabase, CarVariant, CarReferenceImage, CustomAsset } from './types';

/**
 * @deprecated This mock data is now used as fallback when S3-based car assets are unavailable.
 * The application now dynamically loads car data from S3 via the car service.
 * This file is kept for type references and fallback scenarios.
 */
export const mockCarDatabase: CarDatabase = {
  variants: [
    {
      id: 'porsche-911-2010-carrera',
      brand: 'Porsche',
      model: '911',
      year: 2010,
      trim: 'Carrera',
      displayName: 'Porsche 911 Carrera (2010)',
      s3Key: 'porsche/911/2010/carrera/',
      availableColors: ['#000000', '#C0C0C0', '#FF0000', '#0000FF', '#FFFFFF', '#FFFF00'],
      referenceImages: [
        {
          id: 'p911-2010-front',
          url: 'https://images.unsplash.com/photo-1544829099-b9a0e3421cdb?w=800&q=80',
          type: 'front',
          filename: 'front.jpg',
          alt: 'Porsche 911 Carrera 2010 - Front View'
        },
        {
          id: 'p911-2010-side',
          url: 'https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=800&q=80',
          type: 'side',
          filename: 'side.jpg',
          alt: 'Porsche 911 Carrera 2010 - Side View'
        },
        {
          id: 'p911-2010-back',
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80',
          type: 'back',
          filename: 'back.jpg',
          alt: 'Porsche 911 Carrera 2010 - Rear View'
        },
        {
          id: 'p911-2010-interior',
          url: 'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800&q=80',
          type: 'interior',
          filename: 'interior.jpg',
          alt: 'Porsche 911 Carrera 2010 - Interior'
        },
        {
          id: 'p911-2010-tires',
          url: 'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=800&q=80',
          type: 'tires',
          filename: 'tires.jpg',
          alt: 'Porsche 911 Carrera 2010 - Tire Detail'
        }
      ]
    },
    {
      id: 'porsche-911-2015-carrera-s',
      brand: 'Porsche',
      model: '911',
      year: 2015,
      trim: 'Carrera S',
      displayName: 'Porsche 911 Carrera S (2015)',
      s3Key: 'porsche/911/2015/carrera-s/',
      availableColors: ['#000000', '#C0C0C0', '#FF0000', '#0000FF', '#FFFFFF', '#FFFF00', '#FFA500', '#800080'],
      referenceImages: [
        {
          id: 'p911-2015-front',
          url: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80',
          type: 'front',
          filename: 'front.jpg',
          alt: 'Porsche 911 Carrera S 2015 - Front View'
        },
        {
          id: 'p911-2015-side',
          url: 'https://images.unsplash.com/photo-1494905998402-395d579af36f?w=800&q=80',
          type: 'side',
          filename: 'side.jpg',
          alt: 'Porsche 911 Carrera S 2015 - Side View'
        },
        {
          id: 'p911-2015-back',
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80',
          type: 'back',
          filename: 'back.jpg',
          alt: 'Porsche 911 Carrera S 2015 - Rear View'
        },
        {
          id: 'p911-2015-detail',
          url: 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&q=80',
          type: 'detail',
          filename: 'detail.jpg',
          alt: 'Porsche 911 Carrera S 2015 - Engine Detail'
        }
      ]
    },
    {
      id: 'porsche-911-2018-gt3',
      brand: 'Porsche',
      model: '911',
      year: 2018,
      trim: 'GT3',
      displayName: 'Porsche 911 GT3 (2018)',
      s3Key: 'porsche/911/2018/gt3/',
      availableColors: ['#000000', '#C0C0C0', '#FF0000', '#FFFFFF', '#FFFF00'],
      referenceImages: [
        {
          id: 'p911-2018-front',
          url: 'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800&q=80',
          type: 'front',
          filename: 'front.jpg',
          alt: 'Porsche 911 GT3 2018 - Front View'
        },
        {
          id: 'p911-2018-side',
          url: 'https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=800&q=80',
          type: 'side',
          filename: 'side.jpg',
          alt: 'Porsche 911 GT3 2018 - Side View'
        },
        {
          id: 'p911-2018-back',
          url: 'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=800&q=80',
          type: 'back',
          filename: 'back.jpg',
          alt: 'Porsche 911 GT3 2018 - Rear View'
        }
      ]
    },
    {
      id: 'porsche-911-2022-turbo-s',
      brand: 'Porsche',
      model: '911',
      year: 2022,
      trim: 'Turbo S',
      displayName: 'Porsche 911 Turbo S (2022)',
      s3Key: 'porsche/911/2022/turbo-s/',
      availableColors: ['#000000', '#C0C0C0', '#FF0000', '#0000FF', '#FFFFFF', '#FFFF00', '#FFA500'],
      referenceImages: [
        {
          id: 'p911-2022-front',
          url: 'https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=800&q=80',
          type: 'front',
          filename: 'front.jpg',
          alt: 'Porsche 911 Turbo S 2022 - Front View'
        },
        {
          id: 'p911-2022-side',
          url: 'https://images.unsplash.com/photo-1494905998402-395d579af36f?w=800&q=80',
          type: 'side',
          filename: 'side.jpg',
          alt: 'Porsche 911 Turbo S 2022 - Side View'
        },
        {
          id: 'p911-2022-interior',
          url: 'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800&q=80',
          type: 'interior',
          filename: 'interior.jpg',
          alt: 'Porsche 911 Turbo S 2022 - Interior'
        }
      ]
    }
  ],
  customAssets: [] // Empty for now - will be populated when user makes adjustments
};
