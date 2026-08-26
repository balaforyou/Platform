import { useEffect, useRef, useState } from 'react';
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

  // F-187: Fast Grid period grouping (Morning/Afternoon/Evening), matching the wireframe's
  // periodsDef() bucketing. Half-open ranges so every slot lands in exactly one bucket, with
  // no gap for very early/late hours.
  const [activePeriod, setActivePeriod] = useState<'morning' | 'afternoon' | 'evening'>('morning');

  // F-187: duration stepper. Counts ADDITIONAL contiguous hours beyond the selected slot's own
  // hour (0 = just the selected slot, matching today's behavior). Reset to 0 whenever a new
  // base slot is selected.
  const [additionalWindowsCount, setAdditionalWindowsCount] = useState(0);

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
  const summaryRef = useRef<HTMLDivElement>(null);

  // F-187: Morning/Afternoon/Evening buckets. `test` ranges are half-open and together cover
  // every hour of the day (morning also catches the small-hours case, evening catches anything
  // at or after 17:00) so no slot is ever silently dropped from every tab.
  const periodsDef: { key: 'morning' | 'afternoon' | 'evening'; label: string; test: (hour: number) => boolean }[] = [
    { key: 'morning', label: 'Morning', test: (h) => h < 12 },
    { key: 'afternoon', label: 'Afternoon', test: (h) => h >= 12 && h < 17 },
    { key: 'evening', label: 'Evening', test: (h) => h >= 17 },
  ];

  const sortedSlots = [...slots].sort(
    (a, b) => new Date(a.window.startTime).getTime() - new Date(b.window.startTime).getTime(),
  );
  const groupedSlots = periodsDef.map((p) => ({
    ...p,
    slots: sortedSlots.filter((s) => p.test(new Date(s.window.startTime).getHours())),
  }));
  const visibleSlots = groupedSlots.find((g) => g.key === activePeriod)?.slots ?? [];

  // F-187: how many additional contiguous hours are actually available after `slot`, capped by
  // the pool's real maxAdditionalWindows — never re-implements the server's own contiguity/
  // resource-match validation, just bounds the stepper so it doesn't offer a count the server
  // would reject purely for lack of a next window to send.
  const maxAdditionalAvailable = (slot: any): number => {
    if (!slot) return 0;
    const startIndex = sortedSlots.findIndex((s) => s.window.id === slot.window.id);
    if (startIndex === -1) return 0;
    let count = 0;
    for (let i = startIndex + 1; i < sortedSlots.length; i++) {
      const prevEnd = new Date(sortedSlots[i - 1].window.endTime).getTime();
      const thisStart = new Date(sortedSlots[i].window.startTime).getTime();
      if (thisStart !== prevEnd) break;
      count++;
    }
    const ruleMax = pool?.bookingRules?.[0]?.maxAdditionalWindows ?? 1;
    return Math.min(count, ruleMax);
  };

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
        setAdditionalWindowsCount(0);
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

  // F-187: land on whichever period actually has slots rather than always defaulting to a
  // possibly-empty Morning tab. Only runs when the CURRENT tab is empty, so a guest who has
  // already switched tabs manually is never yanked back.
  useEffect(() => {
    const current = groupedSlots.find((g) => g.key === activePeriod);
    if (current && current.slots.length === 0) {
      const firstNonEmpty = groupedSlots.find((g) => g.slots.length > 0);
      if (firstNonEmpty) setActivePeriod(firstNonEmpty.key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  // F-153: make the consequence of a slot tap reachable on a phone.
  //
  // The selected-slot styling F-146 added is real and applies immediately — but below the `lg`
  // breakpoint this page collapses to a single column, so the rate summary and the pay button
  // render after the entire slot list. Measured on the deployed JBC screen at 375x812 against a
  // real 15-slot day: tapping a mid-list slot left `scrollY` unchanged at 722 and placed the pay
  // button 676px below the fold, so nothing about the tap was observable without scrolling.
  //
  // This runs as an effect, not inside the click handler, because the summary MOUNTS on selection
  // — `summaryRef` is still null while the handler runs. One scroll, after one render, so there is
  // no double-scroll when selection re-renders the column.
  useEffect(() => {
    const el = summaryRef.current;
    if (!selectedSlot || !el) return;

    // `block: 'nearest'` is chosen for its native semantics: it is a no-op when the element is
    // already fully visible. That covers both no-regression cases with one rule, without
    // duplicating the `lg` breakpoint in JS where it could drift from the Tailwind class — no jump
    // on desktop, where the summary already sits in the right-hand column, and no jump when the
    // tapped slot is above the fold. When the summary is below the viewport, `nearest` aligns its
    // bottom edge with the viewport bottom, which is exactly what brings the pay button on screen.
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
  }, [selectedSlot?.window?.id]);

  // Shared by the slot cards and the rate summary so both render a slot's time the same way.
  const formatTimeRange = (win: any) =>
    `${new Date(win.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ` +
    `${new Date(win.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  // F-187: the selected base slot plus `additionalWindowsCount` contiguous hours after it,
  // sourced from the same sorted list `maxAdditionalAvailable` walks — so the chain the guest
  // sees priced here is exactly the chain `handleReserve` submits as additionalWindowIds.
  const getSelectedChain = (): any[] => {
    if (!selectedSlot) return [];
    const startIndex = sortedSlots.findIndex((s) => s.window.id === selectedSlot.window.id);
    if (startIndex === -1) return [selectedSlot];
    return sortedSlots.slice(startIndex, startIndex + 1 + additionalWindowsCount);
  };

  // Real-time price helper.
  // Group size is the booker alone while co-player collection is removed (see the note above).
  // PER_PERSON is retained rather than short-circuited: the server still prices authoritatively,
  // and this stays correct on its own terms if participants are reinstated (F-183: this estimate
  // is always advisory, the server sums authoritatively per window regardless).
  const calculatePrice = () => {
    if (!pool || !selectedSlot) return 0;
    const size = 1;

    return getSelectedChain().reduce((sum, slot) => {
      const { window } = slot;
      const mode = window.pricingMode || pool.pricingMode || 'FLAT';
      const rate = window.price != null ? Number(window.price) : Number(pool.defaultRate);
      return sum + (mode === 'PER_PERSON' ? rate * size : rate);
    }, 0);
  };

  // F-187: renders BookingRule.cancellationPolicyJson's real tiers instead of hardcoded copy.
  // Shape: { type: 'tiered', tiers: [{ min_hours_before_slot, refund_percent }] }.
  const formatCancellationPolicy = (policy: any): string[] => {
    if (!policy || policy.type !== 'tiered' || !Array.isArray(policy.tiers)) return [];
    return [...policy.tiers]
      .sort((a, b) => b.min_hours_before_slot - a.min_hours_before_slot)
      .map((tier) =>
        tier.min_hours_before_slot > 0
          ? `${tier.refund_percent}% refund if cancelled ${tier.min_hours_before_slot}h+ before the slot`
          : `${tier.refund_percent}% refund after that`,
      );
  };

  const handleReserve = async () => {
    if (!tenant || !branchId || !poolId || !selectedSlot || !user) return;

    try {
      setSubmitting(true);
      setBookingError(null);
      
      const idempotencyKey = crypto.randomUUID();

      // F-187: everything after the base slot in the current chain, sent as additionalWindowIds
      // (F-183, previously accepted server-side but never populated from this screen). Server
      // re-validates count/contiguity/resource-match independently (INVALID_WINDOW_COUNT,
      // NON_CONTIGUOUS_WINDOWS, RESOURCE_MISMATCH) — this is a convenience for the happy path,
      // not the source of truth for whether the request is valid.
      const additionalWindowIds = getSelectedChain()
        .slice(1)
        .map((slot) => slot.window.id);

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
          ...(additionalWindowIds.length > 0 ? { additionalWindowIds } : {}),
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
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-ink gap-1">
        <div className="p-4 rounded-full bg-surface-mint mb-2">
          <Activity className="h-8 w-8 animate-spin text-[var(--brand-primary)]" />
        </div>
        <p className="text-ink font-outfit font-bold text-sm">Setting up your booking</p>
        <p className="text-ink-muted text-xs">Loading real-time availability…</p>
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

            {/* F-187: Fast Grid period tabs — 44px tall (slide 4a correction over the wireframe's
                drawn 33-38px), so the tap target stays comfortable on a phone. */}
            {!slotsLoading && slots.length > 0 && (
              <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Time of day">
                {groupedSlots.map((g) => (
                  <button
                    key={g.key}
                    type="button"
                    role="tab"
                    aria-selected={activePeriod === g.key}
                    onClick={() => setActivePeriod(g.key)}
                    disabled={g.slots.length === 0}
                    className="h-11 rounded-xl text-xs font-bold font-outfit transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: activePeriod === g.key ? 'var(--brand-primary)' : 'var(--surface-white)',
                      color: activePeriod === g.key ? '#ffffff' : 'var(--text-primary)',
                      border: `1px solid ${activePeriod === g.key ? 'var(--brand-primary)' : 'var(--border-card)'}`,
                    }}
                  >
                    {g.label} <span className="opacity-70 font-mono">({g.slots.length})</span>
                  </button>
                ))}
              </div>
            )}

            {slotsLoading ? (
              <div className="py-12 flex justify-center">
                <Activity className="h-8 w-8 animate-spin text-[var(--brand-primary)]" />
              </div>
            ) : slots.length === 0 ? (
              <p className="text-xs text-ink-muted py-8 text-center bg-surface rounded-xl border border-edge">
                No slots available on this date. Try another date.
              </p>
            ) : visibleSlots.length === 0 ? (
              <p className="text-xs text-ink-muted py-8 text-center bg-surface rounded-xl border border-edge">
                No {activePeriod} slots on this date. Try another period or date.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {visibleSlots.map((slot) => {
                  const isSelected = selectedSlot?.window?.id === slot.window.id;
                  const timeRange = formatTimeRange(slot.window);
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
                        setAdditionalWindowsCount(0);
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
                        <span className="text-ink font-mono" style={{ font: 'var(--font-slot-time)' }}>{timeRange}</span>
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
            <div ref={summaryRef} id="rate-summary-panel" className="bg-surface-mint border border-edge p-6 rounded-2xl space-y-6">
              <h3 className="text-sm font-bold font-outfit text-ink-muted uppercase tracking-wider flex items-center space-x-2">
                <Users className="h-4 w-4 text-[var(--brand-primary)]" />
                <span>3. Rate Summary</span>
              </h3>

              {/* MVP: the participant-collection list was removed here — see the note at the top of
                  this component. The API still accepts coPlayers; only this UI step is gone. */}

              {/* Price Calculation details */}
              <div className="space-y-3">
                {/* F-153: echo which slot was picked. On a long list the tapped card necessarily
                    leaves the viewport when this panel scrolls into view — a 375px screen cannot
                    hold both — so the confirmation of WHAT was selected has to exist here too, not
                    only as the highlight in the list. Deliberately additive: F-146's selected-slot
                    styling is untouched. */}
                <div className="flex justify-between text-xs text-ink-muted font-medium">
                  <span>Selected Slot:</span>
                  <span className="text-ink font-mono font-bold" id="selected-slot-echo">
                    {(() => {
                      const chain = getSelectedChain();
                      const last = chain[chain.length - 1] ?? selectedSlot;
                      return `${formatTimeRange(selectedSlot.window).split(' - ')[0]} - ${formatTimeRange(last.window).split(' - ')[1]}`;
                    })()}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-ink-muted font-medium">
                  <span>Pricing Mode:</span>
                  <span className="text-ink">
                    {(selectedSlot.window.pricingMode || pool.pricingMode || 'FLAT') === 'PER_PERSON'
                      ? 'Per-person rate multiplication'
                      : 'Flat booking rate'}
                  </span>
                </div>

                {/* F-187: duration stepper. Whole-hour increments only (not the wireframe's drawn
                    30-min steps — the pool's own minBookingDurationMinutes/AvailabilityWindow grain
                    is hourly here), capped by maxAdditionalWindows AND by how many contiguous hours
                    actually exist after the selected slot. */}
                <div className="flex justify-between items-center text-xs text-ink-muted font-medium pt-1">
                  <span>Duration:</span>
                  <div className="flex items-center space-x-3">
                    <button
                      type="button"
                      onClick={() => setAdditionalWindowsCount((c) => Math.max(0, c - 1))}
                      disabled={additionalWindowsCount === 0}
                      className="h-7 w-7 rounded-lg border border-edge-strong bg-surface text-ink font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                      id="duration-decrement-btn"
                      aria-label="Decrease duration"
                    >
                      −
                    </button>
                    <span className="text-ink font-mono font-bold w-16 text-center" id="duration-display">
                      {additionalWindowsCount + 1} hr{additionalWindowsCount + 1 > 1 ? 's' : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAdditionalWindowsCount((c) => Math.min(maxAdditionalAvailable(selectedSlot), c + 1))}
                      disabled={additionalWindowsCount >= maxAdditionalAvailable(selectedSlot)}
                      className="h-7 w-7 rounded-lg border border-edge-strong bg-surface text-ink font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                      id="duration-increment-btn"
                      aria-label="Increase duration"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-end pt-2 border-t border-edge">
                  <span className="text-sm font-bold text-ink font-outfit">Total Estimate:</span>
                  <span className="text-2xl font-extrabold text-[var(--brand-primary)] font-mono" id="computed-price-display">
                    ₹{calculatePrice()}
                  </span>
                </div>
              </div>

              {/* F-187: daily-cap / cancellation-policy copy, read directly off the pool's own
                  BookingRule — no new fetch, this is the same `pool` state already loaded above. */}
              {(pool.bookingRules?.[0]?.maxDailyBookingsPerGuest != null || pool.bookingRules?.[0]?.cancellationPolicyJson) && (
                <div className="text-[11px] text-ink-muted bg-surface border border-edge rounded-xl p-3 space-y-1">
                  <p>
                    Up to <span className="font-bold text-ink">{pool.bookingRules?.[0]?.maxDailyBookingsPerGuest ?? 3}</span> booking(s) per day per guest.
                  </p>
                  {formatCancellationPolicy(pool.bookingRules?.[0]?.cancellationPolicyJson).map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              )}

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
