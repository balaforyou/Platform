import { useEffect, useState } from 'react';
import { apiRequest } from '@badminton/ui-shared';
import { useAuth } from '@badminton/ui-shared';
import { ShieldAlert, Activity, X } from 'lucide-react';

interface CancelBookingModalProps {
  bookingId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CancelBookingModal({ bookingId, onClose, onSuccess }: CancelBookingModalProps) {
  const { accessToken } = useAuth();
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        ) : (
          <div className="space-y-4">
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
