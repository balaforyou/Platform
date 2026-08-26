import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiRequest } from '@badminton/ui-shared';
import { useAuth } from '@badminton/ui-shared';
import { CheckCircle, AlertCircle, Activity, ArrowRight, Calendar, Clock, MapPin, Users } from 'lucide-react';

export default function BookingConfirmation() {
  const { bookingId } = useParams();
  const { accessToken } = useAuth();

  const [booking, setBooking] = useState<any>(null);
  const [branchName, setBranchName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Poll for CONFIRMED status (since webhook capture is asynchronous in background)
  useEffect(() => {
    if (!bookingId) return;

    let isMounted = true;
    let pollInterval: any;

    const checkStatus = async () => {
      try {
        const res = await apiRequest<any>(`/slot-engine/bookings/${bookingId}`, {
          token: accessToken,
        });
        
        if (isMounted) {
          setBooking(res);
          setLoading(false);
          
          // Stop polling once confirmed or cancelled
          if (res.status === 'CONFIRMED' || res.status === 'CHECKED_IN' || res.status === 'CANCELLED') {
            clearInterval(pollInterval);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to verify booking status.');
          setLoading(false);
          clearInterval(pollInterval);
        }
      }
    };

    checkStatus();
    // Poll every 1.5 seconds for up to 30 seconds
    let attempts = 0;
    pollInterval = setInterval(() => {
      attempts++;
      if (attempts > 20) {
        clearInterval(pollInterval);
        return;
      }
      checkStatus();
    }, 1500);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [bookingId, accessToken]);

  // F-102: resolve the real venue name. This screen previously rendered a hardcoded string, so
  // every tenant's guests were told they had booked the same venue. A booking row carries
  // branchId as a bare scalar with no relation, so the name comes from the branch endpoint.
  //
  // Deliberately a separate effect from the status poll: it must run once rather than every
  // 1.5s, and a failure here has to leave the venue line absent rather than wrong, without
  // disturbing confirmation polling.
  useEffect(() => {
    const branchId = booking?.branchId;
    if (!branchId || branchName) return;

    let isMounted = true;
    apiRequest<any>(`/tenant/branches/${branchId}/about`, { token: accessToken })
      .then((res) => { if (isMounted && res?.name) setBranchName(res.name); })
      .catch(() => { /* leave the venue line absent — never show a venue we cannot confirm */ });

    return () => { isMounted = false; };
  }, [booking?.branchId, branchName, accessToken]);

  if (loading && !booking) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-ink">
        <Activity className="h-10 w-10 animate-spin text-[var(--brand-primary)] mb-4" />
        <p className="text-ink-muted text-sm font-medium">Verifying payment confirmation...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-ink p-4">
        <AlertCircle className="h-12 w-12 text-red-600 mb-4" />
        <h3 className="text-lg font-bold">Verification Error</h3>
        <p className="text-ink-muted text-sm mt-1 text-center max-w-md">{error}</p>
        <Link to="/bookings/my" className="mt-4 py-2.5 px-6 bg-surface-mint border border-edge-strong rounded-xl text-xs hover:bg-edge">
          Check My Bookings
        </Link>
      </div>
    );
  }

  const isConfirmed = booking?.status === 'CONFIRMED' || booking?.status === 'CHECKED_IN';
  const st = booking?.window ? new Date(booking.window.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const et = booking?.window ? new Date(booking.window.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const sDate = booking?.window ? new Date(booking.window.startTime).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '';

  return (
    <div className="flex-1 max-w-md w-full mx-auto px-4 py-10 space-y-8 text-ink">
      {/* Visual Indicator */}
      <div className="flex flex-col items-center justify-center text-center space-y-4">
        {isConfirmed ? (
          <>
            <div className="h-20 w-20 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <CheckCircle className="h-10 w-10 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h2 className="text-3xl font-extrabold tracking-tight font-outfit" id="confirmation-title">
                Booking Confirmed!
              </h2>
              <p className="text-ink-muted text-xs font-semibold leading-relaxed">
                Payment captured successfully. Your court slot is reserved and ready.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="h-20 w-20 bg-amber-50 border border-amber-200 text-amber-700 rounded-full flex items-center justify-center shadow-lg shadow-amber-500/10">
              <Activity className="h-10 w-10 animate-spin" />
            </div>
            <div className="space-y-1">
              <h2 className="text-3xl font-extrabold tracking-tight font-outfit" id="confirmation-title">
                Confirming Payment...
              </h2>
              <p className="text-ink-muted text-xs font-semibold leading-relaxed">
                We are validating the signature with the bank. Please hold on.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Booking Summary */}
      {booking && (
        <div className="bg-surface-mint border border-edge p-6 rounded-2xl space-y-4">
          <h3 className="text-xs font-bold font-outfit text-ink-muted uppercase tracking-wider">
            Match Details
          </h3>
          
          <div className="space-y-3 font-mono text-xs text-ink-muted pt-1">
            <div className="flex items-start space-x-2.5">
              <Calendar className="h-4 w-4 text-[var(--brand-primary)] shrink-0 mt-0.5" />
              <span>{sDate}</span>
            </div>
            <div className="flex items-start space-x-2.5">
              <Clock className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span>{st} - {et}</span>
                {/* F-187: a multi-window (F-183) booking's additional hours are separate child
                    rows, each with its own window — without this, a guest who booked 2+ hours
                    would see only the first hour here despite paying for all of them. */}
                {Array.isArray(booking.childBookings) && booking.childBookings.length > 0 && (
                  <div className="space-y-0.5" id="confirmation-additional-windows">
                    {booking.childBookings
                      .slice()
                      .sort((a: any, b: any) => new Date(a.window.startTime).getTime() - new Date(b.window.startTime).getTime())
                      .map((child: any) => (
                        <div key={child.id}>
                          + {new Date(child.window.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                          {new Date(child.window.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
            {branchName && (
              <div className="flex items-start space-x-2.5">
                <MapPin className="h-4 w-4 text-blue-700 shrink-0 mt-0.5" />
                <span id="confirmation-venue-name">{branchName}</span>
              </div>
            )}
            <div className="flex items-start space-x-2.5">
              <Users className="h-4 w-4 text-ink-muted shrink-0 mt-0.5" />
              <span>{1 + (booking.players?.length || 0)} Players ({booking.isMemberBooking ? 'Member' : 'Guest'})</span>
            </div>
          </div>

          <div className="pt-4 border-t border-edge flex justify-between items-end">
            <span className="text-xs font-bold text-ink-muted font-outfit">Total Price:</span>
            <span className="text-xl font-extrabold text-[var(--brand-primary)] font-mono">
              ₹{Number(booking.price)}
            </span>
          </div>
        </div>
      )}

      {/* Next Actions */}
      <div className="flex flex-col space-y-3">
        <Link
          to="/bookings/my"
          className="w-full py-3 rounded-2xl bg-[var(--brand-primary)] hover:opacity-95 text-white font-semibold flex items-center justify-center space-x-2 transition-all shadow-lg shadow-[var(--brand-primary)]/20"
          id="view-my-bookings-confirmation-btn"
        >
          <span>View My Bookings</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          to="/"
          className="w-full py-3 rounded-2xl bg-surface-mint hover:bg-edge text-ink border border-edge-strong font-semibold text-center transition-all text-xs"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
