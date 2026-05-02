-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "width_ft" DOUBLE PRECISION NOT NULL DEFAULT 22,
    "height_ft" DOUBLE PRECISION NOT NULL DEFAULT 22,
    "ceiling_ft" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "profile" TEXT NOT NULL DEFAULT 'OFFICE_OPEN',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Node" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Sensor Node',
    "roomId" TEXT,
    "posX" DOUBLE PRECISION,
    "posY" DOUBLE PRECISION,
    "posZ" DOUBLE PRECISION,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "lastSeen" TIMESTAMP(3),
    "firmware" TEXT,
    "connectivity" TEXT NOT NULL DEFAULT 'wifi',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Node_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reading" (
    "id" BIGSERIAL NOT NULL,
    "nodeId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pm1_raw" DOUBLE PRECISION,
    "pm25_raw" DOUBLE PRECISION NOT NULL,
    "pm10_raw" DOUBLE PRECISION,
    "co2_raw" DOUBLE PRECISION NOT NULL,
    "tvoc_raw" DOUBLE PRECISION NOT NULL,
    "temp_bme" DOUBLE PRECISION NOT NULL,
    "rh_bme" DOUBLE PRECISION NOT NULL,
    "pressure_hpa" DOUBLE PRECISION,
    "temp_scd" DOUBLE PRECISION,
    "rh_scd" DOUBLE PRECISION,

    CONSTRAINT "Reading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedData" (
    "id" BIGSERIAL NOT NULL,
    "nodeId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pm25_filtered" DOUBLE PRECISION NOT NULL,
    "co2_filtered" DOUBLE PRECISION NOT NULL,
    "voc_filtered" DOUBLE PRECISION NOT NULL,
    "temp_filtered" DOUBLE PRECISION NOT NULL,
    "rh_filtered" DOUBLE PRECISION NOT NULL,
    "pm25_corrected" DOUBLE PRECISION NOT NULL,
    "crossValidOk" BOOLEAN NOT NULL,
    "deps_aqi" INTEGER NOT NULL,
    "epa_aqi" INTEGER NOT NULL,
    "profile_used" TEXT NOT NULL,
    "cpis" INTEGER NOT NULL,
    "ced_pm25" DOUBLE PRECISION NOT NULL,
    "ced_co2" DOUBLE PRECISION NOT NULL,
    "thermal_pmv" DOUBLE PRECISION,
    "pm25_pred_30m" DOUBLE PRECISION,
    "co2_pred_30m" DOUBLE PRECISION,
    "trend_slope" DOUBLE PRECISION,
    "event_type" TEXT,
    "event_confidence" DOUBLE PRECISION,
    "anomaly_score" DOUBLE PRECISION,
    "occupancy_est" INTEGER,
    "ventilation_cmd" TEXT,
    "pid_output" DOUBLE PRECISION,
    "who_pass" BOOLEAN,
    "epa_pass" BOOLEAN,
    "bnaaqs_pass" BOOLEAN,
    "ashrae_pass" BOOLEAN,
    "well_pass" BOOLEAN,
    "reset_pass" BOOLEAN,
    "alert_level" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProcessedData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaselinePattern" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "binIndex" INTEGER NOT NULL,
    "pm25_avg" DOUBLE PRECISION NOT NULL,
    "co2_avg" DOUBLE PRECISION NOT NULL,
    "voc_avg" DOUBLE PRECISION NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BaselinePattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "parameter" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Node_nodeId_key" ON "Node"("nodeId");

-- CreateIndex
CREATE INDEX "Reading_nodeId_timestamp_idx" ON "Reading"("nodeId", "timestamp");

-- CreateIndex
CREATE INDEX "Reading_timestamp_idx" ON "Reading"("timestamp");

-- CreateIndex
CREATE INDEX "ProcessedData_nodeId_timestamp_idx" ON "ProcessedData"("nodeId", "timestamp");

-- CreateIndex
CREATE INDEX "ProcessedData_timestamp_idx" ON "ProcessedData"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "BaselinePattern_nodeId_dayOfWeek_binIndex_key" ON "BaselinePattern"("nodeId", "dayOfWeek", "binIndex");

-- CreateIndex
CREATE INDEX "Alert_nodeId_createdAt_idx" ON "Alert"("nodeId", "createdAt");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Node" ADD CONSTRAINT "Node_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reading" ADD CONSTRAINT "Reading_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("nodeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessedData" ADD CONSTRAINT "ProcessedData_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("nodeId") ON DELETE RESTRICT ON UPDATE CASCADE;
