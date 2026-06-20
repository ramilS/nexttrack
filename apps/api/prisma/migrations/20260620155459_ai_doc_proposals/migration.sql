-- CreateEnum
CREATE TYPE "doc_update_proposal_status" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "doc_update_proposals" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "source_issue_id" TEXT NOT NULL,
    "doc_issue_id" TEXT NOT NULL,
    "target_article_id" TEXT,
    "proposed_title" VARCHAR(500) NOT NULL,
    "proposed_content" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "status" "doc_update_proposal_status" NOT NULL DEFAULT 'PENDING',
    "base_article_sha" TEXT,
    "base_article_updated_at" TIMESTAMPTZ(3),
    "conflict_resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMPTZ(3),

    CONSTRAINT "doc_update_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "doc_update_proposals_doc_issue_id_key" ON "doc_update_proposals"("doc_issue_id");

-- CreateIndex
CREATE INDEX "doc_update_proposals_project_id_idx" ON "doc_update_proposals"("project_id");

-- CreateIndex
CREATE INDEX "doc_update_proposals_source_issue_id_idx" ON "doc_update_proposals"("source_issue_id");

-- CreateIndex
CREATE INDEX "doc_update_proposals_status_idx" ON "doc_update_proposals"("status");

-- AddForeignKey
ALTER TABLE "doc_update_proposals" ADD CONSTRAINT "doc_update_proposals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_update_proposals" ADD CONSTRAINT "doc_update_proposals_source_issue_id_fkey" FOREIGN KEY ("source_issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_update_proposals" ADD CONSTRAINT "doc_update_proposals_doc_issue_id_fkey" FOREIGN KEY ("doc_issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_update_proposals" ADD CONSTRAINT "doc_update_proposals_target_article_id_fkey" FOREIGN KEY ("target_article_id") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
