-- F-225: per-court walk-in-guest eligibility (F-220 §3.1, Authorized Guest Courts).
--
-- Two-step on purpose:
--   1. ADD COLUMN ... DEFAULT true  — backfills EVERY existing Resource row to true, so a court
--      that is guest-bookable today (all of them — F-205's real-court assignment is live on JBC)
--      stays guest-bookable. A bare DEFAULT false here would silently walk every JBC court back
--      to resourceId:null for guest bookings until an owner re-authorised each one.
--   2. ALTER COLUMN ... SET DEFAULT false — flips the column default for any row inserted AFTER
--      this migration, i.e. a newly onboarded court is opt-in (must be explicitly authorised in
--      the Authorized Guest Courts screen). Matches schema.prisma's @default(false).
--
-- Only the guest self-service booking path (POST /bookings) reads this — assignPooledCourt skips
-- an unauthorised court there. The admin/negotiated path and the member auto-booking path do not
-- filter on it. It is never a rejection reason: a pool with no authorised court free for a
-- window falls back to the existing resourceId:null / occupancy-scan index, exactly as a pool
-- with no Resource rows does today.

ALTER TABLE "Resource" ADD COLUMN "guestBookable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Resource" ALTER COLUMN "guestBookable" SET DEFAULT false;
