-- Match the manifest's bounded ID-cursor order for unfiltered and queue-filtered lists.
DROP INDEX "migration_entities_run_id_status_entity_type_idx";

CREATE INDEX "migration_entities_run_id_id_idx"
ON "migration_entities"("run_id", "id");

CREATE INDEX "migration_entities_run_id_status_id_idx"
ON "migration_entities"("run_id", "status", "id");

CREATE INDEX "migration_entities_run_id_entity_type_id_idx"
ON "migration_entities"("run_id", "entity_type", "id");

CREATE INDEX "migration_entities_run_id_status_entity_type_id_idx"
ON "migration_entities"("run_id", "status", "entity_type", "id");
