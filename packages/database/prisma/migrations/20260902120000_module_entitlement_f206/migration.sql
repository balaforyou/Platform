-- F-206: per-tenant module entitlement system.
--
-- Purely additive: one new enum, one new table, one back-relation FK on Tenant. No existing
-- row's meaning changes, nothing to backfill on existing tables. `Tenant.plan` (a decorative
-- string with zero enforcement) is deliberately left in place — this system does not read it.
--
-- A tenant with NO ModuleEntitlement row for a module is not entitled to it (fail-closed
-- default) — so STUDENT_MANAGEMENT and TOURNAMENT need no seed rows anywhere, and a brand-new
-- tenant is correctly locked out of every module until the platform grants one. The state a
-- given row represents (active / read-only wind-down / hidden) is computed from
-- (now, startDate, endDate, disabledAt) at every access point — never stored, no background job.
--
-- JBC's real GUEST_BOOKING + MEMBER_MANAGEMENT rows are seeded by the very next migration
-- (20260902120100_seed_jbc_module_entitlements_f206) so the gate and JBC's live admin-web
-- usage of the gated endpoints ship in one atomic deploy.

-- CreateEnum
CREATE TYPE "TenantModule" AS ENUM ('GUEST_BOOKING', 'MEMBER_MANAGEMENT', 'STUDENT_MANAGEMENT', 'TOURNAMENT');

-- CreateTable
CREATE TABLE "ModuleEntitlement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" "TenantModule" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "disabledAt" TIMESTAMP(3),
    "disabledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModuleEntitlement_tenantId_module_key" ON "ModuleEntitlement"("tenantId", "module");

-- AddForeignKey
ALTER TABLE "ModuleEntitlement" ADD CONSTRAINT "ModuleEntitlement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
