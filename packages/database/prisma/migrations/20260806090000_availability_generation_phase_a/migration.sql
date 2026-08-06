CREATE TYPE "AvailabilityOverrideType" AS ENUM ('CLOSED', 'MODIFIED');

ALTER TABLE "AvailabilityWindow"
ADD COLUMN "generatedFromPatternId" TEXT,
ADD COLUMN "generationDate" TIMESTAMP(3);

CREATE TABLE "AvailabilityPattern" (
    "id" TEXT NOT NULL,
    "resourcePoolId" TEXT NOT NULL,
    "daysOfWeek" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "slotDurationMinutes" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "pricingMode" "PricingMode",
    "price" DECIMAL(10,2),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityPattern_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AvailabilityOverride" (
    "id" TEXT NOT NULL,
    "resourcePoolId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "AvailabilityOverrideType" NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "slotDurationMinutes" INTEGER,
    "capacity" INTEGER,
    "pricingMode" "PricingMode",
    "price" DECIMAL(10,2),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityOverride_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GenerationLock" (
    "id" TEXT NOT NULL,
    "resourcePoolId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationLock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AvailabilityPattern_resourcePoolId_status_idx" ON "AvailabilityPattern"("resourcePoolId", "status");
CREATE INDEX "AvailabilityOverride_resourcePoolId_date_idx" ON "AvailabilityOverride"("resourcePoolId", "date");
CREATE UNIQUE INDEX "AvailabilityOverride_resourcePoolId_date_key" ON "AvailabilityOverride"("resourcePoolId", "date");
CREATE UNIQUE INDEX "GenerationLock_resourcePoolId_date_key" ON "GenerationLock"("resourcePoolId", "date");

ALTER TABLE "AvailabilityPattern" ADD CONSTRAINT "AvailabilityPattern_resourcePoolId_fkey" FOREIGN KEY ("resourcePoolId") REFERENCES "ResourcePool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AvailabilityOverride" ADD CONSTRAINT "AvailabilityOverride_resourcePoolId_fkey" FOREIGN KEY ("resourcePoolId") REFERENCES "ResourcePool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GenerationLock" ADD CONSTRAINT "GenerationLock_resourcePoolId_fkey" FOREIGN KEY ("resourcePoolId") REFERENCES "ResourcePool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
