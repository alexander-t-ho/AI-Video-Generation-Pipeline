-- AlterTable
ALTER TABLE "Scene" ADD COLUMN "videoPrompt" TEXT NOT NULL DEFAULT '';

-- Update existing rows to use imagePrompt as videoPrompt (backward compatibility)
UPDATE "Scene" SET "videoPrompt" = "imagePrompt" WHERE "videoPrompt" = '';



