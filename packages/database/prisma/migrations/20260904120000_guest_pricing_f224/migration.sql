-- F-224: guest-only Standard/Peak court pricing (F-220 §3.2, Custom Pricing Rates).
--
-- Purely additive: three nullable columns on "Branch", no backfill, no existing row's meaning
-- changes. A branch with none of these set prices guest bookings at ResourcePool.defaultRate
-- exactly as before this migration.
--
--   guestStandardRate  guest rate applied outside every peak window
--   guestPeakRate       guest rate applied inside any peak window (required only once a window exists)
--   guestPeakWindows    JSON array of { "start": "HH:mm", "end": "HH:mm" } (branch-local),
--                       non-overlapping and non-duplicate — validated by the write route, not the DB
--
-- Member pricing (F-209) never reads these. resolvePrice()'s existing per-window
-- AvailabilityWindow.price override still wins ahead of these. Only the guest booking call site
-- (slot-engine) consults them; the member auto-booking call site is untouched.

ALTER TABLE "Branch" ADD COLUMN     "guestStandardRate" DECIMAL(10,2);
ALTER TABLE "Branch" ADD COLUMN     "guestPeakRate" DECIMAL(10,2);
ALTER TABLE "Branch" ADD COLUMN     "guestPeakWindows" JSONB;
