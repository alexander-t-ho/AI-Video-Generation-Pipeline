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

### Phase 1: Project Creation (Starting Screen - Claude-like)
1. User lands on starting screen with chat-style interface
2. User enters product/ad prompt in the text input area
3. User can optionally drag images into the interface for reference
   - Images are uploaded to `/tmp/projects/{projectId}/uploads/`
   - Image URLs are passed to storyboard generation for visual context
   - Supported formats: JPEG, PNG, WebP (max 10MB per file)
4. User can specify duration preference via chat (optional: 15s, 30s, 60s)
5. System creates project with unique ID
6. Interface transitions to main workspace (three-panel layout)

### Phase 2: Storyboard Generation (Main Workspace)
1. **Left Panel**: Agent responds with "Generating storyboard..." status
2. LLM generates exactly 5 scene descriptions
   - If reference images were uploaded, GPT-4o vision analyzes them for visual style
   - Storyboard incorporates visual elements from reference images (color palette, composition, lighting, aesthetic)
3. Each scene includes:
   - Scene description (narrative)
   - Image generation prompt (detailed visual description)
   - Suggested duration (2-4 seconds)
4. **Middle Panel**: Storyboard view displays all 5 scenes in grid/list
5. **Right Panel**: Media drawer shows storyboard data and uploaded reference images
6. **Left Panel**: Agent confirms "Storyboard generated with 5 scenes"
7. User can review storyboard in middle panel
8. User can regenerate storyboard via left panel chat or middle panel action

### Phase 3: Sequential Scene Generation (Repeat for Scenes 0-4)
**Location**: Main Workspace (three-panel layout)

**For Scene 0 (First Scene):**
1. **Left Panel**: Agent updates "Starting Scene 1/5: Generating image..."
2. Generate image from storyboard prompt
   - If reference images were uploaded, they're used for style guidance
   - Reference images enhance the prompt with visual context
3. **Right Panel**: Generated image appears in media drawer under "Scene 1"
4. **Middle Panel**: Switch to Editor mode to view image
5. User can:
   - Accept image → proceed to video (via left panel chat or editor controls)
   - Modify prompt → regenerate image (via left panel chat or editor)
   - Generate multiple variations → pick one (variations appear in media drawer)
6. **Left Panel**: Agent updates "Image approved. Generating video..."
7. Generate video from selected image
8. **Right Panel**: Generated video appears in media drawer
9. **Middle Panel**: Video preview available in Editor mode
10. Extract 5 frames from last 0.5 seconds
11. **Right Panel**: Seed frames appear in "Seed Frames" section
12. **Middle Panel**: Editor mode shows 5 frame options for selection
13. User selects 1 frame as seed for Scene 1 (click in editor or drag from media drawer)

**For Scenes 1-4 (Subsequent Scenes):**
1. **Left Panel**: Agent updates "Starting Scene X/5: Generating image..."
2. Generate image using:
   - Storyboard prompt
   - Selected seed frame from previous scene (image-to-image guidance)
   - Reference images (if uploaded) for style consistency
3. **Right Panel**: Generated image appears in media drawer under respective scene
4. **Middle Panel**: Editor mode shows image preview
5. User approval/regeneration loop (same as Scene 0)
6. **Left Panel**: Agent provides status updates throughout
7. Generate video from selected image + seed frame
8. **Right Panel**: Video added to media drawer
9. Extract 5 frames from last 0.5 seconds (except Scene 4)
10. **Right Panel**: Seed frames added to drawer
11. User selects seed frame for next scene (except Scene 4)
12. **Middle Panel**: Can switch between Storyboard/Timeline/Editor views at any time
13. **Left Panel**: Agent tracks progress and provides context-aware guidance

**Interface Interactions**:
- User can switch between Storyboard/Timeline/Editor modes in middle panel at any time
- Media drawer shows all generated assets organized by scene
- Left panel provides conversational interface for all actions
- Drag-and-drop from media drawer to editor/timeline supported
- Visual progress indicators update across all three panels

### Phase 4: Finalization
1. **Left Panel**: Agent updates "All scenes complete. Stitching final video..."
2. System stitches all 5 video clips
3. **Right Panel**: Final stitched video appears in "Final Output" section
4. **Middle Panel**: Switch to Timeline mode to preview final video
5. **Middle Panel**: Full video player with playback controls available
6. User previews final video in timeline or dedicated preview
7. **Left Panel**: Agent confirms "Video complete. Ready for download."
8. User downloads/exports MP4 (via middle panel or media drawer)
9. Optional: Upload to S3 for sharing (action available in left panel or media drawer)
10. User can start new project via left panel chat or "Generate New Video" button

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
  ├── uploads/              # User-uploaded reference images
  │   ├── {imageId}.jpg
  │   └── {imageId}.png
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

