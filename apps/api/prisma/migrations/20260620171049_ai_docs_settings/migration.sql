-- CreateTable
CREATE TABLE "project_ai_docs_settings" (
    "project_id" TEXT NOT NULL,
    "suggestion_prompt" TEXT,
    "merge_prompt" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_ai_docs_settings_pkey" PRIMARY KEY ("project_id")
);

-- AddForeignKey
ALTER TABLE "project_ai_docs_settings" ADD CONSTRAINT "project_ai_docs_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
