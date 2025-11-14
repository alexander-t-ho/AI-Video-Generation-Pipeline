# Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Next.js Application                              │
│                         (App Router)                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
         ┌──────────▼──────────┐        ┌──────────▼──────────┐
         │   API Routes        │        │   Frontend (Future) │
         │   /app/api/         │        │   /app/              │
         └──────────┬──────────┘        └─────────────────────┘
                    │
    ┌───────────────┼───────────────┬───────────────┐
    │               │               │               │
┌───▼───┐    ┌──────▼──────┐  ┌────▼────┐  ┌───────▼──────┐
│Story- │    │   Image     │  │  Test   │  │   Test       │
│board  │    │ Generation  │  │ Endpts  │  │  Endpoints   │
└───┬───┘    └──────┬──────┘  └─────────┘  └──────────────┘
    │               │
    │      ┌────────┴────────┐
    │      │                 │
┌───▼───┐ ┌▼──────────┐ ┌────▼──────┐
│Story- │ │  Image    │ │  Image    │
│board  │ │ Generator │ │  Status   │
│Gen    │ │  (Start)  │ │  (Poll)   │
└───┬───┘ └────┬──────┘ └─────┬─────┘
    │          │              │
    │          └──────┬────────┘
    │                 │
┌───▼─────────────────▼───────────────────────────────────┐
│              Core Libraries                              │
│  ┌──────────────────────────────────────────────────┐  │
│  │  lib/ai/storyboard-generator.ts                   │  │
│  │  - generateStoryboard()                          │  │
│  │  - createErrorResponse()                          │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  lib/ai/image-generator.ts                       │  │
│  │  - createImagePredictionWithRetry()              │  │
│  │  - pollReplicateStatus()                         │  │
│  │  - downloadAndSaveImage()                        │  │
│  │  - generateImage() (orchestrator)                │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  lib/types.ts                                    │  │
│  │  - Scene, StoryboardRequest/Response             │  │
│  │  - ImageGenerationRequest/Response               │  │
│  │  - GeneratedImage, ErrorCode                     │  │
│  └──────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
    │                      │
    │                      │
┌───▼──────────────────────▼───────────────────────────────┐
│              External Services                            │
│                                                            │
│  ┌──────────────────┐        ┌──────────────────┐        │
│  │   OpenRouter     │        │    Replicate      │        │
│  │   (GPT-4o)      │        │  (Flux-schnell)   │        │
│  │                 │        │                  │        │
│  │  Storyboard     │        │  Image Gen       │        │
│  │  Generation     │        │  (Async Polling) │        │
│  └──────────────────┘        └──────────────────┘        │
│                                                            │
│  ┌──────────────────┐        ┌──────────────────┐        │
│  │   AWS S3         │        │   Local Storage  │        │
│  │   (Future)       │        │   /tmp/projects/  │        │
│  │                  │        │                  │        │
│  │  File Storage    │        │  Dev/Testing     │        │
│  └──────────────────┘        └──────────────────┘        │
└────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### Production Endpoints

#### 1. Storyboard Generation
```
POST /api/storyboard
```
**Purpose**: Generate 5-scene storyboard from user prompt

**Request**:
```json
{
  "prompt": "A sleek smartphone with advanced features",
  "targetDuration": 15  // Optional: 15, 30, or 60 seconds
}
```

**Response**:
```json
{
  "success": true,
  "scenes": [
    {
      "id": "uuid",
      "order": 0,
      "description": "Scene description",
      "imagePrompt": "Detailed visual prompt",
      "suggestedDuration": 3
    },
    // ... 4 more scenes
  ]
}
```

**Flow**:
```
Client → POST /api/storyboard
       → storyboard-generator.ts
       → OpenRouter API (GPT-4o)
       → Parse & Validate
       → Return 5 scenes
```

---

#### 2. Image Generation (Start)
```
POST /api/generate-image
```
**Purpose**: Start image generation job, returns immediately with prediction ID

**Request**:
```json
{
  "prompt": "A sleek smartphone...",
  "projectId": "project-uuid",
  "sceneIndex": 0,
  "seedImage": "https://..."  // Optional: for image-to-image
}
```

**Response**:
```json
{
  "success": true,
  "predictionId": "abc123...",
  "status": "starting"
}
```

**Flow**:
```
Client → POST /api/generate-image
       → image-generator.ts::createImagePredictionWithRetry()
       → Replicate API (Flux-schnell)
       → Return predictionId immediately
       → Client polls for status
```

---

#### 3. Image Generation (Status Poll)
```
GET /api/generate-image/[predictionId]
```
**Purpose**: Poll for image generation status and auto-download when ready

**Query Params** (Optional):
- `projectId`: Project ID for auto-download
- `sceneIndex`: Scene index for auto-download
- `prompt`: Prompt for metadata

