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
      {/* Backdrop overlay */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>

      {/* Modal Card */}
      <div
        className="relative w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-6 text-ink overflow-hidden"
        style={{ background: 'var(--color-neutral-100)', border: '1px solid var(--color-neutral-300)' }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-ink-muted hover:text-ink transition-colors"
          style={{ background: 'var(--color-neutral-200)' }}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#fef2f2', color: '#b91c1c' }}>
            <ShieldAlert className="h-5 w-5" />
          </div>
          <h3 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)', fontWeight: 400 }}>Cancel Your Match</h3>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center">
            <Activity className="h-8 w-8 animate-spin mb-2" style={{ color: 'var(--color-accent-700)' }} />
            <p className="text-xs text-ink-muted">Computing refund amount...</p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl text-xs" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>
            {error}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-ink-muted leading-relaxed">
              cancellations are subject to the court booking rules. Below is a preview of your calculated refund according to current policies.
            </p>

            <div
              className="p-4 rounded-xl space-y-3 font-mono text-xs"
              style={{ background: 'var(--color-neutral-200)', border: '1px solid var(--color-neutral-300)' }}
            >
              <div className="flex justify-between text-ink-muted">
                <span>Original Price:</span>
                <span className="text-ink">₹{preview?.originalPrice}</span>
              </div>
              <div className="flex justify-between text-ink-muted">
                <span>Policy Refund %:</span>
                <span className="font-bold" style={{ color: 'var(--color-accent-2-800)' }}>{preview?.refundPercent}%</span>
              </div>
              <div className="flex justify-between items-center pt-2.5 text-sm" style={{ borderTop: '1px solid var(--color-neutral-300)' }}>
                <span className="text-ink font-semibold">Calculated Refund:</span>
                <span className="font-extrabold text-base" style={{ color: 'var(--color-accent-2-800)' }} id="refund-preview-display">
                  ₹{preview?.refundAmount}
                </span>
              </div>
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl font-semibold text-xs transition-all text-ink-muted"
                style={{ border: '1px solid var(--color-neutral-300)' }}
              >
                Go Back
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={submitting}
                className="flex-1 py-3 text-white rounded-xl font-semibold text-xs flex items-center justify-center space-x-1.5 transition-all shadow-lg"
                style={{ background: '#dc2626' }}
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
