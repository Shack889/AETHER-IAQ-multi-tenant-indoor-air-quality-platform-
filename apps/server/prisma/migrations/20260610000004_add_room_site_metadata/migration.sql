ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "siteType" TEXT;            -- 'residential' | 'classroom' | 'office'
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "locationLabel" TEXT;       -- e.g. 'AIUB Faculty Office, Dhaka'
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "ventilationType" TEXT;     -- 'natural' | 'mechanical' | 'mixed'
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "hasAC" BOOLEAN;
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "climateDescriptor" TEXT;   -- e.g. 'tropical humid'
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "occupancyMin" INTEGER;
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "occupancyMax" INTEGER;
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "mountingNote" TEXT;        -- sensor height/location in room
