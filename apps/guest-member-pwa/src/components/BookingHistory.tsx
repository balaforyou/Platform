import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest, formatBookingReference } from '@badminton/ui-shared';
import { useAuth } from '@badminton/ui-shared';
import { Calendar, Clock, Hash, MapPin, Users, HelpCircle, Navigation } from 'lucide-react';
import CancelBookingModal from './CancelBookingModal';

export default function BookingHistory() {
  const { accessToken } = useAuth();

  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // States for cancellation modal
  const [selectedCancelId, setSelectedCancelId] = useState<string | null>(null);

  // F-190 Slice 5: real per-branch venue name + coordinates, keyed by Booking.branchId (a bare
  // scalar, same shape BookingConfirmation.tsx already resolves via /branches/:id/about for its
  // own venue name + Directions link). Deduped across the list so N bookings at the same branch
  // cost one fetch, not N. A failed fetch just leaves that branch's entry absent.
  const [branchAboutById, setBranchAboutById] = useState<Record<string, any>>({});

  useEffect(() => {
    const missingIds = Array.from(new Set(bookings.map((b) => b.branchId).filter(Boolean)))
      .filter((id) => !(id in branchAboutById));
    if (missingIds.length === 0) return;

    let isMounted = true;
    missingIds.forEach((branchId) => {
      apiRequest<any>(`/tenant/branches/${branchId}/about`, { token: accessToken })
        .then((res) => {
          if (isMounted && res) {
            setBranchAboutById((prev) => ({ ...prev, [branchId]: res }));
          }
        })
        .catch(() => { /* leave this branch's venue/Directions data absent — never show data we cannot confirm */ });
    });

    return () => { isMounted = false; };
  }, [bookings, accessToken]);

  // Same real coordinate-validity check as BookingConfirmation.tsx (Slice 4) — Number.isFinite,
  // not truthy, since 0/0 is a real point (Gulf of Guinea).
  const hasCoordinates = (about: any) =>
    typeof about?.latitude === 'number' && Number.isFinite(about.latitude) &&
    typeof about?.longitude === 'number' && Number.isFinite(about.longitude);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      setError(null);
      // GET /bookings/my
      const res = await apiRequest<any[]>('/slot-engine/bookings/my', {
        token: accessToken,
      });
      setBookings(res || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load booking history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [accessToken]);

  const handleCheckIn = async (bookingId: string) => {
    try {
      // POST /bookings/:id/check-in
      await apiRequest(`/slot-engine/bookings/${bookingId}/check-in`, {
        method: 'POST',
        token: accessToken,
      });
      
      // Refresh list to show updated CHECKED_IN status
      await fetchBookings();
    } catch (err: any) {
      alert(err.message || 'Check-in failed. Please try again.');
    }
  };

  const getStatusBadge = (status: string) => {
    const base = 'px-2.5 py-1 rounded-full text-[10px] font-bold font-mono uppercase border';
    switch (status) {
      case 'HELD':
        return (
          <span className={base} style={{ background: 'var(--slot-almostfull-surface)', color: 'var(--slot-almostfull-text)', borderColor: 'var(--slot-almostfull-border)' }}>
            Hold Pending
          </span>
        );
      case 'CONFIRMED':
        return (
          <span
            className={base}
            style={{ background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-800)', borderColor: 'var(--color-accent-2-200)' }}
          >
            Confirmed
          </span>
        );
      case 'CHECKED_IN':
        return (
          <span
            className={base}
            style={{ background: 'var(--color-accent-100)', color: 'var(--color-accent-800)', borderColor: 'var(--color-accent-200)' }}
          >
            Checked In
          </span>
        );
      case 'CANCELLED':
        return (
          <span className={base} style={{ background: 'var(--color-neutral-100)', color: 'var(--color-destructive)', borderColor: 'var(--color-neutral-300)' }}>
            Cancelled
          </span>
        );
      case 'RELEASED_NO_SHOW':
        return (
          <span
            className={base}
            style={{ background: 'var(--color-neutral-100)', color: 'var(--color-neutral-700)', borderColor: 'var(--color-neutral-300)' }}
          >
            Expired
          </span>
        );
      default:
        return (
          <span
            className={base}
            style={{ background: 'var(--color-neutral-100)', color: 'var(--color-neutral-700)', borderColor: 'var(--color-neutral-300)' }}
          >
            {status}
          </span>
        );
    }
  };

  // Helper to determine if a check-in is startable
  // Rule: Check-in is open on the game day within 2 hours of slot startTime
  const isCheckInOpen = (booking: any) => {
    if (booking.status !== 'CONFIRMED') return false;
    const now = new Date();
    const st = new Date(booking.window.startTime);
    
    // Check same day and difference is < 2 hours
    const sameDay = now.toDateString() === st.toDateString();
    const diffHours = (st.getTime() - now.getTime()) / (1000 * 60 * 60);

    return sameDay && diffHours <= 2;
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] gap-[14px]" style={{ background: 'var(--color-bg)' }}>
        <style>{'@keyframes booking-history-spin { to { transform: rotate(360deg); } }'}</style>
        <div style={{ width: '52px', height: '52px', borderRadius: '999px', border: '4px solid var(--color-accent-200)', borderTopColor: 'var(--color-accent-700)', animation: 'booking-history-spin 1s linear infinite' }} />
        <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '14px', color: 'var(--color-neutral-600)' }}>Retrieving your bookings&hellip;</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] p-4 gap-3 text-center" style={{ background: 'var(--color-bg)' }}>
        <span className="flex items-center justify-center" style={{ width: '48px', height: '48px', borderRadius: '999px', background: 'var(--color-neutral-200)', color: 'var(--color-neutral-600)' }}>
          <HelpCircle className="h-6 w-6" />
        </span>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: '19px', color: 'var(--color-text)' }}>Failed to load bookings</h3>
        <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '12.5px', lineHeight: 1.55, color: 'var(--color-neutral-600)', maxWidth: '260px' }}>{error}</p>
        <button
          onClick={fetchBookings}
          className="mt-1"
          style={{ minHeight: '44px', padding: '0 20px', background: '#fff', border: '1px solid var(--color-neutral-300)', borderRadius: '14px', fontFamily: 'var(--font-body-organic)', fontSize: '13px', fontWeight: 700, color: 'var(--color-text)' }}
        >
          Retry load
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-10 space-y-8 text-ink">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-3xl tracking-tight" style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, color: 'var(--color-text)' }}>
            My bookings
          </h2>
          <p className="text-xs" style={{ color: 'var(--color-neutral-600)' }}>
            Manage your scheduled court matches, complete checkout, check-in, or request cancellations.
          </p>
        </div>
        <Link
          to="/"
          className="shrink-0 inline-flex items-center text-xs font-semibold transition-colors"
          style={{ minHeight: '44px', padding: '0 16px', background: 'var(--color-neutral-200)', border: '1px solid var(--color-neutral-300)', borderRadius: '999px', color: 'var(--color-text)', fontFamily: 'var(--font-body-organic)' }}
        >
          Dashboard
        </Link>
      </div>

      {bookings.length === 0 ? (
        <div
          className="p-16 rounded-3xl text-center space-y-4"
          style={{ background: 'var(--color-neutral-200)', border: '1px solid var(--color-neutral-300)' }}
        >
          <Calendar className="h-10 w-10 mx-auto" style={{ color: 'var(--color-neutral-500)' }} />
          <h3 className="text-lg" style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, color: 'var(--color-text)' }}>No bookings found</h3>
          <p className="text-xs max-w-xs mx-auto" style={{ color: 'var(--color-neutral-600)' }}>
            You don't have any booking reservations recorded. Reserve a court slot now to start playing!
          </p>
          <Link
            to="/branches"
            className="inline-flex py-3 px-6 rounded-2xl font-semibold text-xs transition-all shadow-lg"
            style={{ background: 'var(--color-accent-700)', color: 'var(--color-accent-100)' }}
          >
            Book Court Now
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const st = new Date(booking.window.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const et = new Date(booking.window.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const sDate = new Date(booking.window.startTime).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
            const about = branchAboutById[booking.branchId];

            return (
              <div
                key={booking.id}
                className="rounded-2xl p-6 shadow-lg flex flex-col md:flex-row md:items-center md:justify-between gap-6"
                style={{ background: '#fff', border: '1px solid var(--color-neutral-300)' }}
                id={`booking-card-${booking.id}`}
              >
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <h4 className="text-lg" style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, color: 'var(--color-text)' }}>
                      {booking.window.resourcePool.name}
                    </h4>
                    {getStatusBadge(booking.status)}
                  </div>

                  <div className="flex items-center justify-between text-[12.5px]" style={{ color: 'var(--color-neutral-700)' }}>
                    <span>Ref</span>
                    <span className="font-bold font-mono" style={{ color: 'var(--color-text)' }}>
                      {formatBookingReference(booking.id)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs font-mono" style={{ color: 'var(--color-neutral-700)' }}>
                    <div className="flex items-center space-x-1.5">
                      <Calendar className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--color-accent-700)' }} />
                      <span>{sDate}</span>
                    </div>
                    <div className="flex items-start space-x-1.5">
                      <Clock className="h-3.5 w-3.5 shrink-0 mt-px" style={{ color: 'var(--color-accent-2-700)' }} />
                      <div className="space-y-0.5">
                        <div>{st} - {et}</div>
                        {/* F-187: a multi-window (F-183) booking's extra hours live on separate
                            child rows — without this, a guest who booked 2+ hours would see only
                            the first hour here despite paying for all of them. */}
                        {Array.isArray(booking.childBookings) && booking.childBookings.length > 0 && (
                          <div id={`booking-additional-windows-${booking.id}`}>
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
                    {/* F-190 Slice 5: real venue name (Booking.branchId -> /branches/:id/about),
                        replacing a hardcoded "Coimbatore Hub" string that predated this slice.
                        Absent entirely if the branch fetch hasn't resolved or failed — never a
                        wrong or fabricated name. Directions reuses BookingConfirmation.tsx's
                        (Slice 4) exact URL + hasCoordinates gate. */}
                    {about?.name && (
                      <div className="flex items-center space-x-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--color-neutral-700)' }} />
                        <span>{about.name}</span>
                        {hasCoordinates(about) && (
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${about.latitude},${about.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Directions"
                            className="inline-flex items-center"
                            style={{ color: 'var(--color-accent-700)' }}
                          >
                            <Navigation className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    )}
                    <div className="flex items-center space-x-1.5">
                      <Users className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--color-neutral-700)' }} />
                      <span>{1 + (booking.players?.length || 0)} Players</span>
                    </div>
                    {/* F-189: the assigned court — real Resource name (F-205), else the cosmetic
                        "Court N" (F-186), else nothing (a legacy pre-F-205 booking). */}
                    {(() => {
                      const court =
                        booking.resource?.name ??
                        (booking.courtSlotIndex != null ? `Court ${booking.courtSlotIndex}` : null);
                      return court ? (
                        <div className="flex items-center space-x-1.5">
                          <Hash className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--color-neutral-700)' }} />
                          <span>{court}</span>
                        </div>
                      ) : null;
                    })()}
                  </div>

                  {booking.players && booking.players.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {booking.players.map((player: any, idx: number) => (
                        <span
                          key={idx}
                          className="text-[10px] px-2 py-0.5 rounded font-mono"
                          style={{ background: 'var(--color-neutral-200)', color: 'var(--color-neutral-700)', border: '1px solid var(--color-neutral-300)' }}
                        >
                          {player.phone}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-4 shrink-0 border-t md:border-t-0 md:border-l border-[var(--color-neutral-200)] pt-4 md:pt-0 md:pl-6">
                  <div className="flex flex-col md:items-end text-left md:text-right font-mono">
                    <span className="text-[10px]" style={{ color: 'var(--color-neutral-600)' }}>Paid Amount</span>
                    <span className="text-xl font-extrabold" style={{ color: 'var(--color-text)' }}>₹{Number(booking.price)}</span>
                  </div>

                  <div className="flex space-x-2">
                    {/* HELD: Pay Now */}
                    {booking.status === 'HELD' && (
                      <Link
                        to={`/bookings/${booking.id}/pay`}
                        className="py-2 px-4 text-xs font-semibold rounded-xl transition-all shadow-lg"
                        style={{ background: 'var(--color-accent-700)', color: 'var(--color-accent-100)' }}
                        id={`pay-now-btn-${booking.id}`}
                      >
                        Pay Now
                      </Link>
                    )}

                    {/* CONFIRMED & check-in is open: I'm Here */}
                    {isCheckInOpen(booking) && (
                      <button
                        onClick={() => handleCheckIn(booking.id)}
                        className="py-2 px-4 text-xs font-semibold rounded-xl transition-all shadow-lg"
                        style={{ background: 'var(--color-accent-2-700)', color: 'var(--color-accent-2-100)' }}
                        id={`check-in-btn-${booking.id}`}
                      >
                        I'm Here
                      </button>
                    )}

                    {/* CONFIRMED/HELD: Cancel booking */}
                    {(booking.status === 'CONFIRMED' || booking.status === 'HELD') && (
                      <button
                        onClick={() => setSelectedCancelId(booking.id)}
                        className="py-2 px-4 text-xs font-semibold rounded-xl transition-colors hover:bg-[var(--color-accent-100)]"
                        style={{ background: 'var(--color-neutral-200)', color: 'var(--color-neutral-700)', border: '1px solid var(--color-neutral-300)' }}
                        id={`cancel-booking-btn-${booking.id}`}
                      >
                        Cancel Match
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cancellation Modal */}
      {selectedCancelId && (
        <CancelBookingModal
          bookingId={selectedCancelId}
          onClose={() => setSelectedCancelId(null)}
          onSuccess={async () => {
            setSelectedCancelId(null);
            await fetchBookings();
          }}
        />
      )}
    </div>
  );
}
