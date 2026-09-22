import { useEffect, useState } from 'react';
import { apiRequest, useTenant } from '@badminton/ui-shared';
import { useAuth } from '@badminton/ui-shared';
import { ShieldAlert, Activity, X, Download, CheckCircle } from 'lucide-react';

interface CancelBookingModalProps {
  bookingId: string;
  // F-235 Slice G: the full booking + its branch-about record, already fetched by
  // BookingHistory.tsx (branchAboutById) -- passed down so the cancellation receipt (design
  // brief §0.6) can be built from data already in memory, no new fetch.
  booking: any;
  branchAbout: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CancelBookingModal({ bookingId, booking, branchAbout, onClose, onSuccess }: CancelBookingModalProps) {
  const { accessToken } = useAuth();
  const { tenant } = useTenant();
  // F-241/F-243: a HELD booking was never paid for, so a refund-tier breakdown and
  // refund-processing copy are both nonsensical here -- confirmed via cancel-preview
  // (services/slot-engine/src/index.ts) returning refundPercent:100/refundAmount:price for
  // HELD regardless, which reads as "you'll get back money that was never charged."
  // Snapshotted once at mount, not derived live from `booking`: onSuccess() (called from
  // handleConfirmCancel below) refreshes BookingHistory.tsx's list and flips this same booking's
  // prop to CANCELLED before the modal's own "cancelled" success view renders, which silently
  // reverted this to the CONFIRMED copy for a real HELD cancel -- caught live during F-240/248
  // batch verification.
  const [isHeld] = useState(() => booking?.status === 'HELD');
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // F-235 Slice G: once cancellation actually succeeds, hold the modal open one more beat to
  // offer the new PDF receipt (design brief §0.6) rather than closing immediately -- onSuccess()
  // (which refreshes the list and flips the status badge to Cancelled) still fires right away.
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    const fetchPreview = async () => {
      try {
        setLoading(true);
        setError(null);
        // GET /bookings/:id/cancel-preview
        const res = await apiRequest<any>(`/slot-engine/bookings/${bookingId}/cancel-preview`, {
          token: accessToken,
        });
        setPreview(res);
      } catch (err: any) {
        setError(err.message || 'Failed to retrieve cancellation preview.');
      } finally {
        setLoading(false);
      }
    };

    fetchPreview();
  }, [bookingId, accessToken]);

  const handleConfirmCancel = async () => {
    try {
      setSubmitting(true);
      setError(null);

      // POST /bookings/:id/cancel
      await apiRequest(`/slot-engine/bookings/${bookingId}/cancel`, {
        method: 'POST',
        token: accessToken,
      });

      // F-235 Slice G: onSuccess() now only refreshes the underlying list (status flips to
      // Cancelled behind this modal) -- it no longer closes the modal itself, so there's a real
      // moment to offer the new PDF receipt below before the guest dismisses it.
      setCancelled(true);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel the booking.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop -- F-192 Slice F: black/80 -> the warm neutral-900 scrim token (frame 13). */}
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'var(--scrim-warm)' }} onClick={onClose}></div>

      {/* Modal Card */}
      <div
        className="relative w-full max-w-md p-6 space-y-6 overflow-hidden"
        style={{ background: 'var(--color-neutral-100)', border: '1px solid var(--color-neutral-300)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)' }}
      >
        {/* Close button -- 44px hit target (frame 13's explicit "fix it in code", was p-1.5 = ~34px). */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 flex items-center justify-center transition-colors"
          style={{ width: '44px', height: '44px', borderRadius: '999px', background: 'var(--color-neutral-200)', color: 'var(--color-neutral-700)' }}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center space-x-3 pr-12">
          <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#fdecea', color: 'var(--color-destructive)' }}>
            <ShieldAlert className="h-5 w-5" />
          </div>
          <h3 className="text-xl" style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, color: 'var(--color-text)' }}>Cancel Your Match</h3>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center">
            <Activity className="h-8 w-8 animate-spin mb-2" style={{ color: 'var(--color-accent-700)' }} />
            <p className="text-xs" style={{ color: 'var(--color-neutral-600)' }}>Computing refund amount&hellip;</p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl text-xs" style={{ background: 'var(--color-neutral-100)', border: '1px solid var(--color-neutral-300)', color: 'var(--color-destructive)' }}>
            {error}
          </div>
        ) : cancelled ? (
          // F-235 Slice G / design brief §0.6: held open one extra beat after a real successful
          // cancel so the guest can download the new cancellation receipt (real refund breakdown,
          // no new fetch) before dismissing -- the underlying list is already refreshed via
          // onSuccess() above.
          <div className="space-y-4">
            <div className="flex flex-col items-center text-center gap-2 py-2">
              <CheckCircle className="h-8 w-8" style={{ color: 'var(--color-accent-2-800)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                {isHeld ? 'Hold released' : 'Booking cancelled'}
              </p>
              <p className="text-xs" style={{ color: 'var(--color-neutral-600)' }}>
                {isHeld
                  ? 'Your hold has been released. No payment was ever taken for this booking.'
                  : <>Your refund of ₹{preview?.refundAmount} will be processed under the venue&rsquo;s policy.</>}
              </p>
            </div>
            {/* F-286: a HELD booking was never paid for, so there's genuinely nothing to
                receipt -- no charge, no refund. The PDF (receipt.ts) renders Amount Paid/
                Original Price/Refund Percent/Refund Amount unconditionally from `preview`,
                the same known-nonsensical-for-HELD shape the on-screen copy above already
                works around; gating the button here (rather than making the PDF itself
                HELD-aware) removes the fabricated-figure risk entirely instead of patching
                its content. The non-HELD path below is completely unchanged. */}
            {!isHeld && (
              <button
                type="button"
                id="download-cancellation-receipt-btn"
                onClick={() => {
                  import('../lib/receipt').then(({ downloadCancellationReceipt }) => {
                    downloadCancellationReceipt(booking, branchAbout, preview, tenant?.appName || tenant?.name);
                  });
                }}
                className="w-full py-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2"
                style={{ background: 'var(--color-accent-2-400)', color: 'var(--color-neutral-900)' }}
              >
                <Download className="h-4 w-4" />
                <span>Download Cancellation Receipt (PDF)</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl font-semibold text-xs transition-colors"
              style={{ background: 'transparent', border: '1px solid var(--color-neutral-300)', color: 'var(--color-neutral-700)' }}
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {isHeld ? (
              // F-241/F-243: HELD is a hold, not a payment -- no refund to preview or process.
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-neutral-700)' }}>
                Release this hold? No payment has been made for this booking, so there&rsquo;s nothing to refund.
              </p>
            ) : (
              <>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--color-neutral-700)' }}>
                  Cancellations follow the venue&rsquo;s booking rules. Here&rsquo;s your refund under the current policy.
                </p>

                <div
                  className="p-4 rounded-xl space-y-3 font-mono text-xs"
                  style={{ background: 'var(--color-neutral-200)', border: '1px solid var(--color-neutral-300)' }}
                >
                  <div className="flex justify-between" style={{ color: 'var(--color-neutral-600)' }}>
                    <span>Original Price:</span>
                    <span style={{ color: 'var(--color-text)' }}>₹{preview?.originalPrice}</span>
                  </div>
                  <div className="flex justify-between" style={{ color: 'var(--color-neutral-600)' }}>
                    <span>Policy Refund %:</span>
                    <span className="font-bold" style={{ color: 'var(--color-accent-2-800)' }}>{preview?.refundPercent}%</span>
                  </div>
                  <div className="flex justify-between items-center pt-2.5 text-sm" style={{ borderTop: '1px solid var(--color-neutral-300)' }}>
                    <span className="font-semibold" style={{ color: 'var(--color-text)' }}>Calculated Refund:</span>
                    <span className="font-extrabold text-base" style={{ color: 'var(--color-accent-2-800)' }} id="refund-preview-display">
                      ₹{preview?.refundAmount}
                    </span>
                  </div>
                </div>
              </>
            )}

            <div className="flex space-x-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl font-semibold text-xs transition-colors"
                style={{ background: 'transparent', border: '1px solid var(--color-neutral-300)', color: 'var(--color-neutral-700)' }}
              >
                Go Back
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={submitting}
                className="flex-1 py-3 rounded-xl font-semibold text-xs flex items-center justify-center space-x-1.5 transition-colors"
                style={{ background: 'var(--color-destructive)', color: '#fff' }}
                id="confirm-cancellation-btn"
              >
                {submitting ? (
                  <Activity className="h-4 w-4 animate-spin" />
                ) : (
                  <span>Confirm Cancel</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
