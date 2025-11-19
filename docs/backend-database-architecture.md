# Backend & Database Architecture

## Overview

This document outlines the backend infrastructure and database schema for the AI Video Generation Pipeline. The system supports a company hierarchy where each company has users, assets, car models, and projects.

## Database Schema

### Core Entities

#### Company
- `id` - UUID primary key
- `name` - Company name
- `createdAt` - Timestamp
- `updatedAt` - Timestamp

#### User
- `id` - UUID primary key
- `email` - Unique email address
- `name` - Display name
- `password` - Hashed password
- `companyId` - Foreign key to Company
- `role` - ADMIN or MEMBER
- `createdAt` - Timestamp
- `updatedAt` - Timestamp

#### CompanyAsset
- `id` - UUID primary key
- `companyId` - Foreign key to Company
- `type` - LOGO, COLOR_SCHEME, BADGE, etc.
- `value` - JSON data (hex colors, settings, etc.)
- `s3Key` - S3 storage key for file assets
- `filename` - Original filename
- `createdAt` - Timestamp

### Car Model Hierarchy

#### CarModel
- `id` - UUID primary key
- `companyId` - Foreign key to Company
- `name` - Model name (e.g., "Mustang", "Camaro")
- `createdAt` - Timestamp
- `updatedAt` - Timestamp

#### CarVariant
- `id` - UUID primary key
- `modelId` - Foreign key to CarModel
- `year` - Model year (e.g., 2024)
- `trim` - Trim level (e.g., "GT", "Base", "Premium")
- `createdAt` - Timestamp

#### CarMedia
- `id` - UUID primary key
- `variantId` - Foreign key to CarVariant
- `type` - EXTERIOR, INTERIOR, SOUND, 3D_MODEL
- `s3Key` - S3 storage key
- `filename` - Original filename
- `mimeType` - File MIME type
- `size` - File size in bytes
- `createdAt` - Timestamp

### Project Entities

#### Project
- `id` - UUID primary key
- `companyId` - Foreign key to Company
- `ownerId` - Foreign key to User (creator)
- `name` - Project name
- `prompt` - Original generation prompt
- `targetDuration` - Target video duration (15, 30, 60 seconds)
- `status` - STORYBOARD, SCENE_GENERATION, STITCHING, COMPLETED
- `finalVideoUrl` - URL to final stitched video
- `finalVideoS3Key` - S3 key for final video
- `characterDescription` - AI-extracted character description
- `createdAt` - Timestamp
- `updatedAt` - Timestamp

#### Scene
- `id` - UUID primary key
- `projectId` - Foreign key to Project
- `sceneNumber` - Order index (1, 2, 3, etc.)
- `sceneTitle` - Title of the scene
- `sceneSummary` - Summary/description of the scene
- `imagePrompt` - Prompt for image generation
- `suggestedDuration` - Suggested duration in seconds
- `negativePrompt` - Negative prompt for generation
- `customDuration` - User-overridden duration
- `customImageInput` - Custom image URL
- `useSeedFrame` - Boolean to use seed frame
- `status` - PENDING, GENERATING_IMAGE, IMAGE_READY, GENERATING_VIDEO, VIDEO_READY, COMPLETED
- `createdAt` - Timestamp
- `updatedAt` - Timestamp

#### GeneratedImage
- `id` - UUID primary key
- `sceneId` - Foreign key to Scene
- `url` - Public URL
- `s3Key` - S3 storage key
- `localPath` - Local file path (temporary)
- `prompt` - Generation prompt used
- `replicateId` - Replicate prediction ID
- `isSelected` - Boolean if currently selected
- `createdAt` - Timestamp

#### GeneratedVideo
- `id` - UUID primary key
- `sceneId` - Foreign key to Scene
- `url` - Public URL
- `s3Key` - S3 storage key
- `localPath` - Local file path (temporary)
- `duration` - Actual duration in seconds
- `prompt` - Generation prompt used
- `isSelected` - Boolean if currently selected
- `createdAt` - Timestamp

#### SeedFrame
- `id` - UUID primary key
- `sceneId` - Foreign key to Scene
- `url` - Public URL
- `s3Key` - S3 storage key
- `frameIndex` - Frame number extracted
- `isSelected` - Boolean if currently selected
- `createdAt` - Timestamp

#### TimelineClip
- `id` - UUID primary key
- `projectId` - Foreign key to Project
- `sceneId` - Foreign key to Scene
- `videoId` - Foreign key to GeneratedVideo
- `title` - Clip title
- `startTime` - Start time in timeline
- `duration` - Clip duration
- `trimStart` - Trim start point in source video
- `trimEnd` - Trim end point in source video
- `order` - Order in timeline
- `createdAt` - Timestamp
- `updatedAt` - Timestamp

#### UploadedImage
- `id` - UUID primary key
- `projectId` - Foreign key to Project
- `url` - Public URL
- `s3Key` - S3 storage key
- `originalName` - Original filename
- `mimeType` - File MIME type
- `size` - File size in bytes
- `createdAt` - Timestamp

