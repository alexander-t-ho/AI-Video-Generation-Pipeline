# AI Video Generation Pipeline - Product Requirements Document

## Project Overview

**Timeline**: 7 days (MVP in 48 hours)
**Team Size**: 3 developers
**Objective**: Build an end-to-end AI video generation pipeline that converts user prompts into professional-quality video advertisements with minimal human intervention.

---

## Core Concept

Users input a prompt → AI generates 5-scene storyboard → User refines each scene's image → Videos generated sequentially using last frame as seed for next clip → Final video stitched and exported.

---

## MVP Requirements (48 Hours - Hard Gate)

### Must Have
1. ✅ User prompt input interface
2. ✅ AI-generated 5-scene storyboard (descriptions + image prompts)
3. ✅ Image generation for each scene with user approval
4. ✅ Iterative prompt refinement (user can regenerate images until satisfied)
5. ✅ Video generation from approved images (sequential, scene-by-scene)
6. ✅ Last-frame extraction (5 candidate frames from final 0.5s of each video)
7. ✅ User selects seed frame for next scene
8. ✅ Video stitching (5 clips into single MP4)
9. ✅ Final video export and download
10. ✅ Deployed to Vercel with working demo

### Success Criteria
- Generate complete 15-20 second video from single prompt
- Each scene 2-4 seconds long (total 5 scenes)
- Visual coherence across all clips
- No crashes or generation failures
- Clear progress indicators throughout

---

## Technical Architecture

### Tech Stack
- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **State Management**: Zustand
- **Storage**: Local filesystem (temp) + AWS S3 (finals)
- **Video Processing**: FFmpeg (server-side)
- **Deployment**: Vercel (GitHub Actions from `prod` branch)
- **Repository**: Monorepo structure

### API Models

```
Image Generation:
- MVP: black-forest-labs/flux-schnell (Replicate)
- Cost: $0.003/image, Speed: 1-2 seconds

Video Generation:
- MVP: luma/ray (Replicate - Dream Machine)
- Supports: image-to-video with seed frames
- Cost: ~$0.50/clip, Speed: 2-3 minutes

Storyboard Generation:
- Provider: OpenAI (via OpenRouter)
- Model: gpt-4o
- Cost: $0.01/storyboard

Available API Keys:
- Replicate API (image + video)
- OpenRouter API (storyboard LLM)
- OpenAI API (backup)
```

---

## Core User Flow

### Phase 1: Project Creation
1. User enters product/ad prompt
2. User specifies duration preference (optional: 15s, 30s, 60s)
3. System creates project with unique ID

### Phase 2: Storyboard Generation
1. LLM generates exactly 5 scene descriptions
2. Each scene includes:
   - Scene description (narrative)
   - Image generation prompt (detailed visual description)
   - Suggested duration (2-4 seconds)
3. User reviews storyboard (can regenerate entire storyboard if needed)

### Phase 3: Sequential Scene Generation (Repeat for Scenes 0-4)

**For Scene 0 (First Scene):**
1. Generate image from storyboard prompt
2. User can:
   - Accept image → proceed to video
   - Modify prompt → regenerate image
   - Generate multiple variations → pick one
3. Generate video from selected image
4. Extract 5 frames from last 0.5 seconds
5. User selects 1 frame as seed for Scene 1

**For Scenes 1-4 (Subsequent Scenes):**
1. Generate image using:
   - Storyboard prompt
   - Selected seed frame from previous scene (image-to-image guidance)
2. User approval/regeneration loop (same as Scene 0)
3. Generate video from selected image + seed frame
4. Extract 5 frames from last 0.5 seconds (except Scene 4)
5. User selects seed frame for next scene (except Scene 4)

### Phase 4: Finalization
1. System stitches all 5 video clips
2. User previews final video
3. User downloads/exports MP4
4. Optional: Upload to S3 for sharing

---

## State Schema

### Project State
```typescript
interface ProjectState {
  id: string;
  prompt: string;
  targetDuration: number; // 15, 30, or 60 seconds
  status: 'storyboard' | 'scene_generation' | 'stitching' | 'completed';
  createdAt: string;
  
  storyboard: Scene[];
  currentSceneIndex: number;
  
  finalVideoUrl?: string;
  finalVideoS3Key?: string;
}
```

