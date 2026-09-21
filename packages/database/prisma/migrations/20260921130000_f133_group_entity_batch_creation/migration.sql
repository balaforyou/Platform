-- F-133 Slice A: Group/batch entity + tenant-wide member peak/non-peak rate defaults.
--
-- Drops the platform-wide "one ACTIVE assignment per member" constraint added in
-- 20260730071606_phase9_backend_batch. F-133 lets a member belong to more than one batch
-- concurrently (Slice B reworks resolveTodayMemberAssignment to resolve a list, not a single
-- row) -- @@unique([userId, resourcePoolId]) is untouched and still correctly prevents a
-- duplicate assignment to the same pool/schedule.
DROP INDEX "member_assignment_one_active_per_user";

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "memberAttendanceDeclinedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MemberGroupAssignment" ADD COLUMN     "groupId" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "memberNonPeakDefaultRate" DECIMAL(10,2),
ADD COLUMN     "memberPeakDefaultRate" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "resourcePoolId" TEXT NOT NULL,
    "daysOfWeek" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "isPeak" BOOLEAN NOT NULL DEFAULT false,
    "customRate" DECIMAL(10,2),
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MemberGroupAssignment" ADD CONSTRAINT "MemberGroupAssignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_resourcePoolId_fkey" FOREIGN KEY ("resourcePoolId") REFERENCES "ResourcePool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
