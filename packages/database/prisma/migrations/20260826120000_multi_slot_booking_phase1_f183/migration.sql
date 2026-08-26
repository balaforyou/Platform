-- F-183 Phase 1: single-court contiguous booking extension.
--
-- Purely additive: a nullable self-relation on Booking (parent/child rows for a
-- multi-hour booking) and an Int column with a default on BookingRule. No existing
-- row's meaning changes, no backfill needed — Postgres applies the default to every
-- existing BookingRule row, and every existing Booking row gets parentBookingId = NULL.
--
-- onDelete: Cascade on parentBookingId is inert in current practice: no Booking row is
-- ever hard-deleted anywhere in the codebase (cancellation is a status flip, not a
-- row removal) — confirmed by grepping for booking.delete/deleteMany across all
-- services before writing this migration.

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "parentBookingId" TEXT;

-- AlterTable
ALTER TABLE "BookingRule" ADD COLUMN     "maxAdditionalWindows" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "Booking_parentBookingId_idx" ON "Booking"("parentBookingId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_parentBookingId_fkey" FOREIGN KEY ("parentBookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
