-- CreateEnum
CREATE TYPE "migration_run_status" AS ENUM ('RUNNING', 'FAILED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "migration_entity_status" AS ENUM ('DISCOVERED', 'TRANSFORMED', 'LOADED', 'VERIFIED', 'FAILED', 'EXCLUDED_APPROVED');

-- CreateTable
CREATE TABLE "migration_runs" (
    "id" TEXT NOT NULL,
    "source_system" VARCHAR(50) NOT NULL,
    "source_tenant" VARCHAR(255) NOT NULL,
    "source_url" VARCHAR(2048) NOT NULL,
    "target_url" VARCHAR(2048) NOT NULL,
    "config" JSONB NOT NULL,
    "config_hash" VARCHAR(64) NOT NULL,
    "spec_version" VARCHAR(50) NOT NULL,
    "exclusion_version" VARCHAR(50) NOT NULL,
    "status" "migration_run_status" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "migration_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_entities" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "source_id" VARCHAR(500) NOT NULL,
    "source_checksum" VARCHAR(64) NOT NULL,
    "target_id" TEXT,
    "status" "migration_entity_status" NOT NULL DEFAULT 'DISCOVERED',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "error_code" VARCHAR(100),
    "error_message" TEXT,
    "error_details" JSONB,
    "discovered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transformed_at" TIMESTAMPTZ(3),
    "loaded_at" TIMESTAMPTZ(3),
    "verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "migration_entities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "migration_runs_source_system_source_tenant_status_idx" ON "migration_runs"("source_system", "source_tenant", "status");

-- CreateIndex
CREATE INDEX "migration_runs_status_updated_at_idx" ON "migration_runs"("status", "updated_at");

-- CreateIndex
CREATE INDEX "migration_entities_run_id_status_entity_type_idx" ON "migration_entities"("run_id", "status", "entity_type");

-- CreateIndex
CREATE INDEX "migration_entities_run_id_target_id_idx" ON "migration_entities"("run_id", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "migration_entities_run_id_entity_type_source_id_key" ON "migration_entities"("run_id", "entity_type", "source_id");

-- AddForeignKey
ALTER TABLE "migration_entities" ADD CONSTRAINT "migration_entities_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "migration_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