### Scene State
```typescript
interface Scene {
  id: string;
  order: number; // 0-4
  description: string; // narrative description
  imagePrompt: string; // for image generation
  suggestedDuration: number; // 2-4 seconds
  
  // Image generation state
  generatedImages: GeneratedImage[];
  selectedImageId?: string;
  
  // Video generation state
  videoLocalPath?: string;
  videoS3Key?: string;
  actualDuration?: number;
  
  // Seed frames for NEXT scene (not present in Scene 4)
  seedFrames?: SeedFrame[];
  selectedSeedFrameIndex?: number;
  
  status: 'pending' | 'generating_image' | 'image_ready' | 'generating_video' | 'video_ready' | 'completed';
}
```

### Supporting Types
```typescript
interface GeneratedImage {
  id: string;
  url: string; // local or S3 path
  prompt: string;
  replicateId: string;
  createdAt: string;
}

interface SeedFrame {
  id: string;
  url: string; // local path
  timestamp: number; // 0.1s, 0.2s, 0.3s, 0.4s, 0.5s from end
}
```

---

## File Storage Strategy

### Local Storage (During Generation)
```
/tmp/projects/{projectId}/
  ├── images/
  │   ├── scene-0-{imageId}.png
  │   ├── scene-1-{imageId}.png
  │   └── ...
  ├── videos/
  │   ├── scene-0.mp4
  │   ├── scene-1.mp4
  │   └── ...
  ├── frames/
  │   ├── scene-0-frame-0.png
  │   ├── scene-0-frame-1.png
  │   └── ...
  └── final/
      └── output.mp4
```

### S3 Storage (Final Outputs Only)
```
outputs/{projectId}/final.mp4
```

### Cleanup Strategy
- Keep local files until project completion
- Upload final video to S3
- Delete `/tmp/projects/{projectId}` after successful S3 upload
- Background job: Delete projects older than 24 hours

---

## Critical Technical Requirements

### 1. Frame Extraction (FFmpeg)
**Location**: Server-side (Next.js API routes)

**Extract 5 frames from last 0.5 seconds:**
```bash
ffmpeg -i scene.mp4 -ss $(duration-0.5) -vframes 5 -q:v 2 frame_%d.png
```

**Requirements**:
- Must preserve image quality (use `-q:v 2` for high quality)
- Frame format: PNG
- Output resolution: Match source video (1080p)
- Must handle variable video durations

### 2. Video Stitching (FFmpeg)
**Concatenate all 5 clips:**
```bash
# Create concat file
echo "file 'scene-0.mp4'" > concat.txt
echo "file 'scene-1.mp4'" >> concat.txt
...

# Stitch videos
ffmpeg -f concat -safe 0 -i concat.txt -c copy output.mp4
```

**Requirements**:
- No re-encoding (use `-c copy` for speed)
- All clips must have same resolution/codec
- Handle clips of different durations

### 3. Image-to-Video with Seed Frame
**Luma Ray API supports:**
- `image_url`: Starting frame for video generation
- `prompt`: Text description of desired motion/action
- Combined approach creates smooth transitions

**Implementation**:
```
Scene 0: Text → Image → Video (no seed)
Scene 1: Text + Seed Frame → Image → Video (with seed)
Scene 2-4: Same as Scene 1
```

### 4. Error Handling & Retries
**Critical failure points:**
- Image generation timeout (retry 3x)
- Video generation timeout (retry 2x)
- Frame extraction failure (retry 1x)
- S3 upload failure (retry 3x)

**User-facing errors:**
- Show specific error messages
- Offer manual retry button
- Allow skipping problematic scenes (post-MVP)

---

## API Integration Specifications