**Response** (Processing):
```json
{
  "success": true,
  "status": "processing",
  "progress": 0.5
}
```

**Response** (Complete):
```json
{
  "success": true,
  "status": "succeeded",
  "image": {
    "id": "uuid",
    "url": "/tmp/projects/.../scene-0-xxx.png",
    "localPath": "/full/path/to/image.png",
    "prompt": "...",
    "replicateId": "abc123...",
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

**Flow**:
```
Client → GET /api/generate-image/[predictionId]
       → image-generator.ts::pollReplicateStatus()
       → Replicate API (check status)
       → If succeeded: downloadAndSaveImage()
       → Return image metadata
```

---

### Development/Test Endpoints

#### 4. Test FFmpeg
```
GET /api/test-ffmpeg
```
**Purpose**: Verify FFmpeg is available (for video processing)

**Response**:
```json
{
  "success": true,
  "message": "FFmpeg is working!",
  "version": "ffmpeg version 6.0...",
  "path": "/usr/bin/ffmpeg"
}
```

---

#### 5. Test API Keys
```
GET /api/test-keys
```
**Purpose**: Verify all API keys are configured correctly

**Response**:
```json
{
  "REPLICATE_API_TOKEN": {
    "set": true,
    "valid": true
  },
  "OPENROUTER_API_KEY": {
    "set": true,
    "valid": true
  },
  "AWS_ACCESS_KEY_ID": {
    "set": true,
    "valid": true
  },
  // ... more keys
}
```

---

#### 6. Test OpenRouter
```
GET /api/test-openrouter
```
**Purpose**: Test OpenRouter API connection and key validity

**Response**:
```json
{
  "success": true,
  "message": "OpenRouter API key is valid",
  "keyFormat": "sk-or-v1-...",
  "testResponse": {
    "model": "openai/gpt-4o",
    "usage": { ... }
  }
}
```

---

## Data Flow

### Complete Storyboard → Image Generation Flow

```
┌─────────┐
│ Client  │
└────┬────┘
     │
     │ 1. POST /api/storyboard
     │    { prompt: "..." }
     ▼
┌─────────────────────┐
│ /api/storyboard     │
│ route.ts            │
└────┬────────────────┘
     │
     │ 2. generateStoryboard()
     ▼
┌─────────────────────┐
│ storyboard-         │
│ generator.ts        │
└────┬────────────────┘
     │
     │ 3. HTTP Request
     ▼
┌─────────────────────┐
│ OpenRouter API      │
│ (GPT-4o)            │
└────┬────────────────┘
     │
     │ 4. JSON Response
     ▼
┌─────────────────────┐
│ Parse & Validate    │
│ 5 Scenes            │
└────┬────────────────┘
     │
     │ 5. Return Scenes
     ▼
┌─────────┐
│ Client  │
└────┬────┘
     │
     │ 6. For each scene:
     │    POST /api/generate-image
     │    { prompt, projectId, sceneIndex }
     ▼
┌─────────────────────┐
│ /api/generate-image │
│ route.ts            │
└────┬────────────────┘
     │
     │ 7. createImagePredictionWithRetry()
     ▼
┌─────────────────────┐
│ image-generator.ts  │
└────┬────────────────┘
     │
     │ 8. HTTP Request
     ▼
┌─────────────────────┐
│ Replicate API      │
│ (Flux-schnell)     │
└────┬────────────────┘
     │
     │ 9. Return predictionId
     ▼
┌─────────┐
│ Client  │
└────┬────┘
     │
     │ 10. Poll every 2s:
     │     GET /api/generate-image/[predictionId]
     ▼
┌─────────────────────────────┐
│ /api/generate-image/        │
│ [predictionId]/route.ts      │
└────┬────────────────────────┘
     │
     │ 11. pollReplicateStatus()
     ▼
┌─────────────────────┐
│ Replicate API       │
│ (Check Status)      │
└────┬────────────────┘
     │
     │ 12. If succeeded:
     │     downloadAndSaveImage()
     ▼
┌─────────────────────┐
│ Download Image      │
│ Save to /tmp/       │
└────┬────────────────┘
     │
     │ 13. Return GeneratedImage
     ▼
