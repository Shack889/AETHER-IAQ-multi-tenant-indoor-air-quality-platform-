-- Per-node data source control: independent mock/hardware enable flags + per-reading source tag

-- Add the legacy display field first so the backfill UPDATEs below can reference it.
-- IF NOT EXISTS is defensive in case a prior failed attempt partially applied this migration.
ALTER TABLE "Node"
  ADD COLUMN IF NOT EXISTS "dataSource" TEXT NOT NULL DEFAULT 'live';

ALTER TABLE "Node"
  ADD COLUMN IF NOT EXISTS "mockEnabled"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "hardwareEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Backfill flags from the legacy `dataSource` field so existing nodes keep behaving
-- the same way after this migration (mock-only nodes stay mock, live nodes stay live,
-- simulation nodes are left untouched — sim engine owns those flags entirely).
UPDATE "Node" SET "mockEnabled"     = true,  "hardwareEnabled" = false WHERE "dataSource" = 'mock';
UPDATE "Node" SET "mockEnabled"     = false, "hardwareEnabled" = true  WHERE "dataSource" = 'live';

ALTER TABLE "Reading"
  ADD COLUMN "simulated" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ProcessedData"
  ADD COLUMN "simulated" BOOLEAN NOT NULL DEFAULT false;