### S3 Storage (Final Outputs + Future: Uploaded Images)
```
outputs/{projectId}/final.mp4
uploads/{projectId}/{imageId}.{ext}  # Future: When S3 is enabled
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
      "content": [
        {
          "type": "text",
          "text": "Create exactly 5 scenes for: {user_prompt}"
        },
        // Reference images included if provided
        {
          "type": "image_url",
          "image_url": { "url": "data:image/jpeg;base64,..." }
        }
      ]
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

**Screen 1: Starting Screen (Claude-like)**
1. `/app/page.tsx` - Starting screen with chat-style interface
2. `/components/StartingScreen.tsx` - Claude-like prompt input with drag-and-drop
3. `/components/ChatInput.tsx` - Chat-style text input component
4. `/components/ImageDropZone.tsx` - Drag-and-drop image upload area

**Screen 2: Main Workspace (Cursor-like Three-Panel Layout)**
5. `/app/workspace/page.tsx` - Main workspace layout with three panels
6. `/components/workspace/LeftPanel.tsx` - Agent/typing section (chat interface)
7. `/components/workspace/MiddlePanel.tsx` - Toggleable middle panel container
8. `/components/workspace/RightPanel.tsx` - Media drawer component
9. `/components/workspace/AgentChat.tsx` - Chat interface for agent communication
10. `/components/workspace/StoryboardView.tsx` - Storyboard mode (grid/list of scenes)
11. `/components/workspace/TimelineView.tsx` - Timeline mode (horizontal timeline)
12. `/components/workspace/EditorView.tsx` - Editor mode (scene editing)
13. `/components/workspace/MediaDrawer.tsx` - Media library with organization
14. `/components/workspace/SceneCard.tsx` - Individual scene card component
15. `/components/workspace/VideoPlayer.tsx` - Video playback component
16. `/components/workspace/SeedFrameSelector.tsx` - Frame selection interface
17. `/components/workspace/ModeToggle.tsx` - Toggle between Storyboard/Timeline/Editor

**State & API Management**
18. `/lib/state/project-store.ts` - Zustand state management
19. `/lib/api-client.ts` - API wrapper functions
20. `/lib/hooks/useMediaDragDrop.ts` - Drag-and-drop hook for media

**Key Functions**:
- `createProject(prompt: string, images?: File[]): void`
- `generateStoryboard(): Promise<void>`
- `generateImageForScene(sceneIndex: number): Promise<void>`
- `selectImage(sceneIndex: number, imageId: string): void`
- `generateVideoForScene(sceneIndex: number): Promise<void>`
- `selectSeedFrame(sceneIndex: number, frameIndex: number): void`
- `stitchFinalVideo(): Promise<void>`
- `switchViewMode(mode: 'storyboard' | 'timeline' | 'editor'): void`
- `handleMediaDragDrop(files: File[]): void`

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
Body: { prompt: string, targetDuration: number, referenceImageUrls?: string[] }
Response: { scenes: Scene[] }
```

### Image Upload Routes
```
POST /api/upload-images
Body: FormData { projectId: string, images: File[] }
Response: { images: UploadedImage[] }
```

