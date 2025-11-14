FROM node:18-alpine

# Install FFmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Build the app
RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production

CMD ["npm", "start"]
