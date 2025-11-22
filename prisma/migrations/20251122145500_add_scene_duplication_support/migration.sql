-- AlterTable: Change sceneNumber from Int to Float to support sub-numbering (1.1, 2.1, etc.)
ALTER TABLE "Scene"
  ALTER COLUMN "sceneNumber" TYPE DOUBLE PRECISION;

-- AlterTable: Add isDuplicate and parentSceneId columns
ALTER TABLE "Scene"
  ADD COLUMN "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "parentSceneId" TEXT;
