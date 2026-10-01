-- F-328 Part B: one-time wipe of GUEST test bookings for one tenant (JBC). Single transaction.
--
-- Run non-interactively, one psql process, so a dropped SSH/IAP tunnel rolls the whole thing back:
--   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v tenant_subdomain=jbc -v commit=false -f wipe-jbc-guest-bookings.sql
--   (commit=false = rehearsal: prints the exact before/after counts, then ROLLBACK. Nothing persists.)
--   (commit=true  = real run: same output, then COMMIT -- only if every assertion below passed.)
-- Optional variables:
--   -v include_member=true   also deletes isMemberBooking rows. DO NOT use for F-328 (Bala: guest only).
--   -v expected_bookings=N   abort unless exactly N bookings are in scope. REQUIRED when commit=true (the real run
--                            aborts before any delete if it is missing); take N from the commit=false rehearsal.
--
-- Scope: bookings of the tenant's branches with isMemberBooking = false, plus every child of a
-- chain parent in that set (parentBookingId, recursive), plus the rows that hang off them:
-- Refund, PaymentIntent (referenceId = ANY booking in the set, parent OR child -- F-317 chains),
-- BookingPlayer, NotificationRequest (variables->>'bookingId'), ScheduledJobDispatch.
-- Kept (asserted unchanged): User, DeviceToken, Tenant, Branch, ResourcePool, Resource,
-- AvailabilityWindow/Pattern/Override, BookingRule, Group, MemberGroupAssignment, Subscription,
-- ScheduledJob, member bookings, and every other tenant's rows.

\set ON_ERROR_STOP on
\pset pager off
\if :{?tenant_subdomain} \else \set tenant_subdomain jbc \endif
\if :{?include_member} \else \set include_member false \endif
\if :{?commit} \else \set commit false \endif
\if :{?expected_bookings} \else \set expected_bookings -1 \endif

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '300s';

\echo === F-328 wipe: tenant :tenant_subdomain, include_member=:include_member, commit=:commit ===

-- psql does not substitute :variables inside $$ bodies, so DO blocks read these via current_setting().
SELECT set_config('f328.include_member', :'include_member', true), set_config('f328.expected_bookings', :'expected_bookings', true), set_config('f328.commit', :'commit', true);

