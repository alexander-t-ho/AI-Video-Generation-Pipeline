# AI Model Configuration

This directory contains centralized configuration for all AI models used in the video generation pipeline.

## Configuration File

`ai-models.ts` - Central configuration for image and video generation models

## Environment Variables

### Image Generation

```bash
# Image model (default: black-forest-labs/flux-1.1-pro)
REPLICATE_IMAGE_MODEL=black-forest-labs/flux-1.1-pro
```

### Video Generation

```bash
# Video model - supports aliases or full identifiers
REPLICATE_VIDEO_MODEL=wan2.5

# Supported aliases:
# - wan2.5, wan-2.5 → wan-video/wan-2.5-i2v-fast
# - wan2.2, wan-2.2 → wan-video/wan-2.2-i2v-fast
# - wan2.1, wan-2.1 → wan-video/wan-2.1-i2v-fast
# - luma, ray → luma/ray

# Video settings
VIDEO_DURATION=5        # 5 or 10 seconds (WAN models)
VIDEO_RESOLUTION=720p   # 720p, 1080p, or 4K
```

## Current Configuration

### Image Generation
- **Model**: FLUX 1.1 Pro
- **Provider**: Black Forest Labs
- **Type**: Text-to-image
- **Aspect Ratio**: 16:9
- **Output Format**: PNG
- **Quality**: 90

### Video Generation
- **Model**: WAN 2.5 (i2v-fast) - default
- **Provider**: Replicate
- **Type**: Image-to-video
- **Duration**: 5 seconds (configurable: 5 or 10)
- **Resolution**: 720p (configurable: 720p, 1080p, 4K)

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
# Use WAN 2.2 instead of 2.5
REPLICATE_VIDEO_MODEL=wan2.2

# Use 1080p resolution
VIDEO_RESOLUTION=1080p

# Use 10 second duration
VIDEO_DURATION=10
```

No code changes required - the configuration is automatically loaded from environment variables.

