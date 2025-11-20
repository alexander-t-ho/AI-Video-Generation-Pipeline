-- CreateEnum
CREATE TYPE "FileCategory" AS ENUM ('UPLOADS', 'GENERATED_IMAGES', 'GENERATED_VIDEOS', 'FRAMES', 'PROCESSED', 'TIMELINE_EDITS', 'PREVIEWS', 'FINAL');

-- CreateEnum
CREATE TYPE "ProcessingType" AS ENUM ('ORIGINAL', 'BG_REMOVED', 'EDGE_CLEANED', 'UPSCALED', 'RECOLORED');

-- CreateTable
CREATE TABLE "FileStorage" (
    "id" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "localPath" TEXT,
    "category" "FileCategory" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "contentHash" TEXT,
    "isUploaded" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "projectId" TEXT NOT NULL,
    "sceneId" TEXT,

    CONSTRAINT "FileStorage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedImageVersion" (
    "id" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "localPath" TEXT,
    "processingType" "ProcessingType" NOT NULL,
    "iteration" INTEGER NOT NULL DEFAULT 1,
    "mimeType" TEXT NOT NULL DEFAULT 'image/png',
    "size" INTEGER NOT NULL,
    "isUploaded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedAt" TIMESTAMP(3),
    "originalFileId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sceneId" TEXT,

    CONSTRAINT "ProcessedImageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FileStorage_s3Key_key" ON "FileStorage"("s3Key");

-- CreateIndex
CREATE INDEX "FileStorage_projectId_idx" ON "FileStorage"("projectId");

-- CreateIndex
CREATE INDEX "FileStorage_sceneId_idx" ON "FileStorage"("sceneId");

-- CreateIndex
CREATE INDEX "FileStorage_category_idx" ON "FileStorage"("category");

-- CreateIndex
CREATE INDEX "FileStorage_contentHash_idx" ON "FileStorage"("contentHash");

-- CreateIndex
CREATE INDEX "FileStorage_isUploaded_idx" ON "FileStorage"("isUploaded");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedImageVersion_s3Key_key" ON "ProcessedImageVersion"("s3Key");

-- CreateIndex
CREATE INDEX "ProcessedImageVersion_originalFileId_idx" ON "ProcessedImageVersion"("originalFileId");

-- CreateIndex
CREATE INDEX "ProcessedImageVersion_projectId_idx" ON "ProcessedImageVersion"("projectId");

-- CreateIndex
CREATE INDEX "ProcessedImageVersion_sceneId_idx" ON "ProcessedImageVersion"("sceneId");

-- CreateIndex
CREATE INDEX "ProcessedImageVersion_processingType_idx" ON "ProcessedImageVersion"("processingType");

-- CreateIndex
CREATE INDEX "ProcessedImageVersion_iteration_idx" ON "ProcessedImageVersion"("iteration");

-- AddForeignKey
ALTER TABLE "ProcessedImageVersion" ADD CONSTRAINT "ProcessedImageVersion_originalFileId_fkey" FOREIGN KEY ("originalFileId") REFERENCES "FileStorage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
