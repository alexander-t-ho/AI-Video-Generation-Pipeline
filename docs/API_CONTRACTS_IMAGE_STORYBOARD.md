# API Contracts - Person 1: Storyboard & Image Generation

## Overview

This document defines the API contracts for storyboard generation and image generation endpoints. These contracts are the interface between Person 1 (Backend - AI APIs) and Person 3 (Frontend).

**Last Updated**: Initial version  
**Status**: Draft (will be finalized by Hour 2)

---

## Base URL

```
Local: http://localhost:3000
Production: https://your-app.vercel.app
```

---

## Authentication

All API routes are currently unauthenticated (internal APIs). Future versions may require API keys.

---

## Storyboard Generation API

### Generate Storyboard

**Endpoint**: `POST /api/storyboard`

**Description**: Generates a 5-scene storyboard from a user prompt using OpenAI GPT-4o via OpenRouter.

**Request**:
```typescript
{
  prompt: string;           // Required: User's product/ad description
  targetDuration?: number;  // Optional: Target video duration in seconds (15, 30, or 60)
                           // Default: 15
}
```

**Example Request**:
```json
{
  "prompt": "Create a luxury watch advertisement with golden hour lighting and elegant models",
  "targetDuration": 15
}
```

**Success Response** (200 OK):
```typescript
{
  success: true;
  scenes: Scene[];
}

// Where Scene is:
interface Scene {
  id: string;                // UUID v4
  order: number;             // Scene order: 0-4
  description: string;       // Narrative description of the scene
  imagePrompt: string;       // Detailed visual prompt for image generation
  suggestedDuration: number; // Suggested duration in seconds (2-4)
}
```

**Example Success Response**:
```json
{
  "success": true,
  "scenes": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "order": 0,
      "description": "Opening shot establishing the luxury watch",
      "imagePrompt": "Professional product photography of luxury watch, golden hour lighting, elegant composition, minimalist aesthetic, 16:9 aspect ratio, high-end commercial style",
      "suggestedDuration": 3
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "order": 1,
      "description": "Close-up of watch details and craftsmanship",
      "imagePrompt": "Extreme close-up of luxury watch face, intricate details, golden hour lighting, shallow depth of field, premium materials visible, 16:9 aspect ratio",
      "suggestedDuration": 3
    },
    // ... 3 more scenes
  ]
}
```

**Error Responses**:

**400 Bad Request** - Invalid request:
```json
{
  "success": false,
  "error": "Missing required field: prompt",
  "code": "INVALID_REQUEST"
}
```

**500 Internal Server Error** - OpenRouter API failure:
```json
{
  "success": false,
  "error": "Failed to generate storyboard: OpenRouter API error",
  "code": "GENERATION_FAILED",
  "retryable": true
}
```

**503 Service Unavailable** - Rate limit:
```json
{
  "success": false,
  "error": "Rate limit exceeded. Please try again in 60 seconds.",
  "code": "RATE_LIMIT",
  "retryable": true
}
```

**Performance**:
- Expected response time: < 10 seconds
- Retry logic: 3 attempts with exponential backoff

---

## Image Generation API

### Create Image Generation

**Endpoint**: `POST /api/generate-image`

**Description**: Initiates image generation using Replicate Flux-schnell model. Returns immediately with a prediction ID for polling.

**Request**:
```typescript
{
  prompt: string;        // Required: Image generation prompt
  projectId: string;     // Required: Project ID for file organization
  sceneIndex: number;    // Required: Scene index (0-4)
  seedImage?: string;    // Optional: URL to seed image for image-to-image generation
}
```

**Example Request** (Scene 0 - no seed):
```json
{
  "prompt": "Professional product photography of luxury watch, golden hour lighting, elegant composition",
  "projectId": "proj-123abc",
  "sceneIndex": 0
}
```

**Example Request** (Scene 1 - with seed):
```json
{
  "prompt": "Extreme close-up of luxury watch face, intricate details, golden hour lighting",
  "projectId": "proj-123abc",
  "sceneIndex": 1,
  "seedImage": "https://example.com/seed-frame.png"
}
```

