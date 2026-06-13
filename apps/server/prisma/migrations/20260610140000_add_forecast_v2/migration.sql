-- Layer 4 v2: improved forecaster outputs with prediction intervals
ALTER TABLE "ProcessedData"
    ADD COLUMN "pm25_pred_30m_v2" DOUBLE PRECISION,
    ADD COLUMN "pm25_pred_lo" DOUBLE PRECISION,
    ADD COLUMN "pm25_pred_hi" DOUBLE PRECISION,
    ADD COLUMN "co2_pred_30m_v2" DOUBLE PRECISION,
    ADD COLUMN "co2_pred_lo" DOUBLE PRECISION,
    ADD COLUMN "co2_pred_hi" DOUBLE PRECISION;

-- Walk-forward backtest metrics (MAE / RMSE / skill per pollutant × method × profile)
CREATE TABLE "ForecastMetric" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "pollutant" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "horizonMin" INTEGER NOT NULL DEFAULT 30,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "n" INTEGER NOT NULL,
    "mae" DOUBLE PRECISION NOT NULL,
    "rmse" DOUBLE PRECISION NOT NULL,
    "skill" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForecastMetric_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ForecastMetric_nodeId_pollutant_method_createdAt_idx"
    ON "ForecastMetric"("nodeId", "pollutant", "method", "createdAt");