-- Commit guard (PR #129 review, fix 1): a real run must carry the count Bala approved. Runs before
-- any delete. commit=false (rehearsal) is unaffected and needs no count.
DO $$ BEGIN
  IF current_setting('f328.commit')::boolean AND current_setting('f328.expected_bookings')::bigint < 0 THEN
    RAISE EXCEPTION 'F-328: commit=true requires -v expected_bookings=<approved count>. Get the count from the commit=false rehearsal: the "PLAN: rows to delete" Booking row.';
  END IF;
END $$;

CREATE TEMP TABLE f328_tenant ON COMMIT DROP AS
  SELECT id FROM "Tenant" WHERE subdomain = :'tenant_subdomain';
DO $$ BEGIN
  IF (SELECT count(*) FROM f328_tenant) <> 1 THEN RAISE EXCEPTION 'F-328: tenant subdomain did not resolve to exactly one tenant'; END IF;
END $$;

CREATE TEMP TABLE f328_branches ON COMMIT DROP AS
  SELECT b.id, b.name FROM "Branch" b WHERE b."tenantId" = (SELECT id FROM f328_tenant);
\echo -- branches in scope (expect the two JBC branches):
SELECT * FROM f328_branches ORDER BY name;
DO $$ BEGIN
  IF (SELECT count(*) FROM f328_branches) <> 2 THEN RAISE EXCEPTION 'F-328: expected exactly 2 branches for this tenant'; END IF;
END $$;

-- Booking scope: roots (guest unless include_member) + all descendants via parentBookingId.
CREATE TEMP TABLE f328_bookings ON COMMIT DROP AS
  WITH RECURSIVE roots AS (
    SELECT bk.id FROM "Booking" bk
     WHERE bk."tenantId" = (SELECT id FROM f328_tenant)
       AND bk."branchId" IN (SELECT id FROM f328_branches)
       AND bk."parentBookingId" IS NULL
       AND (bk."isMemberBooking" = false OR :include_member)
  ), tree AS (
    SELECT id FROM roots
    UNION
    SELECT c.id FROM "Booking" c JOIN tree t ON c."parentBookingId" = t.id
  )
  SELECT id FROM tree;

CREATE TEMP TABLE f328_intents ON COMMIT DROP AS
  SELECT pi.id FROM "PaymentIntent" pi
   WHERE pi."tenantId" = (SELECT id FROM f328_tenant)
     AND pi.purpose = 'guest_booking'
     AND pi."referenceId" IN (SELECT id FROM f328_bookings);

-- Safety assertions on the scope itself.
DO $$ DECLARE n bigint; BEGIN
  SELECT count(*) INTO n FROM "Booking" bk JOIN f328_bookings s ON s.id = bk.id
   WHERE bk."tenantId" <> (SELECT id FROM f328_tenant);
  IF n > 0 THEN RAISE EXCEPTION 'F-328: % in-scope bookings belong to another tenant', n; END IF;
  IF NOT current_setting('f328.include_member')::boolean THEN
    SELECT count(*) INTO n FROM "Booking" bk JOIN f328_bookings s ON s.id = bk.id WHERE bk."isMemberBooking";
    IF n > 0 THEN RAISE EXCEPTION 'F-328: % member bookings are in scope but include_member is off', n; END IF;
  END IF;
  IF current_setting('f328.expected_bookings')::bigint >= 0 AND (SELECT count(*) FROM f328_bookings) <> current_setting('f328.expected_bookings')::bigint THEN
    RAISE EXCEPTION 'F-328: scope is % bookings, expected %', (SELECT count(*) FROM f328_bookings), current_setting('f328.expected_bookings');
  END IF;
END $$;

\echo -- "nothing real since today" check (show Bala before the production run):
SELECT 'MAX(createdAt) in-scope bookings' AS item, max(bk."createdAt")::text AS value FROM "Booking" bk JOIN f328_bookings s ON s.id = bk.id
UNION ALL SELECT 'MAX(createdAt) any JBC booking (incl. member)', max("createdAt")::text FROM "Booking" WHERE "tenantId" = (SELECT id FROM f328_tenant)
UNION ALL SELECT 'MAX(createdAt) JBC PaymentIntent', max("createdAt")::text FROM "PaymentIntent" WHERE "tenantId" = (SELECT id FROM f328_tenant)
UNION ALL SELECT 'in-scope bookings created in last 24h', count(*)::text FROM "Booking" bk JOIN f328_bookings s ON s.id = bk.id WHERE bk."createdAt" > now() - interval '24 hours';

\echo -- chain payment matching (F-317): in-scope intents by whether referenceId is a parent or a child:
SELECT CASE WHEN bk."parentBookingId" IS NULL THEN 'chain parent / single booking' ELSE 'chain child' END AS reference_kind,
       count(*) AS intents
  FROM f328_intents i JOIN "PaymentIntent" pi ON pi.id = i.id JOIN "Booking" bk ON bk.id = pi."referenceId"
 GROUP BY 1 ORDER BY 1;
\echo -- orphan intents (JBC guest_booking intents whose booking row no longer exists; LEFT ALONE, listed only):
SELECT count(*) AS orphan_intents FROM "PaymentIntent" pi
 WHERE pi."tenantId" = (SELECT id FROM f328_tenant) AND pi.purpose = 'guest_booking'
   AND NOT EXISTS (SELECT 1 FROM "Booking" b WHERE b.id = pi."referenceId");
\echo -- intents referencing a member booking or a booking outside scope (LEFT ALONE):
SELECT count(*) AS intents_left_alone FROM "PaymentIntent" pi
 WHERE pi."tenantId" = (SELECT id FROM f328_tenant) AND pi.purpose = 'guest_booking'
   AND pi.id NOT IN (SELECT id FROM f328_intents)
   AND EXISTS (SELECT 1 FROM "Booking" b WHERE b.id = pi."referenceId");

-- Snapshot function: one row per (phase, table, tenant, bucket).
CREATE TEMP TABLE f328_snap (phase text, tbl text, tenant_id text, bucket text, n bigint) ON COMMIT DROP;
CREATE FUNCTION pg_temp.f328_snapshot(p text) RETURNS void LANGUAGE sql AS $f$
  INSERT INTO f328_snap SELECT p, 'Booking', "tenantId", CASE WHEN "isMemberBooking" THEN 'member' ELSE 'guest' END, count(*) FROM "Booking" GROUP BY 1,2,3,4;
  INSERT INTO f328_snap SELECT p, 'PaymentIntent', "tenantId", purpose, count(*) FROM "PaymentIntent" GROUP BY 1,2,3,4;
  INSERT INTO f328_snap SELECT p, 'NotificationRequest', "tenantId", "eventType", count(*) FROM "NotificationRequest" GROUP BY 1,2,3,4;
  INSERT INTO f328_snap SELECT p, 'ScheduledJobDispatch', coalesce("tenantId",'-'), "jobName", count(*) FROM "ScheduledJobDispatch" GROUP BY 1,2,3,4;
  INSERT INTO f328_snap SELECT p, 'Refund', '-', 'all', count(*) FROM "Refund";
  INSERT INTO f328_snap SELECT p, 'BookingPlayer', '-', 'all', count(*) FROM "BookingPlayer";
  INSERT INTO f328_snap SELECT p, 'User', '-', 'all', count(*) FROM "User";
  INSERT INTO f328_snap SELECT p, 'DeviceToken', '-', 'all', count(*) FROM "DeviceToken";
  INSERT INTO f328_snap SELECT p, 'Tenant', '-', 'all', count(*) FROM "Tenant";
  INSERT INTO f328_snap SELECT p, 'Branch', '-', 'all', count(*) FROM "Branch";
  INSERT INTO f328_snap SELECT p, 'ResourcePool', '-', 'all', count(*) FROM "ResourcePool";
  INSERT INTO f328_snap SELECT p, 'Resource', '-', 'all', count(*) FROM "Resource";
  INSERT INTO f328_snap SELECT p, 'AvailabilityWindow', '-', 'all', count(*) FROM "AvailabilityWindow";
  INSERT INTO f328_snap SELECT p, 'AvailabilityPattern', '-', 'all', count(*) FROM "AvailabilityPattern";
  INSERT INTO f328_snap SELECT p, 'MemberGroupAssignment', '-', 'all', count(*) FROM "MemberGroupAssignment";
  INSERT INTO f328_snap SELECT p, 'Group', '-', 'all', count(*) FROM "Group";
  INSERT INTO f328_snap SELECT p, 'Subscription', '-', 'all', count(*) FROM "Subscription";
  INSERT INTO f328_snap SELECT p, 'ScheduledJob', '-', 'all', count(*) FROM "ScheduledJob";
$f$;
SELECT pg_temp.f328_snapshot('before');

-- Rows that will go (printed; asserted against actual DELETE results below).
CREATE TEMP TABLE f328_plan ON COMMIT DROP AS
  SELECT 'Booking' AS tbl, (SELECT count(*) FROM f328_bookings) AS n
  UNION ALL SELECT 'PaymentIntent', (SELECT count(*) FROM f328_intents)
  UNION ALL SELECT 'Refund', (SELECT count(*) FROM "Refund" WHERE "paymentIntentId" IN (SELECT id FROM f328_intents))
  UNION ALL SELECT 'BookingPlayer', (SELECT count(*) FROM "BookingPlayer" WHERE "bookingId" IN (SELECT id FROM f328_bookings))
  UNION ALL SELECT 'NotificationRequest', (SELECT count(*) FROM "NotificationRequest"
      WHERE "tenantId" = (SELECT id FROM f328_tenant) AND variables->>'bookingId' IN (SELECT id FROM f328_bookings))
  -- Real key shapes (services/slot-engine/src/index.ts): guest_booking_reminder keys dedupKey = booking.id
  -- (subjectId is the USER id -- never matched on); payment_confirm_reconciliation keys dedupKey = intent.id.
  UNION ALL SELECT 'ScheduledJobDispatch:guest_booking_reminder', (SELECT count(*) FROM "ScheduledJobDispatch"
      WHERE "jobName" = 'guest_booking_reminder' AND "dedupKey" IN (SELECT id FROM f328_bookings))
  UNION ALL SELECT 'ScheduledJobDispatch:payment_confirm_reconciliation', (SELECT count(*) FROM "ScheduledJobDispatch"
      WHERE "jobName" = 'payment_confirm_reconciliation' AND "dedupKey" IN (SELECT id FROM f328_intents));
\echo -- PLAN: rows to delete
SELECT * FROM f328_plan ORDER BY tbl;
\echo -- booking split of what is in scope (guest vs member):
SELECT CASE WHEN bk."isMemberBooking" THEN 'member' ELSE 'guest' END AS bucket, count(*) FROM "Booking" bk JOIN f328_bookings s ON s.id = bk.id GROUP BY 1;
\echo -- booking-event notifications with no bookingId in variables (LEFT ALONE):
SELECT "eventType", count(*) FROM "NotificationRequest"
 WHERE "tenantId" = (SELECT id FROM f328_tenant) AND "eventType" IN ('booking_confirmed','guest_booking_reminder')
   AND NOT (variables ? 'bookingId') GROUP BY 1;

-- Deletes, FK-safe order. Each DELETE's row count is printed by psql and asserted below.
CREATE TEMP TABLE f328_deleted (tbl text, n bigint) ON COMMIT DROP;
WITH d AS (DELETE FROM "Refund" WHERE "paymentIntentId" IN (SELECT id FROM f328_intents) RETURNING 1)
  INSERT INTO f328_deleted SELECT 'Refund', count(*) FROM d;
WITH d AS (DELETE FROM "ScheduledJobDispatch" WHERE "jobName" = 'guest_booking_reminder' AND "dedupKey" IN (SELECT id FROM f328_bookings) RETURNING 1)
  INSERT INTO f328_deleted SELECT 'ScheduledJobDispatch:guest_booking_reminder', count(*) FROM d;
WITH d AS (DELETE FROM "ScheduledJobDispatch" WHERE "jobName" = 'payment_confirm_reconciliation' AND "dedupKey" IN (SELECT id FROM f328_intents) RETURNING 1)
  INSERT INTO f328_deleted SELECT 'ScheduledJobDispatch:payment_confirm_reconciliation', count(*) FROM d;
WITH d AS (DELETE FROM "PaymentIntent" WHERE id IN (SELECT id FROM f328_intents) RETURNING 1)
  INSERT INTO f328_deleted SELECT 'PaymentIntent', count(*) FROM d;
WITH d AS (DELETE FROM "NotificationRequest" WHERE "tenantId" = (SELECT id FROM f328_tenant) AND variables->>'bookingId' IN (SELECT id FROM f328_bookings) RETURNING 1)
  INSERT INTO f328_deleted SELECT 'NotificationRequest', count(*) FROM d;
WITH d AS (DELETE FROM "BookingPlayer" WHERE "bookingId" IN (SELECT id FROM f328_bookings) RETURNING 1)
  INSERT INTO f328_deleted SELECT 'BookingPlayer', count(*) FROM d;
-- Children first is unnecessary (parentBookingId is ON DELETE CASCADE) but the whole set is named explicitly.
WITH d AS (DELETE FROM "Booking" WHERE id IN (SELECT id FROM f328_bookings) RETURNING 1)
  INSERT INTO f328_deleted SELECT 'Booking', count(*) FROM d;

SELECT pg_temp.f328_snapshot('after');

-- Assertions: deleted == planned; nothing of this scope remains; kept tables and other tenants identical.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT p.tbl, p.n AS planned, coalesce(d.n,0) AS deleted FROM f328_plan p LEFT JOIN f328_deleted d USING (tbl) LOOP
    IF r.planned <> r.deleted THEN RAISE EXCEPTION 'F-328: % planned % but deleted %', r.tbl, r.planned, r.deleted; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM "Booking" WHERE id IN (SELECT id FROM f328_bookings)) THEN RAISE EXCEPTION 'F-328: in-scope bookings remain'; END IF;
  IF EXISTS (SELECT 1 FROM "PaymentIntent" WHERE id IN (SELECT id FROM f328_intents)) THEN RAISE EXCEPTION 'F-328: in-scope intents remain'; END IF;
  -- Dispatch rows for the deleted bookings/intents must not survive under any job name.
  IF EXISTS (SELECT 1 FROM "ScheduledJobDispatch" WHERE "dedupKey" IN (SELECT id FROM f328_bookings) OR "subjectId" IN (SELECT id FROM f328_bookings)) THEN
    RAISE EXCEPTION 'F-328: dispatch rows still reference deleted bookings'; END IF;
  -- Everything not Booking/PaymentIntent/NotificationRequest/ScheduledJobDispatch/Refund/BookingPlayer is unchanged.
  FOR r IN SELECT b.tbl, b.tenant_id, b.bucket, b.n AS nb, coalesce(a.n,0) AS na
             FROM f328_snap b LEFT JOIN f328_snap a ON a.phase='after' AND a.tbl=b.tbl AND a.tenant_id=b.tenant_id AND a.bucket=b.bucket
            WHERE b.phase='before'
              AND (b.tbl NOT IN ('Booking','PaymentIntent','NotificationRequest','ScheduledJobDispatch','Refund','BookingPlayer')
                   OR (b.tenant_id IS DISTINCT FROM (SELECT id FROM f328_tenant) AND b.tenant_id <> '-')
                   OR (b.tbl = 'Booking' AND b.bucket = 'member' AND NOT current_setting('f328.include_member')::boolean)) LOOP
    IF r.nb <> r.na THEN RAISE EXCEPTION 'F-328: kept/other-tenant rows changed: % tenant % bucket % (% -> %)', r.tbl, r.tenant_id, r.bucket, r.nb, r.na; END IF;
  END LOOP;
  -- Refund / BookingPlayer have no tenant column: global delta must equal exactly what was deleted.
  IF (SELECT sum(n) FROM f328_snap WHERE phase='before' AND tbl='Refund') - (SELECT sum(n) FROM f328_snap WHERE phase='after' AND tbl='Refund')
     <> (SELECT n FROM f328_deleted WHERE tbl='Refund') THEN RAISE EXCEPTION 'F-328: Refund delta mismatch'; END IF;
  IF (SELECT sum(n) FROM f328_snap WHERE phase='before' AND tbl='BookingPlayer') - (SELECT sum(n) FROM f328_snap WHERE phase='after' AND tbl='BookingPlayer')
     <> (SELECT n FROM f328_deleted WHERE tbl='BookingPlayer') THEN RAISE EXCEPTION 'F-328: BookingPlayer delta mismatch'; END IF;