### Replicate API (Images + Videos)
```typescript
// Image Generation
POST https://api.replicate.com/v1/predictions
{
  "version": "black-forest-labs/flux-schnell",
  "input": {
    "prompt": string,
    "go_fast": true, // Enable fp8 optimization
    "num_outputs": 1,
    "aspect_ratio": "16:9",
    "output_format": "png",
    "output_quality": 90
  }
}

// Video Generation (with seed frame)
POST https://api.replicate.com/v1/predictions
{
  "version": "luma/ray",
  "input": {
    "prompt": string,
    "image_url": string, // Seed frame from previous scene
    "duration": 4, // seconds
    "aspect_ratio": "16:9",
    "loop": false
  }
}

// Poll for completion
GET https://api.replicate.com/v1/predictions/{id}
// Poll every 2 seconds until status === "succeeded"
```

### OpenRouter API (Storyboard)
```typescript
POST https://openrouter.ai/api/v1/chat/completions
{
  "model": "openai/gpt-4o",
  "messages": [
    {
      "role": "system",
      "content": "You are a professional video storyboard creator..."
    },
    {
      "role": "user",
      "content": "Create exactly 5 scenes for: {user_prompt}"
    }
  ],
  "response_format": { "type": "json_object" }
}

// Expected Response Format
{
  "scenes": [
    {
      "order": 0,
      "description": "Opening shot establishing the product",
      "imagePrompt": "Professional product photography of...",
      "duration": 3
    },
    ...
  ]
}
```

---

## Team Work Breakdown (3 Developers)

### Person 1: Storyboard & Image Generation (Backend APIs)
**Responsibility**: Handle all AI interactions for storyboard and image generation

**Deliverables**:
1. `/app/api/storyboard/route.ts` - Generate 5-scene storyboard
2. `/app/api/generate-image/route.ts` - Image generation endpoint
3. `/lib/ai/storyboard-generator.ts` - OpenRouter integration
4. `/lib/ai/image-generator.ts` - Replicate Flux integration
5. Mock responses for frontend testing

**Key Functions**:
- `generateStoryboard(prompt: string): Promise<Scene[]>`
- `generateImage(prompt: string, seedImage?: string): Promise<GeneratedImage>`
- `pollReplicateStatus(predictionId: string): Promise<output>`

**Dependencies**: None (can start immediately with mock data)

---

### Person 2: Video Generation & Processing (Backend APIs)
**Responsibility**: Handle video generation, frame extraction, and stitching

**Deliverables**:
1. `/app/api/generate-video/route.ts` - Video generation endpoint
2. `/app/api/extract-frames/route.ts` - Frame extraction endpoint
3. `/app/api/stitch-videos/route.ts` - Final video stitching
4. `/lib/video/generator.ts` - Replicate Luma integration
5. `/lib/video/frame-extractor.ts` - FFmpeg frame extraction
6. `/lib/video/stitcher.ts` - FFmpeg video concatenation
7. `/lib/storage/s3-uploader.ts` - S3 upload utility

**Key Functions**:
- `generateVideo(imageUrl: string, prompt: string, seedFrame?: string): Promise<videoPath>`
- `extractFrames(videoPath: string): Promise<SeedFrame[]>`
- `stitchVideos(videoPaths: string[]): Promise<finalVideoPath>`
- `uploadToS3(filePath: string): Promise<s3Key>`

**Dependencies**: 
- Needs Person 1's image output format
- Can start with mock video files immediately
- Install FFmpeg in Vercel deployment

---

### Person 3: UI & State Orchestration (Frontend + Integration)
**Responsibility**: Build user interface and coordinate backend APIs

**Deliverables**:
1. `/app/page.tsx` - Main generation UI
2. `/components/ProjectCreation.tsx` - Initial prompt input
3. `/components/StoryboardView.tsx` - Display 5 scenes
4. `/components/SceneEditor.tsx` - Image generation & approval
5. `/components/SeedFrameSelector.tsx` - Frame selection UI
6. `/components/VideoPreview.tsx` - Final video player
7. `/components/ProgressIndicator.tsx` - Generation status
8. `/lib/state/project-store.ts` - Zustand state management
9. `/lib/api-client.ts` - API wrapper functions

