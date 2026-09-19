import { useEffect, useState } from 'react';
import { Banner, Button, Modal, useToast } from '../../../components';
import { friendlyError } from '../../../lib/errorMessage';
import { useBookingGuestDetail, useCancelBooking, useCancelPreview } from '../queries';
import { formatSlotLabel } from '../reservationHelpers';
import type { BookingGuestDetail } from '../types';

const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 'var(--av2-space-3)', padding: '6px 0' };
const label: React.CSSProperties = { color: 'var(--av2-muted)', fontSize: 'var(--av2-text-sm)' };
const value: React.CSSProperties = { fontWeight: 600, fontSize: 'var(--av2-text-sm)', textAlign: 'right' };

/**
 * F-252 — the Inventory grid's tap-through detail for a Booked/Completed/Cancelled cell.
 * Fetches `GET /bookings/:id/guest-detail` on open (one booking, not the pool's worth — Q6).
 * Booked's Cancel action goes through a real refund-preview confirm step (Q12), reusing
 * guest-pwa's `CancelBookingModal.tsx` pattern instead of a bare one-click cancel.
 */
export function BookingDetailModal({
  bookingId,
  // F-252: the caller already knows which of the 5 grid states was tapped — `guest-detail`'s
  // own `status` field (CONFIRMED/CHECKED_IN/CANCELLED) can't distinguish Booked from Completed
  // by itself, since both are ordinary CONFIRMED bookings; only elapsed-ness (a time comparison
  // the grid already made when it classified the cell) tells them apart. Passed explicitly
  // rather than re-deriving "now vs. windowEnd" a second time in this modal.
  cellType,
  timezone,
  onClose,
  onCancelled,
}: {
  bookingId: string | null;
  cellType: 'guest-booked' | 'completed' | 'cancelled' | null;
  timezone: string | undefined;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const toast = useToast();
  const fetchDetail = useBookingGuestDetail();
  const cancelPreview = useCancelPreview();
  const cancelBooking = useCancelBooking();
  const [detail, setDetail] = useState<BookingGuestDetail | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<{ refundAmount: number; refundPercent: number } | null>(null);

  useEffect(() => {
    if (!bookingId) {
      setDetail(null);
      setConfirming(false);
      setPreview(null);
      return;
    }
    fetchDetail.mutate(
      { bookingId },
      { onSuccess: setDetail, onError: (err) => toast.push(friendlyError(err, "Couldn’t load booking detail."), 'error') },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const startCancel = async () => {
    if (!bookingId) return;
    try {
      const p = await cancelPreview.mutateAsync({ bookingId });
      setPreview({ refundAmount: p.refundAmount, refundPercent: p.refundPercent });
      setConfirming(true);
    } catch (err) {
      toast.push(friendlyError(err, "Couldn’t load the refund preview. Try again."), 'error');
    }
  };

  const confirmCancel = async () => {
    if (!bookingId) return;
    try {
      await cancelBooking.mutateAsync({ bookingId });
      toast.push('Booking cancelled.', 'success');
      onCancelled();
    } catch (err) {
      toast.push(friendlyError(err, "Couldn’t cancel that booking. Try again."), 'error');
    }
  };

  const title = cellType === 'cancelled' ? 'Cancelled booking' : cellType === 'completed' ? 'Completed booking' : 'Booking detail';

  return (
    <Modal open={!!bookingId} onOpenChange={(open) => { if (!open) onClose(); }} title={title}>
      {!detail ? (
        <Banner tone="info">Loading…</Banner>
      ) : confirming ? (
        <div style={{ display: 'grid', gap: 'var(--av2-space-3)' }}>
          <p style={{ margin: 0, fontSize: 'var(--av2-text-sm)' }}>
            Cancelling this booking refunds{' '}
            <strong>₹{preview?.refundAmount ?? 0}</strong> ({preview?.refundPercent ?? 0}%) to the guest.
          </p>
          <div style={{ display: 'flex', gap: 'var(--av2-space-2)', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={cancelBooking.isPending}>
              Back
            </Button>
            <Button
              variant="secondary"
              style={{ color: 'var(--av2-danger)', borderColor: 'var(--av2-danger-border)' }}
              onClick={confirmCancel}
              loading={cancelBooking.isPending}
              disabled={cancelBooking.isPending}
            >
              Confirm cancellation
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--av2-space-3)' }}>
          <div>
            <div style={{ fontWeight: 700 }}>
              {detail.courtLabel ?? 'Court'} · {formatSlotLabel({ id: detail.bookingId, startTime: detail.windowStart, endTime: detail.windowEnd, capacity: 1 }, timezone)}
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--av2-border)' }}>
            {cellType === 'cancelled' && detail.status === 'CANCELLED' ? (
              // F-252 mock: fuller field set for an elapsed, unresolved cancellation — the
              // record an admin might need to reconcile a dispute against.
              <>
                <div style={row}><span style={label}>Original guest</span><span style={value}>{detail.guestName || 'Guest'}</span></div>
                <div style={row}><span style={label}>Phone</span><span style={value}>{detail.guestPhone || '—'}</span></div>
                <div style={row}><span style={label}>Price at booking</span><span style={value}>{detail.priceAtBooking ? `₹${detail.priceAtBooking}` : '—'}</span></div>
                <div style={row}><span style={label}>Cancelled by</span><span style={value}>{detail.cancelledBy}</span></div>
                <div style={row}><span style={label}>Payment</span><span style={value}>{detail.payment}</span></div>
              </>
            ) : cellType === 'completed' && detail.status !== 'CANCELLED' ? (
              // F-252 mock: Completed is a condensed, read-only summary — no phone/paid-via/
              // booked-by re-shown, price and method combined into one line.
              <>
                <div style={row}><span style={label}>Guest</span><span style={value}>{detail.guestName || 'Guest'}</span></div>
                <div style={row}>
                  <span style={label}>Price</span>
                  <span style={value}>{detail.price ? `₹${detail.price}` : '—'}{detail.paymentMethod ? ` · ${detail.paymentMethod}` : ''}</span>
                </div>
              </>
            ) : detail.status !== 'CANCELLED' ? (
              <>
                <div style={row}><span style={label}>Guest</span><span style={value}>{detail.guestName || 'Guest'}</span></div>
                <div style={row}><span style={label}>Phone</span><span style={value}>{detail.guestPhone || '—'}</span></div>
                <div style={row}><span style={label}>Price</span><span style={value}>{detail.price ? `₹${detail.price}` : '—'}</span></div>
                <div style={row}><span style={label}>Paid via</span><span style={value}>{detail.paymentMethod ?? '—'}</span></div>
                <div style={row}><span style={label}>Booked by</span><span style={value}>{detail.bookedBy}</span></div>
              </>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 'var(--av2-space-2)', justifyContent: 'flex-end' }}>
            {cellType === 'guest-booked' && detail.status !== 'CANCELLED' && (
              <Button
                variant="secondary"
                style={{ color: 'var(--av2-danger)', borderColor: 'var(--av2-danger-border)' }}
                onClick={startCancel}
                loading={cancelPreview.isPending}
                disabled={cancelPreview.isPending}
              >
                Cancel booking
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