**Success Response** (200 OK):
```typescript
{
  success: true;
  predictionId: string;  // Replicate prediction ID for polling
  status: 'starting' | 'processing';
}
```

**Example Success Response**:
```json
{
  "success": true,
  "predictionId": "abc123def456",
  "status": "starting"
}
```

**Error Responses**:

**400 Bad Request** - Invalid request:
```json
{
  "success": false,
  "error": "Missing required field: projectId",
  "code": "INVALID_REQUEST"
}
```

**500 Internal Server Error** - Replicate API failure:
```json
{
  "success": false,
  "error": "Failed to create image prediction",
  "code": "PREDICTION_FAILED",
  "retryable": true
}
```

**Performance**:
- Expected response time: < 2 seconds (just creates prediction)
- Client should poll status endpoint every 2 seconds

---

### Poll Image Generation Status

**Endpoint**: `GET /api/generate-image/[predictionId]`

**Description**: Polls the status of an image generation prediction.

**URL Parameters**:
- `predictionId` (string): The prediction ID returned from POST request

**Example Request**:
```
GET /api/generate-image/abc123def456
```

**Response** (200 OK):
```typescript
{
  success: true;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  image?: GeneratedImage;  // Only present when status === 'succeeded'
  error?: string;          // Only present when status === 'failed'
  progress?: number;       // Optional: 0-100 if available
}

// Where GeneratedImage is:
interface GeneratedImage {
  id: string;               // UUID v4
  url: string;              // Local file path (for internal use)
  localPath: string;        // Full local file path
  prompt: string;           // Prompt used for generation
  replicateId: string;      // Replicate prediction ID
  createdAt: string;        // ISO 8601 timestamp
}
```

**Example Response** (Processing):
```json
{
  "success": true,
  "status": "processing",
  "progress": 45
}
```

**Example Response** (Succeeded):
```json
{
  "success": true,
  "status": "succeeded",
  "image": {
    "id": "img-550e8400-e29b-41d4-a716-446655440000",
    "url": "/tmp/projects/proj-123abc/images/scene-0-img-550e8400.png",
    "localPath": "/tmp/projects/proj-123abc/images/scene-0-img-550e8400.png",
    "prompt": "Professional product photography of luxury watch...",
    "replicateId": "abc123def456",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Example Response** (Failed):
```json
{
  "success": false,
  "status": "failed",
  "error": "Image generation failed: Invalid prompt"
}
```

**Error Responses**:

**404 Not Found** - Prediction ID not found:
```json
{
  "success": false,
  "error": "Prediction not found",
  "code": "NOT_FOUND"
}
```

**500 Internal Server Error** - Polling error:
```json
{
  "success": false,
  "error": "Failed to check prediction status",
  "code": "POLLING_FAILED",
  "retryable": true
}
```

**Performance**:
- Expected response time: < 1 second (just checks status)
- Total generation time: 1-5 seconds
- Poll every 2 seconds, maximum 15 attempts (30 seconds)

---

## TypeScript Interfaces

### Complete Type Definitions

```typescript
// ============================================================================
// Storyboard Types
// ============================================================================

interface Scene {
  id: string;                // UUID v4
  order: number;             // 0-4
  description: string;       // Narrative description
  imagePrompt: string;       // Image generation prompt
  suggestedDuration: number; // 2-4 seconds
}

interface StoryboardRequest {
  prompt: string;
  targetDuration?: number;   // Default: 15
}

interface StoryboardResponse {
  success: boolean;
  scenes?: Scene[];
  error?: string;
  code?: string;
  retryable?: boolean;
}

// ============================================================================
// Image Generation Types
// ============================================================================

interface GeneratedImage {
  id: string;                // UUID v4
  url: string;               // Local file path
  localPath: string;         // Full local file path
  prompt: string;            // Prompt used
  replicateId: string;       // Replicate prediction ID
  createdAt: string;         // ISO 8601 timestamp
}

