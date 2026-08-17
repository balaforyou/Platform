-- F-115: one RoleAssignment per (userId, tenantId, branchId), enforced by the database.
--
-- POST /tenants/:id/roles commented "Upsert the role assignment to avoid duplicate
-- entries" while calling prisma.roleAssignment.create, and RoleAssignment carried no
-- unique constraint, so nothing at either layer prevented the duplicate the comment
-- claimed to avoid. Re-running an assignment - the obvious way to correct a wrong role,
-- or to swap F-116's placeholder phone number for JBC's real one - inserted a second row
-- rather than replacing the first.
--
-- WHY "NULLS NOT DISTINCT" IS LOAD-BEARING. Do not "simplify" this to a plain unique
-- index. Postgres treats NULL as distinct from itself by default, and every OWNER row
-- carries branchId = null by the route's own validation (tenant-management/src/index.ts
-- :391-398). A plain UNIQUE(userId, tenantId, branchId) therefore permits the same owner
-- to be inserted twice - which is exactly the case this migration exists to prevent.
-- Verified against a real table before writing this: with NULLS NOT DISTINCT the repeat
-- owner insert is rejected; without it, the repeat insert succeeds.
--
-- WHY userId IS IN THE KEY (F-117, Resolved). Multiple owners per tenant is a confirmed
-- supported capability - every authorization consumer asks whether the caller holds owner,
-- never who "the" owner is, and no findFirst/[0] singleton read exists. A constraint on
-- (tenantId, role), or a pre-insert "does this tenant already have an owner" check, would
-- break that and must not be substituted here.
--
-- Prisma 5.14 cannot express NULLS NOT DISTINCT, so schema.prisma declares a plain
-- @@unique on the same columns. `prisma migrate diff` reports no drift between the two,
-- so the generated client gets the compound where-input it needs for a typed upsert while
-- the database keeps the stronger semantics. If this index is ever regenerated from the
-- schema alone it will come back plain and silently lose owner-duplicate protection; the
-- role-scoping regression section is what catches that.
--
-- SELF-DEFENDING GUARD (same shape as F-067's booking-rule migration). A plain
-- CREATE UNIQUE INDEX against a database that already holds duplicates fails partway
-- through deployment with a bare Postgres error naming no rows. This block aborts the
-- transaction first and names the offending triples so the data decision can be made with
-- the rows in hand. Reconciliation is deliberately NOT automatic: choosing which
-- assignment survives is a business decision, not something a migration should make
-- silently. GROUP BY already treats NULLs as equal, which is precisely the grouping the
-- NULLS NOT DISTINCT index will apply.

DO $$
DECLARE
  dupes text;
BEGIN
  SELECT string_agg(
           format('(userId=%s, tenantId=%s, branchId=%s)',
                  dup."userId", dup."tenantId", coalesce(dup."branchId", 'NULL')),
           ', ' ORDER BY dup."userId"
         )
    INTO dupes
    FROM (
      SELECT "userId", "tenantId", "branchId"
        FROM "RoleAssignment"
       GROUP BY "userId", "tenantId", "branchId"
      HAVING count(*) > 1
    ) AS dup;

  IF dupes IS NOT NULL THEN
    RAISE EXCEPTION
      'F-115: cannot add unique constraint - duplicate RoleAssignment rows exist for: %. Reconcile these to one assignment per user/tenant/branch before migrating.', dupes;
  END IF;
END $$;

CREATE UNIQUE INDEX "RoleAssignment_userId_tenantId_branchId_key"
  ON "RoleAssignment"("userId", "tenantId", "branchId") NULLS NOT DISTINCT;
