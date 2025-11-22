-- AlterTable
ALTER TABLE "Scene" ADD COLUMN     "modelParameters" JSONB,
ALTER COLUMN "videoPrompt" DROP DEFAULT;
