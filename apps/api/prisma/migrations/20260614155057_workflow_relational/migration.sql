-- CreateEnum
CREATE TYPE "workflow_transition_role" AS ENUM ('OWNER', 'DEVELOPER', 'VIEWER');

-- CreateTable
CREATE TABLE "workflow_statuses" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "color" TEXT NOT NULL,
    "category" "status_category" NOT NULL,
    "is_initial" BOOLEAN NOT NULL,
    "is_resolved" BOOLEAN NOT NULL,
    "ordinal" INTEGER NOT NULL,

    CONSTRAINT "workflow_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_transitions" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "from_status_id" TEXT,
    "to_status_id" TEXT NOT NULL,
    "requiredRole" "workflow_transition_role",

    CONSTRAINT "workflow_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workflow_statuses_workflow_id_ordinal_key" ON "workflow_statuses"("workflow_id", "ordinal");

-- CreateIndex
CREATE INDEX "workflow_statuses_workflow_id_idx" ON "workflow_statuses"("workflow_id");

-- CreateIndex
CREATE INDEX "workflow_transitions_workflow_id_idx" ON "workflow_transitions"("workflow_id");

-- Backfill statuses from JSON (preserve ids so issues.status_id still resolves)
INSERT INTO "workflow_statuses" ("id", "workflow_id", "name", "color", "category", "is_initial", "is_resolved", "ordinal")
SELECT s."id", w."id", s."name", s."color", s."category"::"status_category", s."isInitial", s."isResolved", s."ordinal"
FROM "workflows" w,
  LATERAL jsonb_to_recordset(w."statuses") AS s(
    "id" text, "name" text, "color" text, "category" text,
    "isInitial" boolean, "isResolved" boolean, "ordinal" integer
  );

-- Backfill transitions ('*' wildcard → NULL)
INSERT INTO "workflow_transitions" ("id", "workflow_id", "name", "from_status_id", "to_status_id", "requiredRole")
SELECT t."id", w."id", t."name",
  NULLIF(t."fromStatusId", '*'),
  t."toStatusId",
  t."requiredRole"::"workflow_transition_role"
FROM "workflows" w,
  LATERAL jsonb_to_recordset(w."transitions") AS t(
    "id" text, "name" text, "fromStatusId" text, "toStatusId" text, "requiredRole" text
  );

-- Orphan guard: fail loudly if any issue points at a status with no backfilled row
DO $$
DECLARE orphans text;
BEGIN
  SELECT string_agg(DISTINCT i."status_id", ', ')
    INTO orphans
  FROM "issues" i
  LEFT JOIN "workflow_statuses" s ON s."id" = i."status_id"
  WHERE s."id" IS NULL;
  IF orphans IS NOT NULL THEN
    RAISE EXCEPTION 'Aborting migration: issues.status_id with no workflow status: %', orphans;
  END IF;
END $$;

-- AddForeignKey
ALTER TABLE "workflow_statuses" ADD CONSTRAINT "workflow_statuses_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_from_status_id_fkey" FOREIGN KEY ("from_status_id") REFERENCES "workflow_statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "workflow_statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (Issue.status — RESTRICT: cannot drop a status with issues on it)
ALTER TABLE "issues" ADD CONSTRAINT "issues_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "workflow_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop the now-migrated JSON columns
ALTER TABLE "workflows" DROP COLUMN "statuses";
ALTER TABLE "workflows" DROP COLUMN "transitions";