interface ImageGenerationRequest {
  prompt: string;
  projectId: string;
  sceneIndex: number;
  seedImage?: string;
}

interface ImageGenerationResponse {
  success: boolean;
  predictionId?: string;
  status?: 'starting' | 'processing';
  error?: string;
  code?: string;
  retryable?: boolean;
}

interface ImageStatusResponse {
  success: boolean;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  image?: GeneratedImage;
  error?: string;
  progress?: number;
}

// ============================================================================
// Error Types
// ============================================================================

type ErrorCode =
  | 'INVALID_REQUEST'
  | 'GENERATION_FAILED'
  | 'PREDICTION_FAILED'
  | 'POLLING_FAILED'
  | 'RATE_LIMIT'
  | 'NOT_FOUND'
  | 'TIMEOUT';

interface APIError {
  success: false;
  error: string;
  code?: ErrorCode;
  retryable?: boolean;
}
```

---

## Client Usage Examples

### Frontend Integration (Person 3)

#### Example 1: Generate Storyboard

```typescript
async function generateStoryboard(prompt: string): Promise<Scene[]> {
  const response = await fetch('/api/storyboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      prompt,
      targetDuration: 15 
    })
  });

  const data: StoryboardResponse = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to generate storyboard');
  }
  
  return data.scenes!;
}

// Usage
try {
  const scenes = await generateStoryboard('Luxury watch advertisement...');
  console.log('Generated', scenes.length, 'scenes');
} catch (error) {
  console.error('Storyboard generation failed:', error);
}
```

#### Example 2: Generate Image with Polling

```typescript
async function generateImage(
  prompt: string,
  projectId: string,
  sceneIndex: number,
  seedImage?: string
): Promise<GeneratedImage> {
  // Step 1: Start generation
  const startResponse = await fetch('/api/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, projectId, sceneIndex, seedImage })
  });

  const startData: ImageGenerationResponse = await startResponse.json();
  
  if (!startData.success) {
    throw new Error(startData.error || 'Failed to start image generation');
  }

  const predictionId = startData.predictionId!;

  // Step 2: Poll for completion
  const maxAttempts = 15; // 30 seconds total
  const pollInterval = 2000; // 2 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    const statusResponse = await fetch(`/api/generate-image/${predictionId}`);
    const statusData: ImageStatusResponse = await statusResponse.json();

    if (statusData.status === 'succeeded') {
      return statusData.image!;
    }

    if (statusData.status === 'failed') {
      throw new Error(statusData.error || 'Image generation failed');
    }

    // Continue polling if status is 'starting' or 'processing'
    console.log(`Polling attempt ${attempt + 1}/${maxAttempts}, status: ${statusData.status}`);
  }

  throw new Error('Image generation timeout');
}

// Usage
try {
  const image = await generateImage(
    'Professional product photography...',
    'proj-123abc',
    0
  );
  console.log('Image generated:', image.localPath);
} catch (error) {
  console.error('Image generation failed:', error);
}
```

#### Example 3: Generate Image with Progress Updates

```typescript
async function generateImageWithProgress(
  prompt: string,
  projectId: string,
  sceneIndex: number,
  onProgress: (status: string, progress?: number) => void,
  seedImage?: string
): Promise<GeneratedImage> {
  // Start generation
  const startResponse = await fetch('/api/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, projectId, sceneIndex, seedImage })
  });

  const startData: ImageGenerationResponse = await startResponse.json();
  
  if (!startData.success) {
    throw new Error(startData.error || 'Failed to start image generation');
  }

  const predictionId = startData.predictionId!;
  onProgress('starting', 0);

  // Poll for completion
  const maxAttempts = 15;
  const pollInterval = 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    const statusResponse = await fetch(`/api/generate-image/${predictionId}`);
    const statusData: ImageStatusResponse = await statusResponse.json();

    onProgress(statusData.status, statusData.progress);

    if (statusData.status === 'succeeded') {
      return statusData.image!;
    }

    if (statusData.status === 'failed') {
      throw new Error(statusData.error || 'Image generation failed');
    }
  }

  throw new Error('Image generation timeout');
}

