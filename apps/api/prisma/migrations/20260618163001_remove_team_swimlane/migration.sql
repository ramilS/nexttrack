-- AlterEnum
BEGIN;
CREATE TYPE "swimlane_by_new" AS ENUM ('NONE', 'ASSIGNEE', 'EPIC', 'PRIORITY', 'TYPE');
ALTER TABLE "public"."agile_boards" ALTER COLUMN "swimlane_by" DROP DEFAULT;
ALTER TABLE "agile_boards" ALTER COLUMN "swimlane_by" TYPE "swimlane_by_new" USING ("swimlane_by"::text::"swimlane_by_new");
ALTER TYPE "swimlane_by" RENAME TO "swimlane_by_old";
ALTER TYPE "swimlane_by_new" RENAME TO "swimlane_by";
DROP TYPE "public"."swimlane_by_old";
ALTER TABLE "agile_boards" ALTER COLUMN "swimlane_by" SET DEFAULT 'NONE';
COMMIT;
