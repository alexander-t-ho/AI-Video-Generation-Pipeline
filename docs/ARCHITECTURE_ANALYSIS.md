# Architecture Analysis: Vercel vs Alternatives

## TL;DR: Hybrid Approach Recommended

**✅ Deploy to Vercel:**
- Frontend (Next.js UI)
- API routes that start jobs (return immediately)
- Storyboard generation (< 10 seconds)
- Image generation initiation (< 5 seconds)
- Frame extraction (< 5 seconds)
- Video stitching (< 30 seconds)

**⚠️ Use Polling Pattern (Already in PRD):**
- Video generation (2-3 min per clip) - Start job, poll for status
- Don't wait in API route!

**❌ Consider Alternatives For:**
- Long-running FFmpeg operations
- Large file processing
- Background jobs

---

## The Critical Issue: Function Timeouts

### Vercel Limits:
- **Free Tier**: 10 seconds
- **Pro Tier**: 5 minutes (300 seconds)
- **Enterprise**: 15 minutes (900 seconds)

### Your Requirements:
- Video generation: **2-3 minutes per clip** (5 clips = 10-15 min total)
- Frame extraction: **< 5 seconds** ✅
- Video stitching: **< 30 seconds** ✅
- Storyboard: **< 10 seconds** ✅
- Image generation: **< 5 seconds** ✅

### The Problem:
Even with Pro plan (5 min timeout), you **cannot** wait for video generation in a single API call. But the PRD already solves this with **polling pattern**!

---

## ✅ What Works on Vercel (Current Design)

### 1. Frontend (Perfect Fit)
- Next.js App Router
- Server Components
- Client Components with Zustand
- **Deploy to Vercel: YES**

### 2. Storyboard Generation
- OpenRouter API call: < 10 seconds
- **Deploy to Vercel: YES**

### 3. Image Generation (Start Job)
- Replicate API: Start prediction, return immediately
- Frontend polls for status
- **Deploy to Vercel: YES**

### 4. Video Generation (Start Job)
- Replicate API: Start prediction, return immediately
- Frontend polls for status (2-3 min)
- **Deploy to Vercel: YES** (if using polling)

### 5. Frame Extraction
- FFmpeg: < 5 seconds
- **Deploy to Vercel: YES** (if FFmpeg works)

### 6. Video Stitching
- FFmpeg: < 30 seconds
- **Deploy to Vercel: YES** (if FFmpeg works)

---

## ⚠️ Potential Issues on Vercel

### 1. FFmpeg Availability
**Risk**: FFmpeg might not work on Vercel serverless functions

**Solutions**:
- ✅ Use `@ffmpeg-installer/ffmpeg` npm package
- ✅ Test early (use `/api/test-ffmpeg` endpoint)
- ❌ Fallback: External service (Cloudinary, Mux)

### 2. File Storage
**Risk**: `/tmp` is ephemeral, cleared between invocations

**Solutions**:
- ✅ Upload to S3 immediately after generation
- ✅ Don't rely on `/tmp` for persistence
- ✅ Use S3 for all intermediate files

### 3. Large File Processing
**Risk**: Video files might be too large for serverless

**Solutions**:
- ✅ Process in chunks
- ✅ Stream to S3 directly
- ✅ Use presigned URLs for direct uploads

---

## 🏗️ Recommended Architecture

### Option A: Full Vercel (MVP - Recommended)

```
┌─────────────────┐
│   Vercel (UI)   │
│  Next.js App    │
└────────┬────────┘
         │
         ├─→ API Routes (Vercel Functions)
         │   ├─ Storyboard (OpenRouter) ✅
         │   ├─ Start Image Gen (Replicate) ✅
         │   ├─ Start Video Gen (Replicate) ✅
         │   ├─ Extract Frames (FFmpeg) ⚠️
         │   └─ Stitch Videos (FFmpeg) ⚠️
         │
         └─→ Frontend Polls for Status
             ├─ Poll Image Status
             └─ Poll Video Status
```

**Pros**:
- ✅ Simple deployment
- ✅ One platform
- ✅ Fast iteration
- ✅ Good for MVP

**Cons**:
- ⚠️ FFmpeg might not work
- ⚠️ Function timeout limits
- ⚠️ Ephemeral file storage

**Best For**: MVP (48 hours)

---

### Option B: Hybrid (If FFmpeg Fails)

```
┌─────────────────┐
│   Vercel (UI)   │
│  Next.js App    │
└────────┬────────┘
         │
         ├─→ API Routes (Vercel)
         │   ├─ Storyboard ✅
         │   ├─ Start Image Gen ✅
         │   └─ Start Video Gen ✅
         │
         └─→ External Worker (Railway/Render)
             ├─ Frame Extraction (FFmpeg)
             └─ Video Stitching (FFmpeg)
```

**Pros**:
- ✅ Guaranteed FFmpeg support
- ✅ No timeout limits
- ✅ More reliable

