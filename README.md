# AI Video Generation Pipeline

An end-to-end AI video generation pipeline that converts user prompts into professional-quality video advertisements.

## Overview

This project generates professional video advertisements from text prompts using AI-powered storyboard generation, image creation, and video synthesis. Users can upload reference images to guide the visual style and aesthetic of generated content.

### Key Features

- **AI Storyboard Generation**: Automatically creates 3-scene storyboards from text prompts using GPT-4o (optimized for 15/30/60 second videos)
- **Reference Image Support**: Upload and manage brand assets (logos, car models, reference images) for visual consistency
- **Intelligent Image Generation**:
  - Scene 0: Uses Runway Gen-4 Image with reference images for maximum object consistency
  - Scenes 1-4: Uses FLUX Dev with IP-Adapter for style transfer and continuity
  - Supports custom image inputs and seed frames for visual coherence
- **Advanced Video Generation**: Create videos using Google Veo 3.1 with support for reference images and last-frame continuity
- **Frame Extraction**: Automatically extract 5 seed frames from the last second of each video for scene-to-scene continuity
- **Video Stitching**: Combine multiple scenes with automatic transition detection (SSIM-based similarity analysis for smooth fades/crossfades)
- **Interactive Workspace**: Three-panel interface with media drawer, editor, and timeline views
- **Timeline Editing**: Split, crop, delete, and reorder clips with undo/redo support
- **Brand Identity Management**: Manage company assets, car models, and color schemes
- **Model Flexibility**: Runtime model selection via Dev Panel (9 text models, 27 image models, 17 video models)

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **State Management**: Zustand
- **Storage**: Local filesystem (temp) + AWS S3 (production ready)
- **Image Upload**: Local storage with S3 support
- **Video Processing**: FFmpeg (server-side)
- **AI Services**:
  - **Storyboard**: OpenAI GPT-4o or GPT-4o Mini (via OpenRouter or direct OpenAI API)
  - **Images**:
    - FLUX Schnell (T2I default)
    - FLUX Dev with IP-Adapter (I2I default for scenes 1-4)
    - Runway Gen-4 Image (Scene 0 with reference images)
    - 25+ alternative models available
  - **Videos**:
    - Google Veo 3.1 (default - supports reference_images + last_frame)
    - Runway Gen-4 Turbo, Gen-4 Aleph (alternatives)
    - 15+ alternative models available
- **Deployment**: Vercel
- **Testing**: Playwright (E2E tests)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- API keys for:
  - Replicate (for image and video generation)
  - OpenRouter (for storyboard generation)
  - AWS S3 (optional, for production storage)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd AI-Video-Generation-Pipeline
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Edit `.env.local` and add your API keys:
```env
REPLICATE_API_TOKEN=your_replicate_token
OPENROUTER_API_KEY=your_openrouter_key
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_S3_BUCKET=your_bucket_name
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── storyboard/    # Storyboard generation
│   │   ├── generate-image/# Image generation
│   │   ├── generate-video/# Video generation
│   │   ├── extract-frames/# Frame extraction
│   │   ├── stitch-videos/ # Video stitching
│   │   └── upload-images/ # Image upload
│   ├── components/        # React components
│   └── workspace/         # Workspace page
├── components/            # Shared components
│   └── workspace/         # Workspace-specific components
├── lib/                   # Core libraries
│   ├── ai/               # AI service integrations
│   ├── api-client.ts     # API client utilities
│   ├── hooks/            # React hooks
│   ├── state/            # State management (Zustand)
│   ├── storage/          # Storage abstractions
│   ├── types.ts          # TypeScript types
│   └── video/            # Video processing utilities
├── tests/                # Playwright E2E tests
├── scripts/              # Utility scripts
└── docs/                 # Documentation
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run test:e2e` - Run all E2E tests
- `npm run test:e2e:ui` - Run tests with Playwright UI
- `npm run test:e2e:headed` - Run tests in headed mode
- `npm run test:e2e:debug` - Run tests in debug mode
- `npm run test:core` - Run core workflow tests
- `npm run test:image` - Test image generation
- `npm run test:storyboard` - Test storyboard generation

