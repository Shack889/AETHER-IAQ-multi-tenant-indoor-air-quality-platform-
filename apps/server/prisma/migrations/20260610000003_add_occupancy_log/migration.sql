CREATE TABLE "OccupancyLog" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT,
    "roomId" TEXT,
    "userId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "count" INTEGER,
    "activity" TEXT,
    "eventTag" TEXT,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OccupancyLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OccupancyLog_nodeId_timestamp_idx" ON "OccupancyLog"("nodeId", "timestamp");
CREATE INDEX "OccupancyLog_roomId_timestamp_idx" ON "OccupancyLog"("roomId", "timestamp");