// Usage with React
function ImageGenerator() {
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);

  const handleGenerate = async () => {
    try {
      const image = await generateImageWithProgress(
        'Professional product photography...',
        'proj-123abc',
        0,
        (status, progress) => {
          setStatus(status);
          setProgress(progress || 0);
        }
      );
      console.log('Image ready:', image.localPath);
    } catch (error) {
      console.error('Failed:', error);
    }
  };

  return (
    <div>
      <button onClick={handleGenerate}>Generate Image</button>
      <p>Status: {status}</p>
      <p>Progress: {progress}%</p>
    </div>
  );
}
```

---

## Error Handling Best Practices

### Retry Logic

```typescript
async function fetchWithRetry<T>(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      const data = await response.json();

      if (data.success) {
        return data as T;
      }

      // Check if error is retryable
      if (data.retryable && attempt < maxRetries - 1) {
        const backoff = Math.pow(2, attempt) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }

      throw new Error(data.error || 'Request failed');
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries - 1) {
        const backoff = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }
  }

  throw lastError!;
}
```

---

## File Storage Paths

### Image Storage Structure

```
/tmp/projects/{projectId}/
  └── images/
      ├── scene-0-{imageId}.png
      ├── scene-1-{imageId}.png
      ├── scene-2-{imageId}.png
      ├── scene-3-{imageId}.png
      └── scene-4-{imageId}.png
```

### File Naming Convention

- Format: `scene-{sceneIndex}-{imageId}.png`
- `sceneIndex`: 0-4
- `imageId`: UUID v4 (shortened in filename)
- Example: `scene-0-550e8400.png`

---

## Rate Limits

### OpenRouter (Storyboard)
- Limit: ~60 requests/minute
- Retry after: 60 seconds
- Error code: `RATE_LIMIT`

### Replicate (Images)
- Limit: ~100 requests/minute
- Retry after: 60 seconds
- Error code: `RATE_LIMIT`

---

## Testing Endpoints

### Test Data

**Test Prompts**:
1. "Luxury watch advertisement with golden hour lighting and elegant models"
2. "Energy drink ad with extreme sports, skateboarding, vibrant colors"
3. "Minimalist skincare product on clean white background with soft lighting"

**Test Project ID**: `test-proj-123`

### cURL Examples

**Generate Storyboard**:
```bash
curl -X POST http://localhost:3000/api/storyboard \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Luxury watch advertisement with golden hour lighting",
    "targetDuration": 15
  }'
```

**Generate Image**:
```bash
curl -X POST http://localhost:3000/api/generate-image \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Professional product photography of luxury watch",
    "projectId": "test-proj-123",
    "sceneIndex": 0
  }'
```

**Poll Image Status**:
```bash
curl http://localhost:3000/api/generate-image/abc123def456
```

---

## Change Log

### Version 1.0 (Initial)
- Initial API contract definition
- Storyboard generation endpoint
- Image generation endpoint
- Image status polling endpoint

---

## Notes for Person 3 (Frontend)

1. **Polling Pattern**: Image generation uses polling. Start generation, get predictionId, then poll every 2 seconds.

2. **File Paths**: Image URLs returned are local file paths. You may need to serve these via a separate endpoint or convert to data URLs.

3. **Error Handling**: All errors include a `retryable` flag. If true, you can retry the request.

4. **Progress Updates**: Image generation may include progress (0-100). Use this for progress bars.

5. **Seed Images**: For scenes 1-4, pass the selected seed frame URL from the previous scene.

6. **Timeouts**: If polling exceeds 30 seconds (15 attempts), consider it a timeout and show error to user.

---

## Questions or Issues?

Contact Person 1 (Backend - AI APIs) if:
- API responses don't match this contract
- You need additional fields in responses
- You encounter errors not documented here
- Performance is slower than expected

---

**Status**: Ready for implementation (Hour 2)  
**Next Update**: After initial testing (Hour 5)