### Image Generation Routes
```
POST /api/generate-image
Body: { prompt: string, projectId: string, sceneIndex: number, seedImage?: string, referenceImageUrls?: string[] }
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

### Screen 1: Starting Screen (Claude-like Interface)
**Design**: Chat-style interface similar to Claude AI

**Features**:
- Large, prominent text input area for prompt entry
- Drag-and-drop zone for images (users can drag images directly into the interface)
- Conversation-style interaction where users can:
  - Enter product/ad prompt
  - Optionally specify duration preference (15s / 30s / 60s) via chat
  - Attach reference images via drag-and-drop
- Clean, minimal design focused on the input experience
- Show example prompts for inspiration (subtle, non-intrusive)
- "Generate Storyboard" action available after prompt input

**User Flow**:
1. User types prompt in chat-style input
2. User can drag images into the interface (optional)
3. System responds with storyboard generation
4. Transitions to main workspace after storyboard is created

---

### Screen 2: Main Workspace (Cursor-like Interface)
**Design**: Three-panel layout similar to Cursor IDE

**Layout Structure**:
```
┌─────────────┬──────────────────────────┬─────────────┐
│             │                          │             │
│   Left      │        Middle            │    Right   │
│   Panel     │        Panel             │    Panel   │
│             │                          │             │
│ Agent/      │  Toggleable Views:      │  Media     │
│ Typing      │  - Storyboard            │  Drawer    │
│ Section     │  - Timeline              │            │
│             │  - Editor                │            │
│             │                          │            │
└─────────────┴──────────────────────────┴─────────────┘
```

#### Left Panel: Agent/Typing Section
**Purpose**: Real-time communication and status updates

**Features**:
- Chat interface showing conversation history
- Agent responses and status updates
- Generation progress indicators
- Interactive commands:
  - "Regenerate storyboard"
  - "Generate image for Scene X"
  - "Regenerate image with new prompt"
  - "Generate video"
  - "Select seed frame"
- Real-time feedback during generation:
  - "Generating image for Scene 1..."
  - "Video generation in progress (2:30 remaining)..."
  - "Extracting seed frames..."
- Error messages and retry options
- Context-aware suggestions based on current workflow state

#### Middle Panel: Toggleable Views
**Purpose**: Primary workspace with three distinct modes

**Mode 1: Storyboard View**
- Visual grid/list of all 5 scenes
- Each scene card displays:
  - Scene number (1-5)
  - Description
  - Image prompt
  - Suggested duration
  - Current status (pending, generating, ready)
- Interactive scene cards (click to focus/edit)
- "Regenerate Storyboard" action available
- Visual indicators for completed scenes

**Mode 2: Timeline View**
- Horizontal timeline showing all 5 video clips
- Visual representation of scene durations
- Playhead for preview navigation
- Drag-to-reorder scenes (future enhancement)
- Click scene to jump to editor mode
- Final stitched video preview at bottom
- Timeline scrubbing for frame-accurate navigation

**Mode 3: Editor Mode**
- Large preview area for active scene
- Image preview with generation controls:
  - "Generate Image" button
  - "Regenerate Image" with prompt input
  - Image generation status (loading spinner)
- Video preview once generated:
  - Playback controls
  - Frame extraction visualization
  - Seed frame selection interface (5 frame options)
- Scene-specific editing tools
- "Approve & Continue" workflow

**Mode Toggle**:
- Tabs or buttons to switch between Storyboard/Timeline/Editor
- Current mode clearly indicated
- Smooth transitions between modes
- Context preserved when switching

#### Right Panel: Media Drawer
**Purpose**: Centralized media library and asset management

**Features**:
- Organized sections:
  - **Generated Images**: All scene images (grouped by scene)
  - **Generated Videos**: All scene videos (grouped by scene)
  - **Seed Frames**: Extracted frames from videos
  - **Uploaded Media**: User-dragged images from starting screen
  - **Final Output**: Stitched final video
- Thumbnail grid view for easy browsing
- Drag-and-drop support:
  - Drag images to editor for reference
  - Drag frames to timeline
  - Drag media between scenes
- Filtering and search:
  - Filter by scene number
  - Filter by media type (image/video/frame)
  - Search by prompt or description
- Media metadata display:
  - Generation timestamp
  - Associated prompt
  - Scene assignment
- Download/export options for individual media items
- Visual indicators for:
  - Selected media (highlighted)
  - Media in use (badge/indicator)
  - Generation status (loading, ready, error)

**Media Organization**:
- Collapsible sections by scene
- Expandable folders for variations
- Quick preview on hover
- Click to view full-size in middle panel

---

### Progress Indicator (Integrated)
**Location**: Left panel (agent section) + visual indicators in middle panel

**Display**:
- Chat-style progress updates in left panel
- Visual status badges on scene cards (storyboard view)
- Timeline progress indicators (timeline view)
- Loading states in editor mode

**Example Flow in Left Panel**:
```
User: "Create a luxury watch ad"
Agent: "Generating storyboard..."
Agent: "✓ Storyboard generated with 5 scenes"
Agent: "Starting Scene 1/5: Generating image..."
Agent: "✓ Image generated. Generating video..."
Agent: "✓ Video complete. Extracting seed frames..."
Agent: "Please select a seed frame for Scene 2"
```

---

### Final Preview
**Location**: Middle panel (Timeline mode) or dedicated view

**Features**:
- Full video player with playback controls
- Timeline scrubbing
- "Download MP4" button (prominent)
- "Generate New Video" button (start over)
- Optional: "Share Link" (S3 URL)
- Quality indicators and metadata

---

### Responsive Design Considerations
- Three-panel layout adapts to screen size:
  - Large screens: All three panels visible
  - Medium screens: Collapsible side panels
  - Small screens: Stacked layout or tabbed interface
- Touch-friendly drag-and-drop on mobile/tablet
- Media drawer can be toggled to full-screen overlay

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
- ✅ Image upload support with local storage (S3 ready for future)
- ✅ Reference images used in storyboard generation via GPT-4o vision

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
