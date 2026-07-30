import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '@badminton/ui-shared';
import { useAuth } from '@badminton/ui-shared';
import { Calendar, Clock, MapPin, Users, HelpCircle, Activity } from 'lucide-react';
import CancelBookingModal from './CancelBookingModal';

export default function BookingHistory() {
  const { accessToken } = useAuth();
  
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // States for cancellation modal
  const [selectedCancelId, setSelectedCancelId] = useState<string | null>(null);

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
    switch (status) {
      case 'HELD':
        return (
          <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono uppercase">
            Hold Pending
          </span>
        );
      case 'CONFIRMED':
        return (
          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono uppercase">
            Confirmed
          </span>
        );
      case 'CHECKED_IN':
        return (
          <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono uppercase">
            Checked In
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono uppercase">
            Cancelled
          </span>
        );
      case 'RELEASED_NO_SHOW':
        return (
          <span className="bg-gray-500/10 text-gray-400 border border-white/5 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono uppercase">
            Expired
          </span>
        );
      default:
        return (
          <span className="bg-white/5 text-gray-400 border border-white/5 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono uppercase">
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
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-white">
        <Activity className="h-10 w-10 animate-spin text-[var(--brand-primary)] mb-4" />
        <p className="text-gray-400 text-sm font-medium">Retrieving your bookings...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-white p-4">
        <HelpCircle className="h-12 w-12 text-red-500 mb-4" />
        <h3 className="text-lg font-bold">Failed to load bookings</h3>
        <p className="text-gray-400 text-sm mt-1 text-center max-w-md">{error}</p>
        <button
          onClick={fetchBookings}
          className="mt-4 py-2 px-6 bg-white/5 border border-white/10 rounded-xl text-xs hover:bg-white/10"
        >
          Retry Load
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-10 space-y-8 text-white">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-extrabold tracking-tight font-outfit">
            My <span className="text-[var(--brand-primary)]">Bookings</span>
          </h2>
          <p className="text-gray-400 text-xs">
            Manage your scheduled court matches, complete checkout, check-in, or request cancellations.
          </p>
        </div>
        <Link
          to="/"
          className="py-2.5 px-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-xs font-semibold transition-all"
        >
          Go Dashboard
        </Link>
      </div>

      {bookings.length === 0 ? (
        <div className="bg-white/5 border border-white/5 p-16 rounded-3xl text-center space-y-4">
          <Calendar className="h-10 w-10 text-gray-500 mx-auto" />
          <h3 className="text-lg font-bold">No bookings found</h3>
          <p className="text-gray-400 text-xs max-w-xs mx-auto">
            You don't have any booking reservations recorded. Reserve a court slot now to start playing!
          </p>
          <Link
            to="/branches"
            className="inline-flex py-3 px-6 rounded-2xl bg-[var(--brand-primary)] hover:opacity-95 text-white font-semibold text-xs transition-all shadow-lg"
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

            return (
              <div
                key={booking.id}
                className="bg-white/5 border border-white/5 rounded-2xl p-6 shadow-lg flex flex-col md:flex-row md:items-center md:justify-between gap-6"
                id={`booking-card-${booking.id}`}
              >
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <h4 className="text-lg font-bold font-outfit text-white">
                      {booking.window.resourcePool.name}
                    </h4>
                    {getStatusBadge(booking.status)}
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-gray-400 font-mono">
                    <div className="flex items-center space-x-1.5">
                      <Calendar className="h-3.5 w-3.5 text-[var(--brand-primary)] shrink-0" />
                      <span>{sDate}</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <Clock className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <span>{st} - {et}</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <MapPin className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      <span>Coimbatore Hub</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <Users className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <span>{1 + (booking.players?.length || 0)} Players</span>
                    </div>
                  </div>

                  {booking.players && booking.players.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {booking.players.map((player: any, idx: number) => (
                        <span
                          key={idx}
                          className="bg-white/5 text-gray-400 text-[10px] px-2 py-0.5 rounded border border-white/5 font-mono"
                        >
                          {player.phone}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-4 shrink-0 border-t md:border-t-0 md:border-l border-white/5 pt-4 md:pt-0 md:pl-6">
                  <div className="flex flex-col md:items-end text-left md:text-right font-mono">
                    <span className="text-[10px] text-gray-500">Paid Amount</span>
                    <span className="text-xl font-extrabold text-white">₹{Number(booking.price)}</span>
                  </div>

                  <div className="flex space-x-2">
                    {/* HELD: Pay Now */}
                    {booking.status === 'HELD' && (
                      <Link
                        to={`/bookings/${booking.id}/pay`}
                        className="py-2 px-4 bg-[var(--brand-primary)] hover:opacity-95 text-white text-xs font-semibold rounded-xl transition-all shadow-lg"
                        id={`pay-now-btn-${booking.id}`}
                      >
                        Pay Now
                      </Link>
                    )}

                    {/* CONFIRMED & check-in is open: I'm Here */}
                    {isCheckInOpen(booking) && (
                      <button
                        onClick={() => handleCheckIn(booking.id)}
                        className="py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-all shadow-lg shadow-emerald-900/20"
                        id={`check-in-btn-${booking.id}`}
                      >
                        I'm Here
                      </button>
                    )}

                    {/* CONFIRMED/HELD: Cancel booking */}
                    {(booking.status === 'CONFIRMED' || booking.status === 'HELD') && (
                      <button
                        onClick={() => setSelectedCancelId(booking.id)}
                        className="py-2 px-4 bg-white/5 hover:bg-red-950/30 text-gray-300 hover:text-red-400 border border-white/10 hover:border-red-900/30 text-xs font-semibold rounded-xl transition-all"
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
