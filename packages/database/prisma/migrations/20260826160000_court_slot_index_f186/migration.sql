-- F-186: display-only "Court N" number for POOLED pools with no real per-court
-- resourceId tracking.
--
-- Purely additive: a nullable Int column on Booking. No existing row's meaning
-- changes, no backfill needed — every existing row gets courtSlotIndex = NULL,
-- identical to the "no court number computed" state new bookings fall back to
-- when no common index is free across every window they touch.

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "courtSlotIndex" INTEGER;
