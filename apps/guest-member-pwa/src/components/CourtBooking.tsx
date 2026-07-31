import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiRequest } from '@badminton/ui-shared';
import { useAuth, useTenant } from '@badminton/ui-shared';
import { ArrowLeft, Plus, Trash2, Calendar, Users, Activity, HelpCircle, ShieldAlert } from 'lucide-react';

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

  const [coPlayers, setCoPlayers] = useState<string[]>([]);
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
          throw new Error('Court category not found at this branch.');
        }
        setPool(matched);
      } catch (err: any) {
        setError(err.message || 'Failed to load court category details.');
      } finally {
        setLoading(false);
      }
    };

    fetchPool();
  }, [branchId, poolId, accessToken]);

  // 2. Fetch availability slots when date or pool changes
  useEffect(() => {
    if (!poolId || !bookingDate) return;

    const fetchSlots = async () => {
      try {
        setSlotsLoading(true);
        setSelectedSlot(null);
        setBookingError(null);
        // GET /resource-pools/:id/availability?date=YYYY-MM-DD
        const res = await apiRequest<any[]>(`/slot-engine/resource-pools/${poolId}/availability?date=${bookingDate}`, {
          token: accessToken,
        });
        setSlots(res || []);
      } catch (err: any) {
        setBookingError(err.message || 'Failed to fetch court availability.');
      } finally {
        setSlotsLoading(false);
      }
    };

    fetchSlots();
  }, [poolId, bookingDate, accessToken]);

  const handleAddPlayer = () => {
    if (pool && (1 + coPlayers.length >= pool.capacity)) {
      setBookingError(`Maximum players capacity of ${pool.capacity} reached.`);
      return;
    }
    setCoPlayers([...coPlayers, '']);
    setBookingError(null);
  };

  const handleRemovePlayer = (idx: number) => {
    const next = [...coPlayers];
    next.splice(idx, 1);
    setCoPlayers(next);
    setBookingError(null);
  };

  const normalizePhone = (phone: string): string => {
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');
    if (cleaned.startsWith('+')) {
      return '+' + cleaned.replace(/\D/g, '');
    }
    let digits = cleaned.replace(/\D/g, '');
    if (digits.startsWith('0')) {
      digits = digits.slice(1);
    }
    if (digits.length === 10) {
      return '+91' + digits;
    }
    return '+' + digits;
  };

  const isValidIndianPhone = (phone: string): boolean => {
    const normalized = normalizePhone(phone);
    return /^\+91[6-9]\d{9}$/.test(normalized);
  };

  const handlePlayerPhoneChange = (idx: number, val: string) => {
    const next = [...coPlayers];
    next[idx] = val.replace(/[^\d\+\-\(\)\s]/g, '');
    setCoPlayers(next);
  };

  // Real-time price helper
  const calculatePrice = () => {
    if (!pool || !selectedSlot) return 0;
    const { window } = selectedSlot;
    const mode = window.pricingMode || pool.pricingMode || 'FLAT';
    const rate = window.price != null ? Number(window.price) : Number(pool.defaultRate);
    const size = 1 + coPlayers.length;

    if (mode === 'PER_PERSON') {
      return rate * size;
    }
    return rate;
  };

  const handleReserve = async () => {
    if (!tenant || !branchId || !poolId || !selectedSlot || !user) return;
    
    // Real validation of player phone numbers matching Indian mobile format
    const cleanPlayers = coPlayers.filter(p => p.trim() !== '');
    for (const phone of cleanPlayers) {
      if (!isValidIndianPhone(phone)) {
        setBookingError(`"${phone}" is not a valid Indian mobile number. Must be a 10-digit number starting with 6-9.`);
        return;
      }
    }
    const normalizedPlayers = cleanPlayers.map(normalizePhone);

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
          coPlayers: normalizedPlayers,
        }),
      });

      // Redirect to checkout
      navigate(`/bookings/${booking.id}/pay`);
    } catch (err: any) {
      setBookingError(err.message || 'Failed to reserve court slot. Please try another slot.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-white">
        <Activity className="h-10 w-10 animate-spin text-[var(--brand-primary)] mb-4" />
        <p className="text-gray-400 text-sm font-medium">Loading booking workspace...</p>
      </div>
    );
  }

  if (error || !pool) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-white p-4">
        <HelpCircle className="h-12 w-12 text-red-500 mb-4" />
        <h3 className="text-lg font-bold">Failed to load booking details</h3>
        <p className="text-gray-400 text-sm mt-1 text-center max-w-md">{error}</p>
        <Link to={`/branches/${branchId}`} className="mt-4 text-xs text-[var(--brand-primary)] hover:underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-10 space-y-8 text-white">
      {/* Back Button */}
      <Link
        to={`/branches/${branchId}`}
        className="inline-flex items-center space-x-2 text-xs text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to Branch Dashboard</span>
      </Link>

      <div className="space-y-1">
        <h2 className="text-3xl font-extrabold tracking-tight font-outfit">
          Book <span className="text-[var(--brand-primary)]">{pool.name}</span>
        </h2>
        <p className="text-gray-400 text-xs">
          Select date, choose an available slot, and enter co-players to compute the total rate.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column: Date & Slots */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white/5 border border-white/5 p-6 rounded-2xl space-y-4">
            <h3 className="text-sm font-bold font-outfit text-gray-300 uppercase tracking-wider flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-[var(--brand-primary)]" />
              <span>1. Choose Game Date</span>
            </h3>
            
            <input
              type="date"
              value={bookingDate}
              onChange={(e) => setBookingDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[var(--brand-primary)] font-mono"
            />
          </div>

          <div className="bg-white/5 border border-white/5 p-6 rounded-2xl space-y-4">
            <h3 className="text-sm font-bold font-outfit text-gray-300 uppercase tracking-wider">
              2. Available Time Slots
            </h3>

            {slotsLoading ? (
              <div className="py-12 flex justify-center">
                <Activity className="h-8 w-8 animate-spin text-[var(--brand-primary)]" />
              </div>
            ) : slots.length === 0 ? (
              <p className="text-xs text-gray-400 py-8 text-center bg-gray-900/50 rounded-xl border border-white/5">
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

                  return (
                    <div
                      key={slot.window.id}
                      onClick={() => {
                        setSelectedSlot(slot);
                        setBookingError(null);
                      }}
                      className={`cursor-pointer p-4 rounded-xl border transition-all flex flex-col justify-between space-y-2 ${
                        isSelected
                          ? 'bg-[var(--brand-primary)]/10 border-[var(--brand-primary)]'
                          : 'bg-gray-900/50 border-white/5 hover:border-white/15'
                      }`}
                      id={`slot-card-${slot.window.id}`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-sm text-white font-mono">{st} - {et}</span>
                        <span className="text-[10px] bg-white/5 text-gray-400 px-2 py-0.5 rounded-full font-mono font-bold">
                          {pricingMode === 'PER_PERSON' ? 'Per-Person' : 'Flat-Rate'}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center text-xs pt-1 border-t border-white/5 text-gray-400 font-mono">
                        <span>Left: {slot.remainingCapacity} seats</span>
                        <span className="font-bold text-white">₹{rate}</span>
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
            <div className="bg-white/5 border border-white/5 p-6 rounded-2xl space-y-6">
              <h3 className="text-sm font-bold font-outfit text-gray-300 uppercase tracking-wider flex items-center space-x-2">
                <Users className="h-4 w-4 text-[var(--brand-primary)]" />
                <span>3. Co-Players & Rates</span>
              </h3>

              {/* Co-players list */}
              <div className="space-y-3">
                <label className="text-xs text-gray-400 font-medium">Add co-player mobile numbers:</label>
                {coPlayers.map((phone, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => handlePlayerPhoneChange(idx, e.target.value)}
                      placeholder="e.g. 9876543210"
                      className="flex-1 bg-gray-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-[var(--brand-primary)]"
                    />
                    <button
                      onClick={() => handleRemovePlayer(idx)}
                      className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}

                {1 + coPlayers.length < pool.capacity && (
                  <button
                    onClick={handleAddPlayer}
                    className="w-full py-2 border border-dashed border-white/10 hover:border-white/20 rounded-xl text-xs text-gray-400 hover:text-white flex items-center justify-center space-x-1.5 transition-all font-semibold"
                    id="add-co-player-btn"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Co-Player</span>
                  </button>
                )}
              </div>

              {/* Price Calculation details */}
              <div className="pt-4 border-t border-white/5 space-y-3">
                <div className="flex justify-between text-xs text-gray-400 font-medium">
                  <span>Pricing Mode:</span>
                  <span className="text-gray-200">
                    {(selectedSlot.window.pricingMode || pool.pricingMode || 'FLAT') === 'PER_PERSON' 
                      ? 'Per-person rate multiplication' 
                      : 'Flat court booking rate'}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-400 font-medium">
                  <span>Group Size:</span>
                  <span className="text-gray-200">{1 + coPlayers.length} Players</span>
                </div>
                <div className="flex justify-between items-end pt-2 border-t border-white/5">
                  <span className="text-sm font-bold text-white font-outfit">Total Estimate:</span>
                  <span className="text-2xl font-extrabold text-[var(--brand-primary)] font-mono" id="computed-price-display">
                    ₹{calculatePrice()}
                  </span>
                </div>
              </div>

              {bookingError && (
                <div className="bg-red-950/20 border border-red-900/50 p-3 rounded-xl flex items-start space-x-2 text-xs text-red-400">
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
            <div className="bg-white/5 border border-white/5 p-6 rounded-2xl text-center text-gray-400 py-16 text-xs font-semibold">
              Select a court availability slot to display player setup and pricing details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
