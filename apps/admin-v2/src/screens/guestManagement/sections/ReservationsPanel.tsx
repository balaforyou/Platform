import { WalkInBookingFlow } from './WalkInBookingFlow';

/**
 * F-229 Step 5 — the Reservations tab: the walk-in booking flow with no prefill, exactly as it
 * behaved before. F-250 extracted the actual flow into `WalkInBookingFlow` so the new Guest Slot
 * Inventory grid can reuse the same implementation (prefilled from a tapped cell) instead of a
 * second one that could drift.
 */
export function ReservationsPanel({ branchId }: { branchId: string }) {
  return <WalkInBookingFlow branchId={branchId} />;
}