**Cons**:
- ❌ More complex
- ❌ Additional service to manage
- ❌ Slower to set up

**Best For**: If Vercel FFmpeg fails

---

### Option C: Vercel + Background Jobs

```
┌─────────────────┐
│   Vercel (UI)   │
│  Next.js App    │
└────────┬────────┘
         │
         ├─→ API Routes (Vercel)
         │   └─ Queue jobs
         │
         └─→ Background Worker (Vercel Cron/Queue)
             ├─ Process videos
             ├─ Extract frames
             └─ Stitch videos
```

**Pros**:
- ✅ Uses Vercel ecosystem
- ✅ No timeout limits
- ✅ Reliable

**Cons**:
- ❌ Requires Vercel Pro/Enterprise
- ❌ More complex setup
- ❌ Not available in free tier

**Best For**: Production (post-MVP)

---

## 🎯 Recommendation for 48-Hour MVP

### Deploy Everything to Vercel, BUT:

1. **Use Polling Pattern** (Already in PRD ✅)
   - API routes return immediately with `predictionId`
   - Frontend polls `/api/generate-video/[predictionId]`
   - Never wait for 2-3 min video generation in API route

2. **Test FFmpeg Early** (First hour)
   - Use `/api/test-ffmpeg` endpoint
   - If it fails, have fallback ready

3. **Use S3 for All Files**
   - Don't rely on `/tmp`
   - Upload immediately after generation
   - Use presigned URLs for downloads

4. **Handle Timeouts Gracefully**
   - All API routes should return in < 5 seconds
   - Long operations use polling
   - Show clear error messages

---

## 📊 Timeout Analysis

### Current API Route Design (From PRD):

```typescript
// ✅ GOOD: Returns immediately
POST /api/generate-video
→ Starts Replicate job
→ Returns { predictionId }
→ Time: < 1 second

// ✅ GOOD: Quick status check
GET /api/generate-video/[predictionId]
→ Checks Replicate status
→ Returns { status, output? }
→ Time: < 1 second

// ⚠️ RISKY: Might take > 5 seconds
POST /api/extract-frames
→ Runs FFmpeg
→ Returns frames
→ Time: < 5 seconds (should be OK)

// ⚠️ RISKY: Might take > 30 seconds
POST /api/stitch-videos
→ Runs FFmpeg
→ Returns final video
→ Time: < 30 seconds (should be OK)
```

### Verdict:
- ✅ Video generation: Safe (uses polling)
- ✅ Image generation: Safe (uses polling)
- ⚠️ Frame extraction: Should be OK (< 5 sec)
- ⚠️ Video stitching: Should be OK (< 30 sec)

---

## 🚨 Red Flags to Watch

### 1. FFmpeg Not Available
**Symptom**: `/api/test-ffmpeg` fails

**Action**: 
- Try `@ffmpeg-installer/ffmpeg` package
- If still fails, use Option B (External worker)

### 2. Video Stitching Takes > 5 Minutes
**Symptom**: Large videos timeout

**Action**:
- Optimize FFmpeg command (use `-c copy`)
- Process in background job
- Or use external service

### 3. File Size Limits
**Symptom**: Can't upload large videos

**Action**:
- Use S3 presigned URLs (direct upload)
- Or chunk files
- Or use Vercel Blob Storage

---

## ✅ Final Answer

**YES, deploy the entire app to Vercel for MVP**, but:

1. ✅ **Use polling pattern** (already in PRD design)
2. ✅ **Test FFmpeg early** (first hour)
3. ✅ **Use S3 for file storage** (don't rely on /tmp)
4. ✅ **Keep API routes fast** (< 5 seconds, return immediately)
5. ✅ **Have fallback plan** (external worker if FFmpeg fails)

The PRD already has the right architecture with polling. The main risk is FFmpeg, which you should test immediately.

---

## 🛠️ Implementation Checklist

- [ ] Deploy empty Next.js app to Vercel
- [ ] Test FFmpeg endpoint (`/api/test-ffmpeg`)
- [ ] If FFmpeg works: Continue with full Vercel
- [ ] If FFmpeg fails: Set up external worker (Railway/Render)
- [ ] Implement polling pattern for video generation
- [ ] Use S3 for all file storage
- [ ] Test full pipeline on Vercel
- [ ] Monitor function timeouts in Vercel dashboard

---

## 📚 Alternative Services (If Needed)

### For FFmpeg Processing:
- **Railway**: Easy setup, supports FFmpeg
- **Render**: Similar to Railway
- **Fly.io**: Good for long-running processes
- **Cloudinary**: Video processing API (paid)

### For Background Jobs:
- **Vercel Cron** (Pro plan)
- **Inngest** (works with Vercel)
- **Trigger.dev** (works with Vercel)

---

**Bottom Line**: The PRD design is already Vercel-friendly with polling. The only real risk is FFmpeg, which you should test in the first hour. If it works, you're golden. If not, you have time to set up a hybrid solution.

