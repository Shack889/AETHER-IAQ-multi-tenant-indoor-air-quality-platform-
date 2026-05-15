-- Per-node data source control: independent mock/hardware enable flags + per-reading source tag

ALTER TABLE "Node"
  ADD COLUMN "mockEnabled"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hardwareEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Backfill flags from the legacy `dataSource` field so existing nodes keep behaving
-- the same way after this migration (mock-only nodes stay mock, live nodes stay live,
-- simulation nodes are left untouched — sim engine owns those flags entirely).
UPDATE "Node" SET "mockEnabled"     = true,  "hardwareEnabled" = false WHERE "dataSource" = 'mock';
UPDATE "Node" SET "mockEnabled"     = false, "hardwareEnabled" = true  WHERE "dataSource" = 'live';

ALTER TABLE "Reading"
  ADD COLUMN "simulated" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ProcessedData"
  ADD COLUMN "simulated" BOOLEAN NOT NULL DEFAULT false;
