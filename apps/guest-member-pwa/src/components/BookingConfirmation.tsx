import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiRequest, formatBookingReference } from '@badminton/ui-shared';
import { useAuth } from '@badminton/ui-shared';
import { CheckCircle, AlertCircle, Activity, ArrowRight, Navigation } from 'lucide-react';

export default function BookingConfirmation() {
  const { bookingId } = useParams();
  const { accessToken, user } = useAuth();

  const [booking, setBooking] = useState<any>(null);
  // F-190 Slice 4: broadened from just .name so the real coordinates are available for a real
  // Directions link (see below) -- same /branches/:id/about fetch this screen already made.
  const [branchAbout, setBranchAbout] = useState<any>(null);
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
    if (!branchId || branchAbout) return;

    let isMounted = true;
    apiRequest<any>(`/tenant/branches/${branchId}/about`, { token: accessToken })
      .then((res) => { if (isMounted && res) setBranchAbout(res); })
      .catch(() => { /* leave the venue line and Directions link absent — never show data we cannot confirm */ });

    return () => { isMounted = false; };
  }, [booking?.branchId, branchAbout, accessToken]);

  // F-190 Slice 4: same real coordinate-validity check BranchAbout.tsx already uses (:57-62) --
  // 0/0 is a real point (Gulf of Guinea), so a truthy check would silently hide Directions for a
  // branch actually sitting on the equator or prime meridian.
  const hasCoordinates =
    typeof branchAbout?.latitude === 'number' && Number.isFinite(branchAbout.latitude) &&
    typeof branchAbout?.longitude === 'number' && Number.isFinite(branchAbout.longitude);

  if (loading && !booking) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] gap-[14px]" style={{ background: 'var(--color-bg)' }}>
        <style>{'@keyframes booking-confirm-spin { to { transform: rotate(360deg); } }'}</style>
        <div style={{ width: '52px', height: '52px', borderRadius: '999px', border: '4px solid var(--color-accent-200)', borderTopColor: 'var(--color-accent-700)', animation: 'booking-confirm-spin 1s linear infinite' }} />
        <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '14px', color: 'var(--color-neutral-600)' }}>Verifying payment confirmation&hellip;</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] p-4 gap-3 text-center" style={{ background: 'var(--color-bg)' }}>
        <span className="flex items-center justify-center" style={{ width: '48px', height: '48px', borderRadius: '999px', background: 'var(--color-neutral-200)', color: 'var(--color-neutral-600)' }}>
          <AlertCircle className="h-6 w-6" />
        </span>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: '19px', color: 'var(--color-text)' }}>Verification error</h3>
        <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '12.5px', lineHeight: 1.55, color: 'var(--color-neutral-600)', maxWidth: '260px' }}>{error}</p>
        <Link
          to="/bookings/my"
          className="mt-1"
          style={{ minHeight: '44px', padding: '0 20px', display: 'inline-flex', alignItems: 'center', background: '#fff', border: '1px solid var(--color-neutral-300)', borderRadius: '14px', fontFamily: 'var(--font-body-organic)', fontSize: '13px', fontWeight: 700, color: 'var(--color-text)' }}
        >
          Check my bookings
        </Link>
      </div>
    );
  }

  const isConfirmed = booking?.status === 'CONFIRMED' || booking?.status === 'CHECKED_IN';
  const st = booking?.window ? new Date(booking.window.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const et = booking?.window ? new Date(booking.window.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const sDate = booking?.window ? new Date(booking.window.startTime).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '';

  return (
    <div className="flex-1 w-full mx-auto text-ink" style={{ maxWidth: '480px' }}>
      {/* F-190 Slice 4: success/pending banner (JBC Booking.dc.html:315-319). "Booking Confirmed!"
          is kept verbatim -- e2e-locked (guest-booking.spec.ts:82,127, f023-full-system.spec.ts:436
          all assert exact text on #confirmation-title) and the right call regardless, since the
          wireframe's own "Court 3 is yours" needs courtSlotIndex display, which F-189 owns, not
          this slice. The pending state has no wireframe guidance (it only draws the success case)
          -- adapted to the same banner structure. F-192 Slice F: pending state's amber routed
          through the one sanctioned amber token set (--slot-almostfull-*). */}
      <div
        className="flex flex-col items-start gap-4 px-6"
        style={{
          paddingTop: '44px',
          paddingBottom: '36px',
          background: isConfirmed ? 'var(--color-accent-2-800)' : 'var(--slot-almostfull-surface)',
        }}
      >
        <div
          className="h-16 w-16 rounded-full flex items-center justify-center"
          style={{
            background: isConfirmed ? 'var(--color-accent-2-300)' : 'var(--slot-almostfull-border)',
            color: isConfirmed ? 'var(--color-accent-2-900)' : 'var(--slot-almostfull-text)',
          }}
        >
          {isConfirmed ? <CheckCircle className="h-8 w-8" /> : <Activity className="h-8 w-8 animate-spin" />}
        </div>
        <div className="space-y-1">
          <h2
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 400,
              fontSize: '30px',
              lineHeight: 1.15,
              color: isConfirmed ? 'var(--color-bg)' : 'var(--slot-almostfull-text)',
            }}
            id="confirmation-title"
          >
            {isConfirmed ? 'Booking Confirmed!' : 'Confirming Payment...'}
          </h2>
          <p
            className="text-[13.5px] leading-relaxed"
            style={{ color: isConfirmed ? 'var(--color-accent-2-200)' : 'var(--slot-almostfull-text)' }}
          >
            {isConfirmed
              ? (user?.phone ? `Confirmation sent to ${user.phone}.` : 'Payment captured successfully.')
              : 'We are validating the signature with the bank. Please hold on.'}
          </p>
        </div>
      </div>

      <div className="px-5 py-6 space-y-6">
        {/* Match details */}
        {booking && (
          <div style={{ background: '#fff', border: '1px solid var(--color-neutral-300)', borderRadius: '16px', overflow: 'hidden' }}>
            <div className="flex justify-between items-center px-4 py-3" style={{ borderBottom: '1px solid var(--color-neutral-200)' }}>
              <span className="text-[13.5px]" style={{ color: 'var(--color-neutral-700)' }}>Booking Reference</span>
              <span className="text-[13.5px] font-bold font-mono" style={{ color: 'var(--color-text)' }}>
                {formatBookingReference(booking.id)}
              </span>
            </div>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-neutral-200)' }}>
              <div className="text-[13.5px] font-bold" style={{ color: 'var(--color-text)' }}>{sDate}</div>
              <div className="text-[12.5px]" style={{ color: 'var(--color-neutral-700)' }}>
                {st} - {et}
                {/* F-187: a multi-window (F-183) booking's additional hours are separate child
                    rows, each with its own window — without this, a guest who booked 2+ hours
                    would see only the first hour here despite paying for all of them. */}
                {Array.isArray(booking.childBookings) && booking.childBookings.length > 0 && (
                  <div id="confirmation-additional-windows">
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
            {branchAbout?.name && (
              <div className="flex justify-between items-center px-4 py-3" style={{ borderBottom: '1px solid var(--color-neutral-200)' }}>
                <span className="text-[13.5px]" style={{ color: 'var(--color-neutral-700)' }}>Venue</span>
                <span className="text-[13.5px] font-bold" style={{ color: 'var(--color-text)' }} id="confirmation-venue-name">
                  {branchAbout.name}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center px-4 py-3" style={{ borderBottom: '1px solid var(--color-neutral-200)' }}>
              <span className="text-[13.5px]" style={{ color: 'var(--color-neutral-700)' }}>Players</span>
              <span className="text-[13.5px] font-bold" style={{ color: 'var(--color-text)' }}>
                {1 + (booking.players?.length || 0)} ({booking.isMemberBooking ? 'Member' : 'Guest'})
              </span>
            </div>
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-[13.5px] font-bold" style={{ color: 'var(--color-neutral-700)' }}>Paid</span>
              <span className="text-xl font-extrabold font-mono" style={{ color: 'var(--color-accent-700)' }}>
                ₹{Number(booking.price)}
              </span>
            </div>
          </div>
        )}

        {/* F-190 Slice 4: real Directions link, reusing BranchAbout.tsx's exact URL pattern and
            its Number.isFinite coordinate-validity check (not a truthy check -- 0/0 is a real
            point, Gulf of Guinea) rather than inventing a new destination. Absent coordinates
            means an absent button, same discipline BranchAbout.tsx itself already uses. */}
        {hasCoordinates && (
          <a
            id="confirmation-directions-link"
            href={`https://www.google.com/maps/dir/?api=1&destination=${branchAbout.latitude},${branchAbout.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full min-h-[50px] flex items-center justify-center gap-2 font-bold text-[13.5px]"
            style={{ border: '1px solid var(--color-neutral-300)', background: '#fff', color: 'var(--color-text)', borderRadius: '14px' }}
          >
            <Navigation className="h-4 w-4" />
            <span>Directions</span>
          </a>
        )}

        {/* Go to Dashboard: secondary, non-sticky, stays in normal content flow. */}
        <Link
          to="/"
          className="w-full py-3 rounded-2xl font-semibold text-center transition-colors text-xs block"
          style={{ background: 'transparent', border: '1px solid var(--color-neutral-300)', color: 'var(--color-neutral-700)', fontFamily: 'var(--font-body-organic)' }}
        >
          Go to Dashboard
        </Link>
      </div>

      {/* F-190 Slice 4: sticky primary action. Unlike BookingPay.tsx, this screen has exactly one
          real action, so the wireframe's single-button sticky bar (JBC Booking.dc.html:340-342)
          maps cleanly here -- no two-buttons-one-bar conflict. */}
      <div
        className="fixed inset-x-0 bottom-0 z-20 px-5 pt-3.5 pb-[calc(14px+env(safe-area-inset-bottom))]
          sm:static sm:px-0 sm:pt-0 sm:pb-6"
        style={{ background: 'var(--color-neutral-100)', borderTop: '1px solid var(--color-neutral-300)' }}
      >
        <Link
          to="/bookings/my"
          className="w-full min-h-[54px] rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2 transition-all"
          style={{ background: 'var(--color-accent-700)', color: 'var(--color-accent-100)' }}
          id="view-my-bookings-confirmation-btn"
        >
          <span>View My Bookings</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="sm:hidden" style={{ height: '84px' }} />
    </div>
  );
}
