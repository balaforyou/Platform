import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiRequest } from '@badminton/ui-shared';
import { useAuth, useTenant } from '@badminton/ui-shared';
import { ArrowLeft, Calendar, Users, Activity, HelpCircle, ShieldAlert } from 'lucide-react';

export default function CourtBooking() {
  const { branchId, poolId } = useParams();
  const { tenant } = useTenant();
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();

  const [pool, setPool] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);
  
  // Date picker state - default to local date YYYY-MM-DD
  const [bookingDate, setBookingDate] = useState(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  // MVP: co-player collection removed from this screen.
  //
  // WHY: this follows F-114 — with JBC on a flat rate and minimum-occupancy enforcement disabled,
  // nobody is counting heads for pricing or capacity, so collecting co-player phone numbers at
  // booking time buys nothing for the launch.
  //
  // DELIBERATELY UI-ONLY, NOT A DELETION OF THE CAPABILITY. `POST /bookings` still accepts
  // `coPlayers` and still writes `BookingPlayer` rows; nothing server-side changed. This screen
  // simply sends an empty list. To restore, reinstate the participant list and phone validation
  // here and pass the collected numbers through — the API contract is unchanged and waiting.
  // See also F-110's "Regular Playmates" roster, a larger successor feature.
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // 1. Fetch resource pool on mount
  useEffect(() => {
    if (!branchId || !poolId) return;

    const fetchPool = async () => {
      try {
        setLoading(true);
        // Find pool by calling branch pools endpoint
        const res = await apiRequest<any[]>(`/slot-engine/branches/${branchId}/resource-pools`, {
          token: accessToken,
        });
        const matched = res?.find(p => p.id === poolId);
        if (!matched) {
          throw new Error('Resource category not found at this branch.');
        }
        setPool(matched);
      } catch (err: any) {
        setError(err.message || 'Failed to load resource category details.');
      } finally {
        setLoading(false);
      }
    };

    fetchPool();
  }, [branchId, poolId, accessToken]);

  // 2. Fetch availability slots when date or pool changes
  useEffect(() => {
    if (!poolId || !bookingDate) return;
    let isCurrentRequest = true;

    const fetchSlots = async () => {
      try {
        setSlotsLoading(true);
        setSlots([]);
        setSelectedSlot(null);
        setBookingError(null);
        // GET /resource-pools/:id/availability?date=YYYY-MM-DD
        const res = await apiRequest<any[]>(`/slot-engine/resource-pools/${poolId}/availability?date=${bookingDate}`, {
          token: accessToken,
        });
        if (!isCurrentRequest) return;
        setSlots(Array.isArray(res) ? res : (res as any)?.data || []);
      } catch (err: any) {
        if (!isCurrentRequest) return;
        setBookingError(err.message || 'Failed to fetch availability.');
      } finally {
        if (isCurrentRequest) setSlotsLoading(false);
      }
    };

    fetchSlots();
    return () => {
      isCurrentRequest = false;
    };
  }, [poolId, bookingDate, accessToken]);

  // Real-time price helper.
  // Group size is the booker alone while co-player collection is removed (see the note above).
  // PER_PERSON is retained rather than short-circuited: the server still prices authoritatively,
  // and this stays correct on its own terms if participants are reinstated.
  const calculatePrice = () => {
    if (!pool || !selectedSlot) return 0;
    const { window } = selectedSlot;
    const mode = window.pricingMode || pool.pricingMode || 'FLAT';
    const rate = window.price != null ? Number(window.price) : Number(pool.defaultRate);
    const size = 1;

    if (mode === 'PER_PERSON') {
      return rate * size;
    }
    return rate;
  };

  const handleReserve = async () => {
    if (!tenant || !branchId || !poolId || !selectedSlot || !user) return;

    try {
      setSubmitting(true);
      setBookingError(null);
      
      const idempotencyKey = crypto.randomUUID();

      // POST /bookings
      const booking = await apiRequest<any>('/slot-engine/bookings', {
        method: 'POST',
        token: accessToken,
        headers: {
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          tenantId: tenant.id,
          branchId,
          resourcePoolId: poolId,
          resourceId: selectedSlot.window.resourceId || null,
          windowId: selectedSlot.window.id,
          userId: user.userId || user.id,
          // Sent explicitly as empty rather than omitted: the field remains part of the contract
          // and the server still supports it, so restoring the UI needs no API change.
          coPlayers: [],
        }),
      });

      // Redirect to checkout
      navigate(`/bookings/${booking.id}/pay`);
    } catch (err: any) {
      setBookingError(err.message || 'Failed to reserve slot. Please try another slot.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-ink">
        <Activity className="h-10 w-10 animate-spin text-[var(--brand-primary)] mb-4" />
        <p className="text-ink-muted text-sm font-medium">Loading booking workspace...</p>
      </div>
    );
  }

  if (error || !pool) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-ink p-4">
        <HelpCircle className="h-12 w-12 text-red-600 mb-4" />
        <h3 className="text-lg font-bold">Failed to load booking details</h3>
        <p className="text-ink-muted text-sm mt-1 text-center max-w-md">{error}</p>
        <Link to={`/branches/${branchId}`} className="mt-4 text-xs text-[var(--brand-primary)] hover:underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-10 space-y-8 text-ink">
      {/* Back Button */}
      <Link
        to={`/branches/${branchId}`}
        className="inline-flex items-center space-x-2 text-xs text-ink-muted hover:text-ink transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to Branch Dashboard</span>
      </Link>

      <div className="space-y-1">
        <h2 className="text-3xl font-extrabold tracking-tight font-outfit">
          Book <span className="text-[var(--brand-primary)]">{pool.name}</span>
        </h2>
        <p className="text-ink-muted text-xs">
          Select date, choose an available slot, and enter participants to compute the total rate.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column: Date & Slots */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-surface-mint border border-edge p-6 rounded-2xl space-y-4">
            <h3 className="text-sm font-bold font-outfit text-ink-muted uppercase tracking-wider flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-[var(--brand-primary)]" />
              <span>1. Choose Date</span>
            </h3>
            
            <input
              type="date"
              value={bookingDate}
              onChange={(e) => setBookingDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full bg-surface border border-edge-strong rounded-xl px-4 py-3 text-sm text-ink focus:outline-none focus:border-[var(--brand-primary)] font-mono"
            />
          </div>

          <div className="bg-surface-mint border border-edge p-6 rounded-2xl space-y-4">
            <h3 className="text-sm font-bold font-outfit text-ink-muted uppercase tracking-wider">
              2. Available Time Slots
            </h3>

            {slotsLoading ? (
              <div className="py-12 flex justify-center">
                <Activity className="h-8 w-8 animate-spin text-[var(--brand-primary)]" />
              </div>
            ) : slots.length === 0 ? (
              <p className="text-xs text-ink-muted py-8 text-center bg-surface rounded-xl border border-edge">
                No slots available on this date. Try another date.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {slots.map((slot) => {
                  const isSelected = selectedSlot?.window?.id === slot.window.id;
                  const st = new Date(slot.window.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const et = new Date(slot.window.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const pricingMode = slot.window.pricingMode || pool.pricingMode || 'FLAT';
                  const rate = slot.window.price != null ? slot.window.price : pool.defaultRate;

                  // Slot state, derived from the REAL capacity the server returned — never assigned
                  // per-slot by hand. `remainingCapacity` is computed server-side as
                  // `window.capacity - activeBookings.length` (slot-engine/src/index.ts:1989), so a
                  // slot filling up drives this on its own.
                  //
                  // Only three of the five designed states are reachable here, and deliberately so:
                  // FULL never arrives (the endpoint drops slots at zero remaining, F-147) and MEMBER
                  // is not distinguishable (isMemberBooking is absent from the response, F-148).
                  // Member bookings still consume capacity, so they push a slot toward ALMOST_FULL —
                  // the effect is real even though the cause is not visible.
                  const totalCapacity = Number(slot.window.capacity) || 0;
                  const remaining = Number(slot.remainingCapacity) || 0;
                  const isAlmostFull = totalCapacity > 0 && remaining > 0 && remaining / totalCapacity <= 0.25;
                  const slotState = isSelected ? 'selected' : isAlmostFull ? 'almost-full' : 'available';

                  return (
                    <div
                      key={slot.window.id}
                      onClick={() => {
                        setSelectedSlot(slot);
                        setBookingError(null);
                      }}
                      className="cursor-pointer p-4 border transition-all flex flex-col justify-between space-y-2"
                      style={{
                        borderRadius: 'var(--radius-card)',
                        background: isSelected
                          ? 'var(--slot-selected-surface)'
                          : isAlmostFull ? 'var(--slot-almostfull-surface)' : 'var(--slot-available-surface)',
                        borderColor: isSelected
                          ? 'var(--slot-selected-border)'
                          : isAlmostFull ? 'var(--slot-almostfull-border)' : 'var(--slot-available-border)',
                      }}
                      data-slot-state={slotState}
                      id={`slot-card-${slot.window.id}`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-ink font-mono" style={{ font: 'var(--font-slot-time)' }}>{st} - {et}</span>
                        <span className="text-[10px] bg-surface-mint text-ink-muted px-2 py-0.5 rounded-full font-mono font-bold">
                          {pricingMode === 'PER_PERSON' ? 'Per-Person' : 'Flat-Rate'}
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-xs pt-1 border-t border-edge font-mono">
                        <span style={{ color: isAlmostFull ? 'var(--slot-almostfull-text)' : 'var(--slot-available-accent)' }}>
                          {isAlmostFull ? `Almost full — ${slot.remainingCapacity} left` : `Left: ${slot.remainingCapacity} seats`}
                        </span>
                        <span className="font-bold text-ink">₹{rate}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Players & Price Summary */}
        <div className="space-y-6">
          {selectedSlot ? (
            <div className="bg-surface-mint border border-edge p-6 rounded-2xl space-y-6">
              <h3 className="text-sm font-bold font-outfit text-ink-muted uppercase tracking-wider flex items-center space-x-2">
                <Users className="h-4 w-4 text-[var(--brand-primary)]" />
                <span>3. Rate Summary</span>
              </h3>

              {/* MVP: the participant-collection list was removed here — see the note at the top of
                  this component. The API still accepts coPlayers; only this UI step is gone. */}

              {/* Price Calculation details */}
              <div className="space-y-3">
                <div className="flex justify-between text-xs text-ink-muted font-medium">
                  <span>Pricing Mode:</span>
                  <span className="text-ink">
                    {(selectedSlot.window.pricingMode || pool.pricingMode || 'FLAT') === 'PER_PERSON'
                      ? 'Per-person rate multiplication'
                      : 'Flat booking rate'}
                  </span>
                </div>
                <div className="flex justify-between items-end pt-2 border-t border-edge">
                  <span className="text-sm font-bold text-ink font-outfit">Total Estimate:</span>
                  <span className="text-2xl font-extrabold text-[var(--brand-primary)] font-mono" id="computed-price-display">
                    ₹{calculatePrice()}
                  </span>
                </div>
              </div>

              {bookingError && (
                <div className="bg-red-50 border border-red-200 p-3 rounded-xl flex items-start space-x-2 text-xs text-red-700">
                  <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{bookingError}</span>
                </div>
              )}

              {/* Reserve action */}
              <button
                onClick={handleReserve}
                disabled={submitting}
                className="w-full py-3 rounded-2xl bg-[var(--brand-primary)] hover:opacity-95 text-white font-semibold flex items-center justify-center space-x-2 transition-all shadow-lg shadow-[var(--brand-primary)]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                id="reserve-court-btn"
              >
                {submitting ? (
                  <>
                    <Activity className="h-4 w-4 animate-spin" />
                    <span>Processing Hold...</span>
                  </>
                ) : (
                  <span>Hold & Proceed to Pay</span>
                )}
              </button>
            </div>
          ) : (
            <div className="bg-surface-mint border border-edge p-6 rounded-2xl text-center text-ink-muted py-16 text-xs font-semibold">
              Select an availability slot to display participant setup and pricing details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