**Key Functions**:
- `createProject(prompt: string): void`
- `generateStoryboard(): Promise<void>`
- `generateImageForScene(sceneIndex: number): Promise<void>`
- `selectImage(sceneIndex: number, imageId: string): void`
- `generateVideoForScene(sceneIndex: number): Promise<void>`
- `selectSeedFrame(sceneIndex: number, frameIndex: number): void`
- `stitchFinalVideo(): Promise<void>`

**Dependencies**:
- Needs API contracts from Person 1 & 2
- Can build with mock data immediately
- Integrate real APIs once endpoints ready

---

## Parallel Development Strategy

### Day 1 (Hours 0-8)
**All Team - Setup (Hour 0-1)**:
- [ ] Initialize Next.js project with TypeScript
- [ ] Create `/lib/types.ts` with shared interfaces
- [ ] Set up environment variables
- [ ] Agree on API contracts (request/response formats)

**Person 1 (Hours 1-8)**:
- [ ] Create mock storyboard generator (returns hardcoded JSON)
- [ ] Set up OpenRouter client
- [ ] Implement real storyboard generation
- [ ] Set up Replicate client for images
- [ ] Test Flux-schnell generation
- [ ] Create image storage utility

**Person 2 (Hours 1-8)**:
- [ ] Install/test FFmpeg locally
- [ ] Create mock video generator
- [ ] Implement frame extraction utility
- [ ] Test Luma Ray API
- [ ] Create video stitching utility
- [ ] Set up S3 client

**Person 3 (Hours 1-8)**:
- [ ] Set up Next.js routing
- [ ] Create basic project creation form
- [ ] Build storyboard display (with mock data)
- [ ] Set up Zustand store
- [ ] Create scene editor component shell
- [ ] Build progress indicator component

### Day 2 (Hours 8-24)
**Integration & MVP Assembly**:
- Person 1: Finalize image generation endpoint
- Person 2: Complete video generation + frame extraction
- Person 3: Connect UI to real APIs
- All: Integration testing with real generation

### Day 3 (Hours 24-48)
**Polish & Deploy**:
- Bug fixes from testing
- Add loading states and error messages
- Deploy to Vercel staging
- Generate 2-3 demo videos
- Final testing and deployment to prod

---

## API Routes Structure

### Storyboard Routes
```
POST /api/storyboard
Body: { prompt: string, targetDuration: number }
Response: { scenes: Scene[] }
```

### Image Generation Routes
```
POST /api/generate-image
Body: { prompt: string, seedImage?: string }
Response: { image: GeneratedImage, predictionId: string }

GET /api/generate-image/[predictionId]
Response: { status: string, output?: string }
```

### Video Generation Routes
```
POST /api/generate-video
Body: { imageUrl: string, prompt: string, seedFrame?: string }
Response: { video: { localPath: string }, predictionId: string }

GET /api/generate-video/[predictionId]
Response: { status: string, output?: string }
```

### Frame Extraction Routes
```
POST /api/extract-frames
Body: { videoPath: string }
Response: { frames: SeedFrame[] }
```

### Video Stitching Routes
```
POST /api/stitch-videos
Body: { videoPaths: string[], projectId: string }
Response: { finalVideoPath: string, s3Url?: string }
```

---

## UI/UX Requirements

### Project Creation Screen
- Single text input for prompt (large textarea)
- Duration selector (15s / 30s / 60s) - default 15s
- "Generate Storyboard" CTA button
- Show example prompts for inspiration

### Storyboard View
- Display all 5 scenes in grid/list
- Each scene shows:
  - Scene number (1-5)
  - Description
  - Image prompt
  - Suggested duration
- "Regenerate Storyboard" button
- "Start Generation" CTA to begin Scene 0

### Scene Editor (Active Scene)
- Large image preview area
- "Generate Image" button
- "Regenerate Image" button with prompt input
- Image generation status (loading spinner)
- Once image approved: "Generate Video" button
- Video generation status (loading spinner + ETA)
- Once video complete: Show 5 seed frame options
- "Select & Continue" for each frame

### Progress Indicator
```
✓ Storyboard Generated
→ Scene 1/5: Generating Image...
  Scene 2/5: Waiting
  Scene 3/5: Waiting
  Scene 4/5: Waiting
  Scene 5/5: Waiting
```

