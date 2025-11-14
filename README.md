# AI Video Generation Pipeline

An end-to-end AI video generation pipeline that converts user prompts into professional-quality video advertisements.

## Overview

This project generates 5-scene video advertisements from text prompts using AI-powered storyboard generation, image creation, and video synthesis.

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **State Management**: Zustand
- **Storage**: Local filesystem (temp) + AWS S3 (finals)
- **Video Processing**: FFmpeg (server-side)
- **Deployment**: Vercel

## Getting Started

Coming soon...

## Environment Variables

Create a `.env.local` file with the following variables (see `.env.example` for reference):

- `REPLICATE_API_TOKEN` - For image and video generation
- `OPENROUTER_API_KEY` - For storyboard generation
- `AWS_ACCESS_KEY_ID` - For S3 storage
- `AWS_SECRET_ACCESS_KEY` - For S3 storage
- `AWS_S3_BUCKET` - S3 bucket name

**Note**: Never commit API keys or sensitive information to the repository.

## License

MIT

