-- F-310: non-contiguous multi-slot guest booking (POST /booking-orders), Phase 1.
--
-- Purely additive: one boolean on "BookingRule" (default true, so every existing pool's
-- F-184 daily-cap enforcement is unchanged) and one nullable scalar on "Booking" (no
-- backfill -- every booking created through the existing /bookings route stays NULL).
-- See services/slot-engine/src/index.ts's POST /booking-orders for the real fix.

ALTER TABLE "BookingRule" ADD COLUMN     "dailyBookingCapEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Booking" ADD COLUMN     "orderId" TEXT;

CREATE INDEX "Booking_orderId_idx" ON "Booking"("orderId");
