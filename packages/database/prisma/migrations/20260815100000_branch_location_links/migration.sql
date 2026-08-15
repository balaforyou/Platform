-- Branch location / outbound links: address already existed, coordinates and Place ID did not.
--
-- Backs the guest-facing "Get Directions" and "Leave a Review" links on the branch detail
-- page. Coordinates are stored rather than derived from googlePlaceId: deriving would need a
-- Google Places lookup (API key, billing, and a network failure mode sitting on the guest
-- path) to recover two numbers already in hand.
--
-- DOUBLE PRECISION rather than NUMERIC, deliberately. Prisma serialises Decimal as a *string*
-- in JSON — the existing Booking.price / Booking.refundAmount columns already behave that way —
-- which would force client-side parsing before a coordinate could be substituted into a maps
-- URL. DOUBLE PRECISION is exact far beyond the ~1cm these values carry.
--
-- Purely additive and nullable: existing Branch rows keep their data and gain three NULLs, so
-- there is no backfill and nothing to reconcile before this applies.

ALTER TABLE "Branch" ADD COLUMN     "googlePlaceId" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;
