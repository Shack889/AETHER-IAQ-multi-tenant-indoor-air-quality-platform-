CREATE TABLE "AlgorithmState" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AlgorithmState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AlgorithmState_nodeId_key" ON "AlgorithmState"("nodeId");
