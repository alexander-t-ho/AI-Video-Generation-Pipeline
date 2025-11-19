# AI Video Generation Pipeline

An end-to-end AI video generation pipeline that converts user prompts into professional-quality video advertisements.

## Overview

This project generates 5-scene video advertisements from text prompts using AI-powered storyboard generation, image creation, and video synthesis. Users can upload reference images to guide the visual style and aesthetic of generated content.

### Key Features

- **AI Storyboard Generation**: Automatically creates 5-scene storyboards from text prompts using GPT-4o
- **Reference Image Support**: Upload images to guide visual style and aesthetic
- **Image Generation**: Generate high-quality images for each scene using Flux Schnell
- **Video Generation**: Create videos from images using Luma Ray (Dream Machine)
- **Frame Extraction**: Extract seed frames from videos for visual continuity
- **Video Stitching**: Combine multiple scenes into a single cohesive video
- **Interactive Workspace**: Three-panel interface with storyboard, editor, and timeline views

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **State Management**: Zustand
- **Storage**: Local filesystem (temp) + AWS S3 (production ready)
- **Image Upload**: Local storage with S3 support
- **Video Processing**: FFmpeg (server-side)
- **AI Services**:
  - **Storyboard**: OpenAI GPT-4o (via OpenRouter)
  - **Images**: Flux Schnell (via Replicate)
  - **Videos**: Luma Ray (via Replicate)
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

- [Product Requirements Document](docs/prd.md) - Complete PRD with specifications
- [API Contracts](docs/API_CONTRACTS_IMAGE_STORYBOARD.md) - API endpoint documentation
- [Architecture Analysis](docs/ARCHITECTURE_ANALYSIS.md) - System architecture and deployment
- [Integration Tasks](docs/FRONTEND_BACKEND_INTEGRATION_TASKS.md) - Integration status
- [Testing Guide](tests/README.md) - E2E testing documentation

## Workflow

1. **Project Creation**: User enters prompt and optionally uploads reference images
2. **Storyboard Generation**: AI generates 5 scenes with descriptions and image prompts
3. **Image Generation**: Generate images for each scene (user can regenerate)
4. **Video Generation**: Create videos from approved images (sequential, using seed frames)
5. **Frame Extraction**: Extract candidate frames from each video's final 0.5s
6. **Seed Frame Selection**: User selects frame to use as seed for next scene
7. **Video Stitching**: Combine all scenes into final video
8. **Export**: Download final video

## License

MIT

