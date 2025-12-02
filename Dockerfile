FROM node:18-alpine

# Install FFmpeg and bash
RUN apk add --no-cache ffmpeg bash

WORKDIR /app

# Copy package files and Prisma schema first for better caching
COPY package*.json ./
COPY prisma ./prisma

# Install dependencies
RUN npm ci && \
    npm cache clean --force

# Copy application code
COPY . .

# Generate Prisma client and build
RUN npm run build

# Copy static assets to standalone directory
# This is required for "output: standalone" to work correctly
RUN cp -r public .next/standalone/ && \
    cp -r .next/static .next/standalone/.next/

# Prune dev dependencies to keep image size down
RUN npm prune --production

# Create required directories for media serving
RUN mkdir -p /tmp/projects /tmp/thumbnails /tmp/temp-downloads /tmp/s3-thumbnails /tmp/edge-cleanup /tmp/music-analysis

EXPOSE 3000

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

# Copy and make start script executable
COPY start.sh ./
RUN chmod +x start.sh

# Start the app with migration deployment
CMD ["./start.sh"]
