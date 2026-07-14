DO $$
DECLARE
  "existing_runs" BIGINT;
BEGIN
  SELECT count(*) INTO "existing_runs" FROM "migration_runs";
  IF "existing_runs" > 0 THEN
    RAISE EXCEPTION
      'Cannot add migration run fingerprints: % pre-existing run(s) require reconciliation',
      "existing_runs";
  END IF;
END;
$$;

ALTER TABLE "migration_runs"
ADD COLUMN "fingerprint_hash" VARCHAR(64) NOT NULL;

CREATE INDEX "migration_runs_fingerprint_hash_status_idx"
ON "migration_runs"("fingerprint_hash", "status");

CREATE UNIQUE INDEX "migration_runs_active_fingerprint_hash_key"
ON "migration_runs"("fingerprint_hash")
WHERE "status" <> 'COMPLETED';
