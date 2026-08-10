-- F-067: one BookingRule per ResourcePool, enforced by the database.
--
-- Every reader in slot-engine takes bookingRules[0] or findFirst({ resourcePoolId })
-- with no ordering, so a pool holding two rows has a non-deterministic effective
-- policy: gracePeriodMinutes, prepaymentRequired and the cancellation tiers can all
-- differ between two requests to the same endpoint.
--
-- SELF-DEFENDING GUARD. A plain CREATE UNIQUE INDEX against a database that already
-- holds duplicates fails partway through deployment with a bare Postgres error naming
-- no rows. This block aborts the transaction first, before the index is attempted, and
-- names the offending pools so the data decision can be made with the rows in hand.
-- Reconciliation is deliberately NOT automatic: choosing which rule survives is a
-- business decision, not something a migration should make silently.

DO $$
DECLARE
  dupes text;
BEGIN
  SELECT string_agg(dup."resourcePoolId", ', ' ORDER BY dup."resourcePoolId")
    INTO dupes
    FROM (
      SELECT "resourcePoolId"
        FROM "BookingRule"
       GROUP BY "resourcePoolId"
      HAVING count(*) > 1
    ) AS dup;

  IF dupes IS NOT NULL THEN
    RAISE EXCEPTION
      'F-067: cannot add unique constraint — duplicate BookingRule rows exist for resourcePoolId(s): %. Reconcile these to one rule per pool before migrating.', dupes;
  END IF;
END $$;

CREATE UNIQUE INDEX "BookingRule_resourcePoolId_key" ON "BookingRule"("resourcePoolId");
