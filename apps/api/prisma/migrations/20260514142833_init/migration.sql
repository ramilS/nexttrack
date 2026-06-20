-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateEnum
CREATE TYPE "global_role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "invite_status" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "sso_provider_type" AS ENUM ('GOOGLE', 'MICROSOFT', 'OKTA', 'SAML');

-- CreateEnum
CREATE TYPE "provisioning_policy" AS ENUM ('INVITE_ONLY', 'AUTO_PROVISION');

-- CreateEnum
CREATE TYPE "status_category" AS ENUM ('UNSTARTED', 'STARTED', 'DONE');

-- CreateEnum
CREATE TYPE "issue_type" AS ENUM ('TASK', 'BUG', 'STORY', 'EPIC', 'FEATURE');

-- CreateEnum
CREATE TYPE "priority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "activity_type" AS ENUM ('STATUS_CHANGE', 'ASSIGNEE_CHANGE', 'PRIORITY_CHANGE', 'TYPE_CHANGE', 'TITLE_CHANGE', 'DESCRIPTION_CHANGE', 'TAG_ADD', 'TAG_REMOVE', 'COMMENT_ADD', 'COMMENT_EDIT', 'COMMENT_DELETE', 'ATTACHMENT_ADD', 'ATTACHMENT_DELETE', 'SPRINT_CHANGE', 'ESTIMATE_CHANGE', 'DUE_DATE_CHANGE', 'PARENT_CHANGE', 'WATCHER_ADD', 'WATCHER_REMOVE', 'ISSUE_CREATED', 'ISSUE_DELETED', 'ISSUE_RESTORED', 'FIELD_VALUE_CHANGE', 'TIME_LOG_ADD', 'TIME_LOG_EDIT', 'TIME_LOG_DELETE', 'LINK_ADD', 'LINK_REMOVE');

-- CreateEnum
CREATE TYPE "issue_link_type" AS ENUM ('DEPENDS_ON', 'BLOCKS', 'DUPLICATES', 'RELATES_TO', 'IS_CLONED_FROM');

-- CreateEnum
CREATE TYPE "widget_type" AS ENUM ('MY_ISSUES', 'ASSIGNED_TO_ME', 'RECENT_ACTIVITY', 'PROJECT_PROGRESS', 'SPRINT_BURNDOWN', 'CFD_MINI', 'VELOCITY_MINI', 'ISSUES_BY_STATUS', 'ISSUES_BY_PRIORITY', 'ISSUES_BY_TYPE', 'WATCHED_ISSUES', 'TIME_SPENT_TODAY', 'OVERDUE_ISSUES', 'CUSTOM_FILTER');

-- CreateEnum
CREATE TYPE "assign_strategy" AS ENUM ('SPECIFIC_USER', 'ROUND_ROBIN_TEAM', 'LEAST_LOADED_TEAM', 'PROJECT_LEAD');

-- CreateEnum
CREATE TYPE "custom_field_type" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'DATETIME', 'ENUM', 'MULTI_ENUM', 'USER', 'MULTI_USER', 'VERSION', 'MULTI_VERSION', 'PERIOD', 'URL');