## Authentication

### NextAuth.js Configuration
- Provider: Credentials (email/password)
- Session strategy: JWT
- Token includes: userId, companyId, role

### Role-Based Access Control
- **ADMIN**: Can manage company settings, users, assets, and all projects
- **MEMBER**: Can create and manage own projects, view company projects

## API Endpoints

### Authentication
- `POST /api/auth/signin` - Sign in
- `POST /api/auth/signup` - Sign up (creates user + optionally company)
- `POST /api/auth/signout` - Sign out
- `GET /api/auth/session` - Get current session

### Company Management
- `POST /api/companies` - Create company (admin only)
- `GET /api/companies/[id]` - Get company details
- `PATCH /api/companies/[id]` - Update company
- `POST /api/companies/[id]/assets` - Upload company asset
- `GET /api/companies/[id]/assets` - List company assets
- `DELETE /api/companies/[id]/assets/[assetId]` - Delete asset

### User Management
- `GET /api/companies/[id]/users` - List company users
- `POST /api/companies/[id]/users` - Invite user to company
- `PATCH /api/users/[id]` - Update user profile
- `DELETE /api/companies/[id]/users/[userId]` - Remove user from company

### Car Management
- `POST /api/companies/[id]/cars` - Create car model
- `GET /api/companies/[id]/cars` - List all car models
- `GET /api/cars/[modelId]` - Get car model with variants
- `PATCH /api/cars/[modelId]` - Update car model
- `DELETE /api/cars/[modelId]` - Delete car model
- `POST /api/cars/[modelId]/variants` - Add variant (year/trim)
- `PATCH /api/cars/variants/[variantId]` - Update variant
- `DELETE /api/cars/variants/[variantId]` - Delete variant
- `POST /api/cars/variants/[variantId]/media` - Upload media
- `GET /api/cars/variants/[variantId]/media` - List media
- `DELETE /api/cars/media/[mediaId]` - Delete media

### Project Management
- `POST /api/projects` - Create project (sets owner to current user)
- `GET /api/projects` - List projects
  - Query params: `?scope=mine|company` (default: mine)
- `GET /api/projects/[id]` - Get project with all scenes/images/videos
- `PATCH /api/projects/[id]` - Update project
- `DELETE /api/projects/[id]` - Delete project

### Scene Management
- `POST /api/projects/[id]/scenes` - Add scene
- `PATCH /api/projects/[id]/scenes/[sceneId]` - Update scene
- `DELETE /api/projects/[id]/scenes/[sceneId]` - Delete scene

### Generation Endpoints (existing, updated with auth)
- `POST /api/generate-image` - Generate image for scene
- `POST /api/generate-video` - Generate video for scene
- `POST /api/stitch-videos` - Stitch videos for project

## S3 Storage Structure

```
s3://bucket/
├── companies/
│   └── [companyId]/
│       ├── assets/
│       │   ├── logos/
│       │   │   └── [assetId].[ext]
│       │   ├── badges/
│       │   │   └── [assetId].[ext]
│       │   └── color-schemes/
│       │       └── [assetId].json
│       └── cars/
│           └── [modelId]/
│               └── [variantId]/
│                   ├── exterior/
│                   │   └── [mediaId].[ext]
│                   ├── interior/
│                   │   └── [mediaId].[ext]
│                   ├── sounds/
│                   │   └── [mediaId].[ext]
│                   └── 3d-models/
│                       └── [mediaId].[ext]
└── projects/
    └── [projectId]/
        ├── uploads/
        │   └── [imageId].[ext]
        ├── scenes/
        │   └── [sceneId]/
        │       ├── images/
        │       │   └── [imageId].[ext]
        │       ├── videos/
        │       │   └── [videoId].mp4
        │       └── seed-frames/
        │           └── [frameId].png
        └── final/
            └── video.mp4
```

## Implementation Order

1. **Database Setup**
   - Install Prisma ORM
   - Create PostgreSQL database
   - Define schema
   - Run migrations

2. **Authentication**
   - Configure NextAuth.js
   - Create auth API routes
   - Add middleware for protected routes

3. **Company & User Management**
   - Company CRUD endpoints
   - User invitation system
   - Role-based access middleware

4. **Car Model Hierarchy**
   - Car model CRUD
   - Variant management
   - Media upload to S3

5. **Project Persistence**
   - Project CRUD with ownership
   - Scene persistence
   - Generated assets persistence

6. **Frontend Integration**
   - Auth context and protected routes
   - Login/signup pages
   - Project selector (My Projects / Company Projects)
   - Company asset browser

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/ai_video_pipeline"

# NextAuth
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"

# AWS S3
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
AWS_S3_BUCKET="your-bucket-name"
AWS_REGION="us-east-1"

# AI Services (existing)
REPLICATE_API_TOKEN="your-replicate-token"
OPENROUTER_API_KEY="your-openrouter-key"
```