## API Endpoints

### Storyboard Generation
- `POST /api/storyboard` - Generate 5-scene storyboard from prompt
- `GET /api/storyboard` - Health check

### Image Generation
- `POST /api/generate-image` - Start image generation
- `GET /api/generate-image/[predictionId]` - Poll image generation status

### Video Generation
- `POST /api/generate-video` - Start video generation
- `GET /api/generate-video/[predictionId]` - Poll video generation status

### Frame Extraction
- `POST /api/extract-frames` - Extract seed frames from video

### Video Stitching
- `POST /api/stitch-videos` - Stitch multiple videos into one

### Image Upload
- `POST /api/upload-images` - Upload reference images

See [docs/API_CONTRACTS_IMAGE_STORYBOARD.md](docs/API_CONTRACTS_IMAGE_STORYBOARD.md) for detailed API documentation.

## Testing

The project includes comprehensive E2E tests using Playwright:

- **Full Workflow Tests**: Complete end-to-end video generation
- **Component Tests**: Individual feature testing
- **Error Handling**: Error state validation
- **Performance**: Load time and responsiveness

Run tests:
```bash
npm run test:e2e
```

See [tests/README.md](tests/README.md) for detailed testing documentation.

## Environment Variables

Create a `.env.local` file with the following variables (see `.env.example` for reference):

### Required
- `REPLICATE_API_TOKEN` - For image and video generation via Replicate
- `OPENROUTER_API_KEY` - For storyboard generation via OpenRouter

### Optional (for S3 storage)
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `AWS_S3_BUCKET` - S3 bucket name

**Note**: Never commit API keys or sensitive information to the repository.

## Deployment

### Railway Deployment

The project is configured for Railway deployment:

1. Push to `main` branch (auto-deploys)
2. Set environment variables in Railway dashboard
3. Railway automatically provisions PostgreSQL database
4. Monitor deployment and logs in Railway dashboard

See [docs/ARCHITECTURE_ANALYSIS.md](docs/ARCHITECTURE_ANALYSIS.md) for deployment considerations.

## Documentation

- [QA Report](QA_REPORT.md) - **Comprehensive QA analysis with 23 identified issues (5 critical)**
- [Product Requirements Document](docs/prd.md) - Complete PRD with specifications
- [API Contracts](docs/API_CONTRACTS_IMAGE_STORYBOARD.md) - API endpoint documentation
- [Architecture Analysis](docs/ARCHITECTURE_ANALYSIS.md) - System architecture and deployment
- [Integration Tasks](docs/FRONTEND_BACKEND_INTEGRATION_TASKS.md) - Integration status
- [Testing Guide](tests/README.md) - E2E testing documentation

## Workflow

### Standard Workflow
1. **Project Creation**: User enters prompt and selects target duration (15/30/60 seconds)
2. **Brand Identity** (Optional): Select reference images, car models, and brand assets for object consistency
3. **Storyboard Generation**: AI generates 3 scenes with descriptions, image prompts, and video prompts
4. **Scene-by-Scene Generation**:
   - **Image Generation**: Generate 3 image variations per scene
     - Scene 0: Uses Gen-4 Image + reference images for maximum consistency
     - Scenes 1-2: Uses FLUX Dev + IP-Adapter with seed frames from previous scene
   - **Image Selection**: User selects best image from the 3 variations
   - **Video Generation**: Create video from selected image using Google Veo 3.1
   - **Frame Extraction**: Automatically extract 5 frames from last 1 second of video
   - **Seed Frame Selection**: User selects best frame for next scene (default: first frame)
5. **Timeline Editing** (Optional): Split, crop, delete, or reorder clips in timeline view
6. **Video Stitching**: Combine all scene videos with automatic smooth transitions (SSIM-based)
7. **Export**: Download final MP4 video

### Advanced Features
- **Custom Image Input**: Upload custom images as seed for any scene
- **Prompt Editing**: Edit image/video prompts, negative prompts, and durations per scene
- **Model Selection**: Override default models via Dev Panel for testing different AI models
- **Multi-tenant Support**: Company-based asset sharing and user management

## License

MIT

