-- AECI upgrade: Domains II/IV/V/VII fields, Room.maxOccupancy

ALTER TABLE "Room"
  ADD COLUMN "maxOccupancy" INTEGER NOT NULL DEFAULT 10;

ALTER TABLE "ProcessedData"
  ADD COLUMN "reliability_pm25"     DOUBLE PRECISION,
  ADD COLUMN "reliability_co2"      DOUBLE PRECISION,
  ADD COLUMN "reliability_voc"      DOUBLE PRECISION,
  ADD COLUMN "celi_score"           DOUBLE PRECISION,
  ADD COLUMN "celi_weights"         JSONB,
  ADD COLUMN "direct_burden"        DOUBLE PRECISION,
  ADD COLUMN "interaction_burden"   DOUBLE PRECISION,
  ADD COLUMN "total_burden"         DOUBLE PRECISION,
  ADD COLUMN "dominant_interaction" TEXT,
  ADD COLUMN "interaction_details"  JSONB,
  ADD COLUMN "temporal_memory_pm"   DOUBLE PRECISION,
  ADD COLUMN "temporal_memory_co2"  DOUBLE PRECISION,
  ADD COLUMN "temporal_memory_voc"  DOUBLE PRECISION,
  ADD COLUMN "cognitive_burden"     DOUBLE PRECISION,
  ADD COLUMN "recovery_status"      TEXT,
  ADD COLUMN "cpis_instantaneous"   DOUBLE PRECISION,
  ADD COLUMN "explanation_text"     TEXT;

-- Backfill new fields from legacy ones for any existing rows
UPDATE "ProcessedData"
   SET "celi_score"          = "deps_aqi"::double precision,
       "cpis_instantaneous"  = "cpis"::double precision,
       "temporal_memory_pm"  = "ced_pm25",
       "temporal_memory_co2" = "ced_co2",
       "cognitive_burden"    = "cpis"::double precision,
       "recovery_status"     = 'baseline'
 WHERE "celi_score" IS NULL;
