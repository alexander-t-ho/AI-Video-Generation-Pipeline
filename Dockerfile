FROM node:18-alpine

# Install FFmpeg (this is automatic on Railway!)
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]