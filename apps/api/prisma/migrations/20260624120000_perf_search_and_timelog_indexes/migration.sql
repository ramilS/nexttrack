-- Trigram GIN indexes for substring (ILIKE) search. pg_trgm is created in the
-- init migration. citext columns (users.email, projects.key) are intentionally
-- excluded: gin_trgm_ops has no citext operator class, and Prisma's citext ILIKE
-- would not use a (col::text) expression index.
CREATE INDEX "users_name_trgm_idx" ON "users" USING gin ("name" gin_trgm_ops);
CREATE INDEX "issues_title_trgm_idx" ON "issues" USING gin ("title" gin_trgm_ops);

-- Back the project time-report: filter by issue + date range, order by date.
-- The composite covers the former issue_id-only lookups (prefix), so it replaces it.
DROP INDEX "time_logs_issue_id_idx";
CREATE INDEX "time_logs_issue_id_date_idx" ON "time_logs"("issue_id", "date");