-- CreateEnum
CREATE TYPE "version_status" AS ENUM ('UNRELEASED', 'RELEASED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "board_type" AS ENUM ('KANBAN', 'SCRUM');

-- CreateEnum
CREATE TYPE "sprint_status" AS ENUM ('PLANNING', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "swimlane_by" AS ENUM ('NONE', 'ASSIGNEE', 'EPIC', 'PRIORITY', 'TYPE', 'TEAM');

-- CreateEnum
CREATE TYPE "time_log_source" AS ENUM ('MANUAL', 'TIMER', 'IMPORT');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('ISSUE_ASSIGNED', 'STATUS_CHANGE', 'COMMENT_ADD', 'MENTION', 'ISSUE_RESOLVED', 'DUE_DATE', 'SPRINT_STARTED', 'SPRINT_CLOSED', 'ADDED_TO_PROJECT', 'INVITE_ACCEPTED');

-- CreateEnum
CREATE TYPE "email_mode" AS ENUM ('INSTANT', 'DIGEST', 'OFF');

-- CreateEnum
CREATE TYPE "outbox_status" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "delivery_channel" AS ENUM ('EMAIL', 'WEBHOOK', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "workflow_trigger" AS ENUM ('ON_CREATE', 'ON_STATUS_CHANGE', 'ON_FIELD_CHANGE', 'ON_COMMENT', 'ON_SCHEDULE', 'ON_DUE_DATE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "password_hash" TEXT,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "blocked_at" TIMESTAMPTZ(3),
    "blocked_by_id" TEXT,
    "block_reason" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by_id" TEXT,
    "role" "global_role" NOT NULL DEFAULT 'USER',
    "migrated_from" VARCHAR(50),
    "yt_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "has_password" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invites" (
    "id" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" "global_role" NOT NULL DEFAULT 'USER',
    "sender_id" TEXT NOT NULL,
    "status" "invite_status" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "accepted_by" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sso_providers" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "sso_provider_type" NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "client_id" TEXT NOT NULL,
    "client_secret" TEXT NOT NULL,
    "allowed_domain" TEXT NOT NULL,
    "provisioning_policy" "provisioning_policy" NOT NULL DEFAULT 'INVITE_ONLY',
    "default_role" "global_role" NOT NULL DEFAULT 'USER',
    "attribute_mapping" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT NOT NULL,

    CONSTRAINT "sso_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sso_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sso_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "key" CITEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(1000),
    "icon_url" TEXT,
    "color" TEXT,
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by_id" TEXT,
    "archived_at" TIMESTAMPTZ(3),
    "archived_by_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "user_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invited_by" TEXT,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("user_id","project_id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "statuses" JSONB NOT NULL,
    "transitions" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "color" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_issue_counters" (
    "project_id" TEXT NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "project_issue_counters_pkey" PRIMARY KEY ("project_id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "permissions" JSONB NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" JSONB,
    "type" "issue_type" NOT NULL DEFAULT 'TASK',
    "priority" "priority" NOT NULL DEFAULT 'MEDIUM',
    "status_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "assignee_id" TEXT,
    "parent_id" TEXT,
    "sprint_id" TEXT,
    "estimate" INTEGER,
    "spent" INTEGER NOT NULL DEFAULT 0,
    "start_date" TIMESTAMPTZ(3),
    "due_date" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by_id" TEXT,
    "yt_id" TEXT,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_tags" (
    "issue_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "issue_tags_pkey" PRIMARY KEY ("issue_id","tag_id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "body" JSONB NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by_id" TEXT,
    "edited_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "thumbnail_path" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "type" "activity_type" NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_watchers" (
    "issue_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "issue_watchers_pkey" PRIMARY KEY ("issue_id","user_id")
);

-- CreateTable
CREATE TABLE "issue_links" (
    "id" TEXT NOT NULL,
    "type" "issue_link_type" NOT NULL,
    "source_issue_id" TEXT NOT NULL,
    "target_issue_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "project_id" TEXT NOT NULL,
    "lead_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "team_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("team_id","user_id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "title" VARCHAR(500) NOT NULL,
    "content" JSONB NOT NULL,
    "slug" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "published_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_comments" (
    "id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "article_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboards" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "layout" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dashboards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_widgets" (
    "id" TEXT NOT NULL,
    "dashboard_id" TEXT NOT NULL,
    "type" "widget_type" NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "config" JSONB NOT NULL,

    CONSTRAINT "dashboard_widgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_assign_rules" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "conditions" JSONB NOT NULL,
    "strategy" "assign_strategy" NOT NULL,
    "assignee_id" TEXT,
    "team_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auto_assign_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_fields" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "custom_field_type" NOT NULL,
    "description" VARCHAR(500),
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "ordinal" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "custom_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_field_values" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "custom_field_id" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "custom_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_versions" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "status" "version_status" NOT NULL DEFAULT 'UNRELEASED',
    "release_date" TIMESTAMPTZ(3),
    "ordinal" INTEGER NOT NULL,

    CONSTRAINT "project_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agile_boards" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "board_type" NOT NULL DEFAULT 'KANBAN',
    "columns" JSONB NOT NULL,
    "swimlane_by" "swimlane_by" NOT NULL DEFAULT 'NONE',
    "wip_limits" JSONB,
    "filter_query" TEXT,
    "auto_close_on_done" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT NOT NULL,

    CONSTRAINT "agile_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sprints" (
    "id" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "goal" VARCHAR(1000),
    "start_date" TIMESTAMPTZ(3),
    "end_date" TIMESTAMPTZ(3),
    "status" "sprint_status" NOT NULL DEFAULT 'PLANNING',
    "ordinal" INTEGER NOT NULL,
    "total_issues" INTEGER NOT NULL DEFAULT 0,
    "completed_issues" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_logs" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "description" VARCHAR(1000),
    "source" "time_log_source" NOT NULL DEFAULT 'MANUAL',
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "time_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "notification_type" NOT NULL,
    "payload" JSONB NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "group_key" TEXT,
    "group_count" INTEGER NOT NULL DEFAULT 1,
    "issue_id" TEXT,
    "project_id" TEXT,
    "email_sent" BOOLEAN NOT NULL DEFAULT false,
    "email_sent_at" TIMESTAMPTZ(3),
    "email_scheduled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email_mode" "email_mode" NOT NULL DEFAULT 'INSTANT',
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "channel_settings" JSONB NOT NULL DEFAULT '{}',
    "muted_project_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "muted_issue_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "aggregate_type" VARCHAR(50) NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "channel" "delivery_channel" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "outbox_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "last_error" VARCHAR(2000),
    "next_retry_at" TIMESTAMPTZ(3),
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_webhooks" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "event_types" TEXT[],
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_delivery_at" TIMESTAMPTZ(3),
    "last_status_code" INTEGER,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "disabled_at" TIMESTAMPTZ(3),
    "disabled_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT NOT NULL,

    CONSTRAINT "project_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_delivery_logs" (
    "id" TEXT NOT NULL,
    "webhook_id" TEXT NOT NULL,
    "outbox_event_id" TEXT NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "status_code" INTEGER,
    "success" BOOLEAN NOT NULL,
    "error" VARCHAR(2000),
    "duration_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_delivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_telegram_configs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "bot_token" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "message_template" TEXT,
    "event_types" TEXT[],
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "parse_mode" TEXT NOT NULL DEFAULT 'HTML',
    "last_delivery_at" TIMESTAMPTZ(3),
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "disabled_at" TIMESTAMPTZ(3),
    "disabled_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT NOT NULL,

    CONSTRAINT "project_telegram_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_rules" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "trigger" "workflow_trigger" NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workflow_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_rule_executions" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "triggered_by" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error" VARCHAR(2000),
    "duration" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_rule_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_yt_id_key" ON "users"("yt_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE INDEX "users_is_blocked_idx" ON "users"("is_blocked");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_token_idx" ON "refresh_tokens"("user_id", "token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_key" ON "invites"("token");

-- CreateIndex
CREATE INDEX "invites_token_idx" ON "invites"("token");

-- CreateIndex
CREATE INDEX "invites_email_idx" ON "invites"("email");

-- CreateIndex
CREATE INDEX "invites_status_idx" ON "invites"("status");

-- CreateIndex
CREATE INDEX "invites_status_expires_at_idx" ON "invites"("status", "expires_at");

-- CreateIndex
CREATE INDEX "invites_sender_id_idx" ON "invites"("sender_id");

-- CreateIndex
CREATE INDEX "sso_providers_allowed_domain_idx" ON "sso_providers"("allowed_domain");

-- CreateIndex
CREATE INDEX "sso_providers_type_is_enabled_idx" ON "sso_providers"("type", "is_enabled");

-- CreateIndex
CREATE INDEX "sso_connections_user_id_idx" ON "sso_connections"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sso_connections_provider_id_external_id_key" ON "sso_connections"("provider_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "sso_connections_provider_id_user_id_key" ON "sso_connections"("provider_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_key_key" ON "projects"("key");

-- CreateIndex
CREATE INDEX "projects_key_idx" ON "projects"("key");

-- CreateIndex
CREATE INDEX "projects_deleted_at_idx" ON "projects"("deleted_at");

-- CreateIndex
CREATE INDEX "projects_archived_at_idx" ON "projects"("archived_at");

-- CreateIndex
CREATE INDEX "project_members_user_id_idx" ON "project_members"("user_id");

-- CreateIndex
CREATE INDEX "project_members_project_id_idx" ON "project_members"("project_id");

-- CreateIndex
CREATE INDEX "project_members_role_id_idx" ON "project_members"("role_id");

-- CreateIndex
CREATE INDEX "workflows_project_id_idx" ON "workflows"("project_id");

-- CreateIndex
CREATE INDEX "tags_project_id_idx" ON "tags"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_project_id_name_key" ON "tags"("project_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "issues_yt_id_key" ON "issues"("yt_id");

-- CreateIndex
CREATE INDEX "issues_project_id_status_id_idx" ON "issues"("project_id", "status_id");

-- CreateIndex
CREATE INDEX "issues_project_id_assignee_id_idx" ON "issues"("project_id", "assignee_id");

-- CreateIndex
CREATE INDEX "issues_project_id_priority_idx" ON "issues"("project_id", "priority");

-- CreateIndex
CREATE INDEX "issues_project_id_created_at_idx" ON "issues"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "issues_project_id_updated_at_idx" ON "issues"("project_id", "updated_at");

-- CreateIndex
CREATE INDEX "issues_parent_id_idx" ON "issues"("parent_id");

-- CreateIndex
CREATE INDEX "issues_sprint_id_idx" ON "issues"("sprint_id");

-- CreateIndex
CREATE INDEX "issues_deleted_at_idx" ON "issues"("deleted_at");

-- CreateIndex
CREATE INDEX "issues_project_id_type_idx" ON "issues"("project_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "issues_project_id_number_key" ON "issues"("project_id", "number");

-- CreateIndex
CREATE INDEX "issue_tags_tag_id_idx" ON "issue_tags"("tag_id");

-- CreateIndex
CREATE INDEX "comments_issue_id_created_at_idx" ON "comments"("issue_id", "created_at");

-- CreateIndex
CREATE INDEX "comments_author_id_idx" ON "comments"("author_id");

-- CreateIndex
CREATE INDEX "comments_parent_id_idx" ON "comments"("parent_id");

-- CreateIndex
CREATE INDEX "comments_deleted_at_idx" ON "comments"("deleted_at");

-- CreateIndex
CREATE INDEX "attachments_issue_id_idx" ON "attachments"("issue_id");

-- CreateIndex
CREATE INDEX "attachments_uploaded_by_id_idx" ON "attachments"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "activities_issue_id_created_at_idx" ON "activities"("issue_id", "created_at");

-- CreateIndex
CREATE INDEX "activities_actor_id_idx" ON "activities"("actor_id");

-- CreateIndex
CREATE INDEX "activities_actor_id_created_at_idx" ON "activities"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "activities_type_idx" ON "activities"("type");

-- CreateIndex
CREATE INDEX "issue_watchers_user_id_idx" ON "issue_watchers"("user_id");

-- CreateIndex
CREATE INDEX "issue_links_source_issue_id_idx" ON "issue_links"("source_issue_id");

-- CreateIndex
CREATE INDEX "issue_links_target_issue_id_idx" ON "issue_links"("target_issue_id");

-- CreateIndex
CREATE UNIQUE INDEX "issue_links_source_issue_id_target_issue_id_type_key" ON "issue_links"("source_issue_id", "target_issue_id", "type");

-- CreateIndex
CREATE INDEX "teams_project_id_idx" ON "teams"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_project_id_name_key" ON "teams"("project_id", "name");

-- CreateIndex
CREATE INDEX "team_members_user_id_idx" ON "team_members"("user_id");

-- CreateIndex
CREATE INDEX "articles_project_id_parent_id_sort_order_idx" ON "articles"("project_id", "parent_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "articles_project_id_slug_key" ON "articles"("project_id", "slug");

-- CreateIndex
CREATE INDEX "article_comments_article_id_created_at_idx" ON "article_comments"("article_id", "created_at");

-- CreateIndex
CREATE INDEX "dashboards_user_id_idx" ON "dashboards"("user_id");

-- CreateIndex
CREATE INDEX "auto_assign_rules_project_id_is_enabled_priority_idx" ON "auto_assign_rules"("project_id", "is_enabled", "priority");

-- CreateIndex
CREATE INDEX "custom_fields_project_id_ordinal_idx" ON "custom_fields"("project_id", "ordinal");

-- CreateIndex
CREATE INDEX "custom_fields_deleted_at_idx" ON "custom_fields"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "custom_fields_project_id_name_key" ON "custom_fields"("project_id", "name");

-- CreateIndex
CREATE INDEX "custom_field_values_custom_field_id_idx" ON "custom_field_values"("custom_field_id");

-- CreateIndex
CREATE INDEX "custom_field_values_issue_id_idx" ON "custom_field_values"("issue_id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_values_issue_id_custom_field_id_key" ON "custom_field_values"("issue_id", "custom_field_id");

-- CreateIndex
CREATE INDEX "project_versions_project_id_status_idx" ON "project_versions"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "project_versions_project_id_name_key" ON "project_versions"("project_id", "name");

-- CreateIndex
CREATE INDEX "agile_boards_project_id_idx" ON "agile_boards"("project_id");

-- CreateIndex
CREATE INDEX "sprints_board_id_status_idx" ON "sprints"("board_id", "status");

-- CreateIndex
CREATE INDEX "sprints_board_id_ordinal_idx" ON "sprints"("board_id", "ordinal");

-- CreateIndex
CREATE INDEX "time_logs_issue_id_idx" ON "time_logs"("issue_id");

-- CreateIndex
CREATE INDEX "time_logs_user_id_date_idx" ON "time_logs"("user_id", "date");

-- CreateIndex
CREATE INDEX "time_logs_date_idx" ON "time_logs"("date");

-- CreateIndex
CREATE INDEX "time_logs_deleted_at_idx" ON "time_logs"("deleted_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_group_key_idx" ON "notifications"("group_key");

-- CreateIndex
CREATE INDEX "notifications_issue_id_idx" ON "notifications"("issue_id");

-- CreateIndex
CREATE INDEX "notifications_project_id_idx" ON "notifications"("project_id");

-- CreateIndex
CREATE INDEX "notifications_email_sent_email_scheduled_at_idx" ON "notifications"("email_sent", "email_scheduled_at");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"("user_id");

-- CreateIndex
CREATE INDEX "outbox_events_status_next_retry_at_idx" ON "outbox_events"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "outbox_events_status_idx" ON "outbox_events"("status");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

-- CreateIndex
CREATE INDEX "outbox_events_created_at_idx" ON "outbox_events"("created_at");

-- CreateIndex
CREATE INDEX "outbox_events_status_processed_at_idx" ON "outbox_events"("status", "processed_at");

-- CreateIndex
CREATE INDEX "project_webhooks_project_id_is_enabled_idx" ON "project_webhooks"("project_id", "is_enabled");

-- CreateIndex
CREATE INDEX "webhook_delivery_logs_webhook_id_created_at_idx" ON "webhook_delivery_logs"("webhook_id", "created_at");

-- CreateIndex
CREATE INDEX "webhook_delivery_logs_outbox_event_id_idx" ON "webhook_delivery_logs"("outbox_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_telegram_configs_project_id_key" ON "project_telegram_configs"("project_id");

-- CreateIndex
CREATE INDEX "workflow_rules_project_id_is_enabled_trigger_idx" ON "workflow_rules"("project_id", "is_enabled", "trigger");

-- CreateIndex
CREATE INDEX "workflow_rule_executions_rule_id_created_at_idx" ON "workflow_rule_executions"("rule_id", "created_at");

-- CreateIndex
CREATE INDEX "workflow_rule_executions_issue_id_idx" ON "workflow_rule_executions"("issue_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_blocked_by_id_fkey" FOREIGN KEY ("blocked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_providers" ADD CONSTRAINT "sso_providers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_connections" ADD CONSTRAINT "sso_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_connections" ADD CONSTRAINT "sso_connections_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "sso_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_archived_by_id_fkey" FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_issue_counters" ADD CONSTRAINT "project_issue_counters_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "sprints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_tags" ADD CONSTRAINT "issue_tags_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_tags" ADD CONSTRAINT "issue_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_watchers" ADD CONSTRAINT "issue_watchers_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_watchers" ADD CONSTRAINT "issue_watchers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_links" ADD CONSTRAINT "issue_links_source_issue_id_fkey" FOREIGN KEY ("source_issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_links" ADD CONSTRAINT "issue_links_target_issue_id_fkey" FOREIGN KEY ("target_issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_links" ADD CONSTRAINT "issue_links_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_dashboard_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_assign_rules" ADD CONSTRAINT "auto_assign_rules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_assign_rules" ADD CONSTRAINT "auto_assign_rules_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_assign_rules" ADD CONSTRAINT "auto_assign_rules_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_custom_field_id_fkey" FOREIGN KEY ("custom_field_id") REFERENCES "custom_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agile_boards" ADD CONSTRAINT "agile_boards_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "agile_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_logs" ADD CONSTRAINT "time_logs_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_logs" ADD CONSTRAINT "time_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_webhooks" ADD CONSTRAINT "project_webhooks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_webhooks" ADD CONSTRAINT "project_webhooks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_delivery_logs" ADD CONSTRAINT "webhook_delivery_logs_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "project_webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_telegram_configs" ADD CONSTRAINT "project_telegram_configs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_telegram_configs" ADD CONSTRAINT "project_telegram_configs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_rules" ADD CONSTRAINT "workflow_rules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_rules" ADD CONSTRAINT "workflow_rules_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_rules" ADD CONSTRAINT "workflow_rules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_rule_executions" ADD CONSTRAINT "workflow_rule_executions_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "workflow_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

