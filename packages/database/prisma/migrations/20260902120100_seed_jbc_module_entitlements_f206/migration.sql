-- F-206: seed JBC's real module entitlements, atomically with the gate migration before it.
--
-- WHY THIS IS A MIGRATION, NOT A SEED SCRIPT. JBC is live and its admin-web ResourcesPage /
-- SchedulingPage / AssignmentsPage call the slot-engine config endpoints that
-- 20260902120000 makes entitlement-gated. Without these two rows, the gate would 403 JBC's
-- real admin the instant it deploys. The gate and the grant must land in the same deploy —
-- this is the inverted form of the "capture the before-state" rule: the risk here is a live
-- regression on deploy, so the fix ships atomically rather than as a follow-up.
--
-- Keyed on subdomain, not a hard-coded tenant UUID, so it is correct in every environment
-- (dev / test / prod may each have a different JBC tenant id). Idempotent: ON CONFLICT DO
-- NOTHING against the (tenantId, module) unique index, and a no-op if the jbc tenant is
-- absent (fresh test databases). startDate is well in the past; endDate is far enough out
-- that it will not lapse during this project's active build-out — renewal (extending endDate
-- on the same row) is a normal platform operation once the entitlement-management routes exist.

INSERT INTO "ModuleEntitlement" ("id", "tenantId", "module", "startDate", "endDate", "updatedAt")
SELECT gen_random_uuid(), t."id", m.module::"TenantModule",
       TIMESTAMP '2025-01-01 00:00:00', TIMESTAMP '2030-01-01 00:00:00', CURRENT_TIMESTAMP
  FROM "Tenant" t
 CROSS JOIN (VALUES ('GUEST_BOOKING'), ('MEMBER_MANAGEMENT')) AS m(module)
 WHERE t."subdomain" = 'jbc'
ON CONFLICT ("tenantId", "module") DO NOTHING;
