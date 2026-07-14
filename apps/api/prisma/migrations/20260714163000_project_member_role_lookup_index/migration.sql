-- Supports batched Project Admin counts for the admin user-membership view.
CREATE INDEX "project_members_project_id_role_id_idx" ON "project_members"("project_id", "role_id");
