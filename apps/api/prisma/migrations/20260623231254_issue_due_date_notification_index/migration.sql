-- Backs IssuesRepository.findDueIssuesForNotification (due-date notification cron):
-- equality on resolved_at/deleted_at (both NULL), range scan on due_date.
-- Without it the cron full-scans the issues table on every run.
CREATE INDEX "issues_resolved_at_deleted_at_due_date_idx" ON "issues"("resolved_at", "deleted_at", "due_date");

-- Covers the board/backlog read (findManyForBoard / findManyForBoardRaw):
-- WHERE project_id + deleted_at IS NULL, ORDER BY priority, created_at.
-- Without it Postgres scans by project and sorts every board render.
CREATE INDEX "issues_project_id_deleted_at_priority_created_at_idx" ON "issues"("project_id", "deleted_at", "priority", "created_at");