### Final Preview
- Video player with playback controls
- "Download MP4" button
- "Generate New Video" button (start over)
- Optional: "Share Link" (S3 URL)

---

## Post-MVP Features (Not Required for 48h)

### Phase 2 (Days 3-5)
- [ ] Queue mode (auto-generate all scenes without user approval)
- [ ] Multiple image variations per scene (show 3 options)
- [ ] Better transitions (FFmpeg crossfades)
- [ ] Audio generation (background music)
- [ ] Text overlays (product name, CTA)

### Phase 3 (Days 6-7)
- [ ] Multiple aspect ratios (9:16, 1:1)
- [ ] Brand guidelines upload (color schemes, fonts)
- [ ] Advanced editing (trim clips, reorder scenes)
- [ ] Batch generation (create multiple variations)
- [ ] Video templates (predefined storyboards)

---

## Testing Strategy

### Manual Testing Checklist
- [ ] Generate storyboard from various prompts
- [ ] Regenerate storyboard if unsatisfactory
- [ ] Generate image for Scene 0
- [ ] Regenerate image with modified prompt
- [ ] Approve image and generate video
- [ ] Select seed frame
- [ ] Repeat for all 5 scenes
- [ ] Verify final video plays correctly
- [ ] Download final video

### Test Prompts
1. "Luxury watch advertisement with golden hour lighting and elegant models"
2. "Energy drink ad with extreme sports, skateboarding, vibrant colors"
3. "Minimalist skincare product on clean white background with soft lighting"

### Error Scenarios to Test
- API timeout during image generation
- API timeout during video generation
- Invalid seed frame selection
- S3 upload failure
- FFmpeg processing error

---

## Performance Targets

### Generation Speed
- Storyboard: < 10 seconds
- Image: < 5 seconds each (Flux-schnell)
- Video: 2-3 minutes each (Luma Ray)
- Frame extraction: < 5 seconds
- Video stitching: < 30 seconds
- **Total end-to-end: ~12-15 minutes** for 5-scene video

### Cost Per Video
- Storyboard: $0.01
- Images (5x): $0.015
- Videos (5x): $2.50
- **Total: ~$2.53 per video**

### Reliability
- 90%+ successful generation rate
- Automatic retry on transient failures
- Clear error messages for user action

---

## Deployment Configuration

### Vercel Settings
```
Build Command: npm run build
Output Directory: .next
Install Command: npm install
Node Version: 18.x

Environment Variables:
- REPLICATE_API_TOKEN
- OPENROUTER_API_KEY
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- AWS_S3_BUCKET
- NEXT_PUBLIC_APP_URL
```

### GitHub Actions (Optional)
```yaml
# .github/workflows/deploy.yml
name: Deploy to Vercel
on:
  push:
    branches: [prod]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
```

### FFmpeg in Vercel
- Use `@ffmpeg-installer/ffmpeg` npm package
- Or install via build command
- Ensure binary is accessible in API routes

---

## Critical Success Factors

### For MVP (48 Hours)
1. **Sequential flow works end-to-end** - User can complete full journey
2. **Visual coherence** - Videos look professionally connected
3. **No hard crashes** - Graceful error handling everywhere
4. **Clear progress** - User always knows what's happening
5. **Deployed and accessible** - Judges can test it

### Definition of Done
- ✅ Live deployment on Vercel
- ✅ Can generate complete video from prompt
- ✅ At least 2 demo videos created and working
- ✅ README with setup instructions
- ✅ All 3 team members can run locally

---

## Risk Mitigation

### High-Risk Areas
1. **Video generation timeouts** (2-3 min per clip)
   - Mitigation: Implement robust polling with status updates
   
2. **Frame extraction quality** (seed for next scene)
   - Mitigation: Extract high-quality PNGs, test early
   
3. **API rate limits** (Replicate concurrent requests)
   - Mitigation: Sequential generation, not parallel
   
4. **FFmpeg on Vercel** (binary availability)
   - Mitigation: Test deployment early, use npm package

5. **Merge conflicts** (3 developers, tight timeline)
   - Mitigation: Work on separate files, clear ownership