┌─────────┐
│ Client  │
└─────────┘
```

---

## Component Details

### Core Libraries

#### `lib/ai/storyboard-generator.ts`
- **generateStoryboard(prompt, targetDuration)**: Main function
  - Calls OpenRouter API with GPT-4o
  - Parses JSON response
  - Validates 5 scenes
  - Returns Scene[]
- **createErrorResponse(error)**: Error handling
- **Retry logic**: Automatic retry on rate limits

#### `lib/ai/image-generator.ts`
- **createImagePredictionWithRetry(prompt, seedImage?)**: Start prediction
  - Creates Replicate prediction
  - Retry logic for failures
  - Returns predictionId
  
- **pollReplicateStatus(predictionId)**: Poll for completion
  - Polls every 2 seconds
  - Max 15 attempts (30 seconds)
  - Returns image URL when ready
  
- **downloadAndSaveImage(imageUrl, projectId, sceneIndex)**: Save image
  - Downloads from URL
  - Saves to `/tmp/projects/{projectId}/images/scene-{sceneIndex}-{uuid}.png`
  - Returns GeneratedImage object
  
- **generateImage(prompt, projectId, sceneIndex, seedImage?)**: Orchestrator
  - Combines all steps above
  - Full flow: create → poll → download → save

#### `lib/types.ts`
- **Scene**: Storyboard scene structure
- **StoryboardRequest/Response**: API types
- **ImageGenerationRequest/Response**: API types
- **GeneratedImage**: Image metadata
- **ErrorCode**: Standardized error codes

---

## External Services

### OpenRouter (GPT-4o)
- **Purpose**: Storyboard generation
- **Model**: `openai/gpt-4o`
- **Endpoint**: `https://openrouter.ai/api/v1/chat/completions`
- **Auth**: Bearer token (`OPENROUTER_API_KEY`)
- **Response Time**: < 10 seconds
- **Rate Limits**: Handled with retry logic

### Replicate (Flux-schnell)
- **Purpose**: Image generation
- **Model**: `black-forest-labs/flux-schnell`
- **Endpoint**: Replicate API
- **Auth**: API token (`REPLICATE_API_TOKEN`)
- **Response Time**: 2-5 seconds (async, polling required)
- **Pattern**: Start job → Poll for status → Download result

### AWS S3 (Future)
- **Purpose**: File storage for production
- **Current**: Local `/tmp/` storage (ephemeral)
- **Future**: Upload images/videos to S3
- **Credentials**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`

---

## File Structure

```
app/
├── api/
│   ├── storyboard/
│   │   └── route.ts              # POST /api/storyboard
│   ├── generate-image/
│   │   ├── route.ts              # POST /api/generate-image
│   │   └── [predictionId]/
│   │       └── route.ts          # GET /api/generate-image/[id]
│   ├── test-ffmpeg/
│   │   └── route.ts              # GET /api/test-ffmpeg
│   ├── test-keys/
│   │   └── route.ts              # GET /api/test-keys
│   └── test-openrouter/
│       └── route.ts              # GET /api/test-openrouter

lib/
├── ai/
│   ├── storyboard-generator.ts   # Storyboard generation logic
│   └── image-generator.ts        # Image generation logic
└── types.ts                      # Shared TypeScript types

scripts/
├── test-storyboard.ts            # Test storyboard generation
└── test-image-generation.ts      # Test image generation

tmp/
└── projects/
    └── {projectId}/
        └── images/
            └── scene-{index}-{uuid}.png
```

---

## Error Handling

### Error Codes
- `INVALID_REQUEST`: Bad input (400)
- `PREDICTION_FAILED`: Replicate error (500)
- `POLLING_FAILED`: Status check failed (500)
- `RATE_LIMIT`: Too many requests (503)
- `AUTHENTICATION_FAILED`: API key issue (500)
- `NETWORK_ERROR`: Connection issue (503)
- `TIMEOUT`: Operation timeout (503)
- `DOWNLOAD_FAILED`: File download failed (500)

### Retry Logic
- **Storyboard**: Automatic retry on rate limits (exponential backoff)
- **Image Generation**: Retry on prediction creation failures
- **Polling**: Max 15 attempts (30 seconds total)

---

## Environment Variables

```bash
# OpenRouter (Storyboard Generation)
OPENROUTER_API_KEY=sk-or-v1-...

# Replicate (Image Generation)
REPLICATE_API_TOKEN=r8_...

# AWS S3 (Future - File Storage)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=...

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Deployment Status

### ✅ Completed
- [x] Storyboard generation API
- [x] Image generation API (start + poll)
- [x] Error handling & retry logic
- [x] TypeScript types
- [x] Test endpoints
- [x] Local file storage

### 🚧 In Progress / Future
- [ ] Video generation API
- [ ] Frame extraction API
- [ ] Video stitching API
- [ ] S3 integration
- [ ] Frontend UI
- [ ] Production deployment

---

## Notes

- **Polling Pattern**: Image generation uses async polling (not waiting in API route)
- **Local Storage**: Currently using `/tmp/` (ephemeral, cleared between invocations)
- **S3 Migration**: Future work to move to S3 for persistence
- **Test Endpoints**: Should be removed or protected before production
- **FFmpeg**: Test endpoint exists but video processing not yet implemented

---

**Last Updated**: Based on current implementation status

