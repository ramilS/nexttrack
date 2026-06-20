-- Tenant isolation for issue↔tag links: a tag from project B must never be
-- linkable to an issue in project A. Enforced structurally by denormalizing
-- project_id onto issue_tags and pointing BOTH foreign keys at the composite
-- (id, project_id) of issues and tags — so the single project_id column must
-- equal both parents' project.

-- 1. Composite unique targets the new FKs reference.
CREATE UNIQUE INDEX "issues_id_project_id_key" ON "issues"("id", "project_id");
CREATE UNIQUE INDEX "tags_id_project_id_key" ON "tags"("id", "project_id");

-- 2. Add the denormalized column (nullable for backfill).
ALTER TABLE "issue_tags" ADD COLUMN "project_id" TEXT;

-- 3. Backfill from the owning issue's project.
UPDATE "issue_tags" it
SET "project_id" = i."project_id"
FROM "issues" i
WHERE it."issue_id" = i."id";

-- 4. Drop any pre-existing cross-project links (tag's project ≠ issue's
--    project) — these are the corrupt rows the old single-column FKs allowed,
--    and would block the composite FK below.
DELETE FROM "issue_tags" it
USING "tags" t
WHERE it."tag_id" = t."id"
  AND t."project_id" <> it."project_id";

-- 5. Lock the column down.
ALTER TABLE "issue_tags" ALTER COLUMN "project_id" SET NOT NULL;

-- 6. Swap the single-column FKs for composite ones.
ALTER TABLE "issue_tags" DROP CONSTRAINT "issue_tags_issue_id_fkey";
ALTER TABLE "issue_tags" DROP CONSTRAINT "issue_tags_tag_id_fkey";

ALTER TABLE "issue_tags" ADD CONSTRAINT "issue_tags_issue_id_project_id_fkey"
  FOREIGN KEY ("issue_id", "project_id") REFERENCES "issues"("id", "project_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "issue_tags" ADD CONSTRAINT "issue_tags_tag_id_project_id_fkey"
  FOREIGN KEY ("tag_id", "project_id") REFERENCES "tags"("id", "project_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. Index the new column (FK lookups + Prisma @@index([projectId])).
CREATE INDEX "issue_tags_project_id_idx" ON "issue_tags"("project_id");
