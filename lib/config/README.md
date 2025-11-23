# AI Model Configuration

This directory contains centralized configuration for all AI models used in the video generation pipeline.

## Configuration File

`ai-models.ts` - Central configuration for image and video generation models

## Environment Variables

### Image Generation

```bash
# Image model (default: google/nano-banana-pro)
# Nano Banana Pro is optimized for image-to-image generation with precise color control
REPLICATE_IMAGE_MODEL=google/nano-banana-pro

# Image-to-Image (I2I) models for reference-based generation
# Options: google/nano-banana-pro (default), runwayml/gen4-image,
#          black-forest-labs/flux-dev, black-forest-labs/flux-1.1-pro
```

### Video Generation

```bash
# Video model - supports aliases or full identifiers (default: google/veo-3.1)
REPLICATE_VIDEO_MODEL=google/veo-3.1

# Supported aliases:
# - veo, veo-3.1 → google/veo-3.1 (default, premium quality)
# - veo-fast, veo-3.1-fast → google/veo-3.1-fast
# - wan2.5, wan-2.5 → wan-video/wan-2.5-i2v-fast
# - wan2.2, wan-2.2 → wan-video/wan-2.2-i2v-fast
# - gen4, gen4-aleph, runway-gen4 → runwayml/gen4-aleph
# - gen4-turbo, runway-gen4-turbo → runwayml/gen4-turbo
# - luma, ray → luma/ray
# - sora, sora-2-pro → openai/sora-2-pro

# Video settings
VIDEO_DURATION=8        # 4, 6, or 8 seconds (Veo models); 5 or 10 (WAN models)
VIDEO_RESOLUTION=720p   # 720p, 1080p, or 4K
```

## Current Configuration

### Image Generation
- **Model**: Nano Banana Pro (default)
- **Provider**: Google
- **Type**: Image-to-image with precise color control
- **Aspect Ratio**: 16:9
- **Output Format**: PNG
- **Quality**: 90
- **Best For**: Recoloring, color changes, and image-to-image transformations
- **Alternative Models**: Runway Gen-4 Image, FLUX 1.1 Pro, FLUX Dev

### Video Generation
- **Model**: Google Veo 3.1 (default)
- **Provider**: Google
- **Type**: Image-to-video
- **Duration**: 8 seconds (configurable: 4, 6, or 8 for Veo)
- **Resolution**: 720p (configurable: 720p, 1080p, 4K)
- **Features**: Premium quality, supports interpolation mode, reference images
- **Alternative Models**: Veo 3.1 Fast, WAN 2.5, Runway Gen-4, Luma Ray, Sora 2

## Usage

Import the configuration in your code:

```typescript
import { IMAGE_CONFIG, VIDEO_CONFIG, MODEL_INFO } from '@/lib/config/ai-models';

// Access configuration
console.log('Using video model:', VIDEO_CONFIG.model);
console.log('Video duration:', VIDEO_CONFIG.duration);
console.log('Video resolution:', VIDEO_CONFIG.resolution);
```

## Changing Models

To change models, update your `.env.local` file:

```bash
# Use FLUX 1.1 Pro instead of Nano Banana Pro for image generation
REPLICATE_IMAGE_MODEL=black-forest-labs/flux-1.1-pro

# Use WAN 2.5 instead of Veo for faster/cheaper video generation
REPLICATE_VIDEO_MODEL=wan2.5

# Use 1080p resolution
VIDEO_RESOLUTION=1080p

# Use different duration (depends on model: Veo=4/6/8, WAN=5/10)
VIDEO_DURATION=8
```

No code changes required - the configuration is automatically loaded from environment variables.