---

## Day 1 Action Items

### Immediate (Next 30 Minutes)
1. [ ] Create Next.js project
2. [ ] Set up `/lib/types.ts` with all interfaces
3. [ ] Configure environment variables
4. [ ] Test API keys (Replicate, OpenRouter, AWS)
5. [ ] Create monorepo folder structure

### First 4 Hours
- Person 1: Get one image generation working
- Person 2: Get FFmpeg frame extraction working
- Person 3: Build project creation form with Zustand

### End of Day 1 Target
- ✅ Storyboard generation working
- ✅ Image generation working
- ✅ Basic UI for project creation
- ✅ Team can run project locally

---

## Questions & Decisions Log

### Resolved
- ✅ Use sequential generation (not queue mode for MVP)
- ✅ 5 scenes for MVP (not 12)
- ✅ Flux-schnell for images (speed priority)
- ✅ Luma Ray for videos (supports image-to-video)
- ✅ Local storage during generation, S3 for finals
- ✅ FFmpeg server-side (not client-side)

### Open Questions
- [ ] How to handle user leaving page during generation?
- [ ] Should we cache API responses for faster re-testing?
- [ ] Do we need authentication/user accounts?
- [ ] What's the S3 bucket retention policy?

---

## Success Metrics

### MVP Completion Checklist
- [ ] User can input prompt
- [ ] Storyboard generates with 5 scenes
- [ ] Images generate from storyboard prompts
- [ ] User can regenerate images with custom prompts
- [ ] Videos generate from approved images
- [ ] Seed frames extracted from each video
- [ ] User selects seed frames
- [ ] Final video stitches all 5 clips
- [ ] User can download final MP4
- [ ] Deployed to Vercel production
- [ ] 2+ demo videos created

### Quality Gates
- [ ] No generation fails 3+ times in a row
- [ ] Videos maintain visual consistency
- [ ] UI never shows "undefined" or crashes
- [ ] Loading states for all async operations
- [ ] Error messages are actionable
- [ ] Full generation completes in < 20 minutes

---

## Emergency Fallbacks

If critical issues arise:

**Image Generation Fails**:
- Fallback to `black-forest-labs/flux-dev` (slower but more reliable)

**Video Generation Fails**:
- Fallback to `minimax/video-01` or text-to-video without seed

**FFmpeg Issues on Vercel**:
- Use client-side video stitching (slower but works)

**S3 Upload Fails**:
- Store in Vercel blob storage temporarily

**Storyboard Generation Fails**:
- Use hardcoded template storyboards for common ad types

---

## Appendix: Prompt Templates

### Storyboard Generation System Prompt
```
You are a professional video storyboard creator specializing in advertising content.

Given a product description and ad goal, create exactly 5 scenes that tell a compelling visual story.

Each scene should:
- Be 2-4 seconds long
- Have a clear visual focus
- Connect logically to the next scene
- Include detailed image generation prompts

Output format:
{
  "scenes": [
    {
      "order": 0,
      "description": "Brief narrative description",
      "imagePrompt": "Detailed prompt for image generation with style, lighting, composition",
      "duration": 3
    },
    ...
  ]
}

Keep prompts visual and specific. Avoid abstract concepts.
```

### Example Ad Prompts
```
Luxury Watch:
"Create a luxury watch advertisement with golden hour lighting, elegant model wearing the watch, close-up product shots, sophisticated minimalist aesthetic"

Energy Drink:
"Create an energy drink ad with extreme sports footage, skateboarding, parkour, vibrant neon colors, high energy movement, urban environment"

Skincare:
"Create a minimalist skincare advertisement with clean white background, soft natural lighting, product close-ups, botanical elements, serene aesthetic"
```

---

## End of PRD

This document defines the complete scope for the 48-hour MVP. Focus on getting the core flow working end-to-end before adding polish or additional features.

**Primary Goal**: Ship a working demo that generates one complete video from a single prompt.

**Secondary Goal**: Make it look professional and handle errors gracefully.

**Tertiary Goal**: Add advanced features only if time permits after MVP is complete.
