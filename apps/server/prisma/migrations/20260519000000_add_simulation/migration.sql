-- Add Simulation table (model existed in schema.prisma but was never migrated).

CREATE TABLE IF NOT EXISTS "Simulation" (
    "id"             TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "roomConfig"     JSONB NOT NULL,
    "nodePositions"  JSONB NOT NULL,
    "occupancySched" JSONB NOT NULL,
    "events"         JSONB NOT NULL,
    "profile"        TEXT NOT NULL DEFAULT 'OFFICE_OPEN',
    "speed"          INTEGER NOT NULL DEFAULT 10,
    "status"         TEXT NOT NULL DEFAULT 'created',
    "simNodeIds"     JSONB NOT NULL,
    "startedAt"      TIMESTAMP(3),
    "pausedAt"       TIMESTAMP(3),
    "simulatedTime"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Simulation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Simulation_userId_createdAt_idx"
    ON "Simulation" ("userId", "createdAt");
