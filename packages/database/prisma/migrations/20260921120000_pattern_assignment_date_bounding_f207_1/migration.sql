-- F-207.1: AvailabilityPattern and MemberGroupAssignment gain startDate/endDate, bounding how
-- long a pattern/assignment is in force. No enforcement lands in this sub-slice (F-207.2) --
-- purely additive columns that nothing yet reads to gate window generation or booking.
--
-- Both columns are added nullable, backfilled, then set NOT NULL in the same migration --
-- every existing row gets a real value rather than staying nullable indefinitely, since every
-- row already has a createdAt to derive from. Backfill: startDate = createdAt, endDate =
-- createdAt + 1 month, using Postgres's own INTERVAL '1 month' arithmetic (which overflows a
-- short month rather than clamping -- e.g. Jan 31 + 1 month = Mar 3, not Feb 28). This is a
-- one-time default for pre-existing rows only; every date computed going forward (CREATE,
-- PATCH, /renew) goes through branchTime.ts's addMonthsUtc, which clamps instead. The two
-- disagreeing only on backfilled legacy rows with a day-of-month > 28 is accepted, not fixed
-- here -- there is no "real" original startDate for those rows to reconcile against.
--
-- No self-defending duplicate-guard needed (unlike F-067/F-115): this migration adds columns,
-- it does not add a constraint that pre-existing data could violate.

ALTER TABLE "AvailabilityPattern" ADD COLUMN "startDate" TIMESTAMP(3);
ALTER TABLE "AvailabilityPattern" ADD COLUMN "endDate" TIMESTAMP(3);

UPDATE "AvailabilityPattern"
   SET "startDate" = "createdAt",
       "endDate" = "createdAt" + INTERVAL '1 month';

ALTER TABLE "AvailabilityPattern" ALTER COLUMN "startDate" SET NOT NULL;
ALTER TABLE "AvailabilityPattern" ALTER COLUMN "endDate" SET NOT NULL;

ALTER TABLE "MemberGroupAssignment" ADD COLUMN "startDate" TIMESTAMP(3);
ALTER TABLE "MemberGroupAssignment" ADD COLUMN "endDate" TIMESTAMP(3);

UPDATE "MemberGroupAssignment"
   SET "startDate" = "createdAt",
       "endDate" = "createdAt" + INTERVAL '1 month';

ALTER TABLE "MemberGroupAssignment" ALTER COLUMN "startDate" SET NOT NULL;
ALTER TABLE "MemberGroupAssignment" ALTER COLUMN "endDate" SET NOT NULL;
