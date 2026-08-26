-- F-184: guest-only daily booking cap, per branch.
--
-- Purely additive: an Int column with a default on BookingRule. No existing row's
-- meaning changes — Postgres applies the default to every existing BookingRule row.

-- AlterTable
ALTER TABLE "BookingRule" ADD COLUMN     "maxDailyBookingsPerGuest" INTEGER NOT NULL DEFAULT 3;