END $$;

\echo === RESULT: deleted rows per table ===
SELECT * FROM f328_deleted ORDER BY tbl;
\echo === per-table counts, before vs after (changed rows only; everything else asserted identical) ===
SELECT b.tbl, b.tenant_id, b.bucket, b.n AS before, coalesce(a.n,0) AS after
  FROM f328_snap b LEFT JOIN f328_snap a ON a.phase='after' AND a.tbl=b.tbl AND a.tenant_id=b.tenant_id AND a.bucket=b.bucket
 WHERE b.phase='before' AND b.n <> coalesce(a.n,0)
 ORDER BY b.tbl, b.tenant_id, b.bucket;
\echo === full per-tenant Booking / PaymentIntent counts, before vs after (other tenants must be identical) ===
SELECT b.tbl, b.tenant_id, b.bucket, b.n AS before, coalesce(a.n,0) AS after
  FROM f328_snap b LEFT JOIN f328_snap a ON a.phase='after' AND a.tbl=b.tbl AND a.tenant_id=b.tenant_id AND a.bucket=b.bucket
 WHERE b.phase='before' AND b.tbl IN ('Booking','PaymentIntent')
 ORDER BY b.tbl, b.tenant_id, b.bucket;

\if :commit
  \echo === COMMIT ===
  COMMIT;
\else
  \echo === ROLLBACK (rehearsal, commit=false): nothing persisted ===
  ROLLBACK;
\endif
