-- SCREEN-002: one court name per pool, enforced by the database.
--
-- Resource carried no unique constraint, so two courts in the same pool could be named
-- "Court 1" and nothing would object. The onboarding wizard collects court names as a
-- free-text repeatable list, which makes an accidental duplicate a matter of one stray
-- keystroke rather than a deliberate act. A duplicate is not cosmetic: generation emits
-- one availability window per resource, so two identically-named courts produce two
-- indistinguishable sets of bookable slots and neither the admin nor the guest can tell
-- which physical court they hold.
--
-- WHY NOT "NULLS NOT DISTINCT" HERE. F-115's index needed it because RoleAssignment.branchId
-- is nullable and Postgres treats nulls as distinct, so a plain unique index silently failed
-- to dedupe exactly the rows that mattered. That reasoning does NOT transfer: both
-- "resourcePoolId" and "name" are NOT NULL on Resource, so there is no null case to handle
-- and a plain unique index is complete. Copying F-115's clause here would add a constraint
-- that can never fire and imply a null case that cannot exist.
--
-- SELF-DEFENDING GUARD (F-067's shape, reused unchanged). A bare CREATE UNIQUE INDEX against
-- a database that already holds duplicates fails partway through deployment with a Postgres
-- error naming no rows, leaving whoever is on the deploy to go find them by hand. This block
-- aborts first and names the offending pool/name pairs. Reconciliation is deliberately NOT
-- automatic: choosing which court keeps the name, and what the other becomes, is an operational
-- decision about real courts that a migration must not make silently.
--
-- Current data is clean - zero duplicate pairs in both badminton_db and badminton_db_test at
-- the time of writing - so this applies without reconciliation today. That is a fact about
-- now, not a guarantee for whenever this ships; the guard is what makes it safe either way.

DO $$
DECLARE
  dupes text;
BEGIN
  SELECT string_agg(
           format('(resourcePoolId=%s, name=%L, count=%s)', dup."resourcePoolId", dup."name", dup.n),
           ', ' ORDER BY dup."resourcePoolId", dup."name"
         )
    INTO dupes
    FROM (
      SELECT "resourcePoolId", "name", count(*) AS n
        FROM "Resource"
       GROUP BY "resourcePoolId", "name"
      HAVING count(*) > 1
    ) AS dup;

  IF dupes IS NOT NULL THEN
    RAISE EXCEPTION
      'SCREEN-002: cannot add unique constraint - duplicate Resource names exist within a pool: %. Rename or remove the duplicates so each court name is unique within its pool, then re-run this migration.', dupes;
  END IF;
END $$;

CREATE UNIQUE INDEX "Resource_resourcePoolId_name_key"
  ON "Resource"("resourcePoolId", "name");
