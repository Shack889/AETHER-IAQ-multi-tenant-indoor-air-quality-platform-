CREATE TABLE "DecayEvent" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "roomId" TEXT,
    "profile_used" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "durationMin" DOUBLE PRECISION NOT NULL,
    "c0_ppm" DOUBLE PRECISION NOT NULL,
    "cEnd_ppm" DOUBLE PRECISION NOT NULL,
    "cExt_ppm" DOUBLE PRECISION NOT NULL,
    "ach_est" DOUBLE PRECISION NOT NULL,
    "lambda_est" DOUBLE PRECISION NOT NULL,
    "r_squared" DOUBLE PRECISION NOT NULL,
    "nPoints" INTEGER NOT NULL,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DecayEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DecayEvent_nodeId_startedAt_idx" ON "DecayEvent"("nodeId", "startedAt");
CREATE INDEX "DecayEvent_profile_used_idx" ON "DecayEvent"("profile_used");
