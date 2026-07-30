-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('FLAT', 'PER_PERSON');

-- AlterTable
ALTER TABLE "AvailabilityWindow" ADD COLUMN     "price" DECIMAL(10,2),
ADD COLUMN     "pricingMode" "PricingMode";

-- AlterTable
ALTER TABLE "BookingRule" ADD COLUMN     "guestAccessCutoffMinutes" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "lowOccupancyThresholdPct" INTEGER NOT NULL DEFAULT 50;

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "aboutDescription" TEXT,
ADD COLUMN     "facilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "workingDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "workingHoursEnd" TEXT,
ADD COLUMN     "workingHoursStart" TEXT;

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "isOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "overriddenBy" TEXT,
ADD COLUMN     "overrideAt" TIMESTAMP(3),
ADD COLUMN     "overrideReason" TEXT;

-- AlterTable
ALTER TABLE "ResourcePool" ADD COLUMN     "defaultRate" DECIMAL(10,2) NOT NULL DEFAULT 100.00,
ADD COLUMN     "minBookingDurationMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "minOccupancy" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "pricingMode" "PricingMode" NOT NULL DEFAULT 'FLAT';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "aboutDescription" TEXT,
ADD COLUMN     "facilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "photos" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "MemberGroupAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resourcePoolId" TEXT NOT NULL,
    "daysOfWeek" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberGroupAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberGroupAssignment_userId_resourcePoolId_key" ON "MemberGroupAssignment"("userId", "resourcePoolId");

-- AddForeignKey
ALTER TABLE "MemberGroupAssignment" ADD CONSTRAINT "MemberGroupAssignment_resourcePoolId_fkey" FOREIGN KEY ("resourcePoolId") REFERENCES "ResourcePool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Partial unique index: enforces one active assignment per member (Basic-tier rule).
-- WHY: @@unique([userId, resourcePoolId]) only prevents same-court double-assignment.
-- This index prevents assigning a member to ANY two courts simultaneously.
-- Concurrent INSERT attempts for the same userId with status = 'ACTIVE' will fail with P2002,
-- which is caught at the API layer and returned as 409 ASSIGNMENT_ALREADY_EXISTS.
-- Cannot be expressed in Prisma schema syntax; added manually per tech_stack_architecture.md §4b.
CREATE UNIQUE INDEX "member_assignment_one_active_per_user"
  ON "MemberGroupAssignment" ("userId")
  WHERE status = 'ACTIVE';
