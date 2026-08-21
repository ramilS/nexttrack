-- AlterTable
ALTER TABLE "issues" ADD COLUMN "dedup_key" VARCHAR(200);

-- Partial so a soft-deleted issue does not hold its key forever: without the
-- WHERE clause a deleted issue would permanently block its source from ever
-- opening a new one, with no way to fix it from the UI.
CREATE UNIQUE INDEX "issues_project_dedup_key_unique"
  ON "issues" ("project_id", "dedup_key")
  WHERE "deleted_at" IS NULL;
