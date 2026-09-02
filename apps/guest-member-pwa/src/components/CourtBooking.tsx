import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiRequest } from '@badminton/ui-shared';
import { useAuth, useTenant } from '@badminton/ui-shared';
import { Calendar, Activity, MapPin, ShieldAlert } from 'lucide-react';

// F-190 Slice 2b: one shared class for the single #reserve-court-btn element -- flex-1 so it sits
// next to the TOTAL readout in the mobile fixed bar, sm:w-full so it fills the width once the bar
// becomes normal-flow content (sm:block cancels the flex context, making flex-1 inert there).
// F-192 Slice D: accent-400 fill / neutral-900 text (was accent-700 / accent-100). On the dark
// sticky bar the old pairing measured ~2.25:1 -- below WCAG AA's 3:1 floor for UI components;
// accent-400 on neutral-900 clears it at ~6.8:1. Matches JBC Migration.dc.html frame 08.
const primaryReserveBtn =
  'flex-1 sm:w-full min-h-[54px] py-3 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ' +
  'bg-[var(--color-accent-400)] text-[var(--color-neutral-900)] hover:bg-[var(--color-accent-300)] active:bg-[var(--color-accent-500)]';

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

  // F-212: when the guest's picked date is fully exhausted, GET .../next-available-date points
  // them at the next bookable date and we auto-navigate there (mirrors F-187's period-level
  // auto-advance, one level up). `autoAdvanceNotice` drives the inline "showing {new date}"
  // banner; the refs stop the search re-triggering off its own navigation.
  const [autoAdvanceNotice, setAutoAdvanceNotice] = useState<{ from: string; to: string } | null>(null);
  const autoAdvancedToRef = useRef<string | null>(null);
  const searchRanForRef = useRef<string | null>(null);
  const prevSlotsLoadingRef = useRef(false);

  // F-190 Slice 2a: header shell data. Both are non-critical pill content -- the page works fine
  // if either fetch fails, so failures are swallowed rather than surfaced as a page-level error.
  const [branchAbout, setBranchAbout] = useState<any>(null);
  const [upcomingBooking, setUpcomingBooking] = useState<any | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!branchId) return;
    apiRequest<any>(`/tenant/branches/${branchId}/about`, { token: accessToken })
      .then(setBranchAbout)
      .catch(() => {});
  }, [branchId, accessToken]);

  // Same filter/sort as main.tsx's loadUpcoming (main.tsx:156-182), plus excluding this screen's
  // own poolId -- a booking being created here shouldn't echo back as "upcoming" mid-flow.
  useEffect(() => {
    if (!accessToken) return;
    apiRequest<any[]>('/slot-engine/bookings/my', { token: accessToken })
      .then((res) => {
        const list = Array.isArray(res) ? res : [];
        const next = list
          .filter((b) => b?.window?.startTime && ['HELD', 'CONFIRMED', 'CHECKED_IN'].includes(b.status))
          .filter((b) => new Date(b.window.startTime).getTime() > Date.now())
          .filter((b) => b.resourcePoolId !== poolId)
          .sort((a, b) => new Date(a.window.startTime).getTime() - new Date(b.window.startTime).getTime());
        setUpcomingBooking(next[0] ?? null);
      })
      .catch(() => {});
  }, [accessToken, poolId]);

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
    // Keys only on `slots` deliberately (see comment above) — not groupedSlots/activePeriod.
  }, [slots]);

  // F-212: after a slots fetch resolves empty, ask the server for the next date that actually
  // has a bookable window and jump there. Keyed on the fetch completing (slotsLoading true->false)
  // so it never fires before the first fetch or mid-fetch. Two guards, both deliberate and
  // matching F-187's "don't yank a guest who chose this themselves" discipline:
  //   - autoAdvancedToRef: if we auto-navigated to a date that is ALSO empty (a real race —
  //     another guest took the last slot between the server check and this fetch), we show the
  //     generic message rather than bouncing forward again.
  //   - searchRanForRef: one search per distinct bookingDate value.
  // On no result or a failed call, nothing changes — the existing "No slots available" message
  // stays as the honest fallback.
  useEffect(() => {
    const justFinished = prevSlotsLoadingRef.current && !slotsLoading;
    prevSlotsLoadingRef.current = slotsLoading;
    if (!justFinished || slots.length > 0) return;
    if (!poolId || !bookingDate) return;
    if (autoAdvancedToRef.current === bookingDate) return;
    if (searchRanForRef.current === bookingDate) return;
    searchRanForRef.current = bookingDate;

    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest<any>(
          `/slot-engine/resource-pools/${poolId}/next-available-date?from=${bookingDate}`,
          { token: accessToken },
        );
        if (cancelled) return;
        const nextDate = (res as any)?.data?.date ?? (res as any)?.date ?? null;
        if (nextDate && nextDate !== bookingDate) {
          autoAdvancedToRef.current = nextDate;
          setAutoAdvanceNotice({ from: bookingDate, to: nextDate });
          setBookingDate(nextDate);
        }
      } catch {
        // leave the generic "No slots available on this date" message as the honest fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slots, slotsLoading, bookingDate, poolId, accessToken]);

  // F-212: any manual date pick clears the auto-advance state so a fresh empty date searches
  // again and the banner doesn't linger on a date the guest chose deliberately.
  const pickDate = (d: string) => {
    autoAdvancedToRef.current = null;
    searchRanForRef.current = null;
    setAutoAdvanceNotice(null);
    setBookingDate(d);
  };

  // F-212: "Fri, Sep 4" — for the auto-advance banner, which names both the exhausted date and
  // the one we moved to.
  const formatDateReadable = (key: string) =>
    new Date(`${key}T00:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

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

  // F-190 Slice 2a: day picker. Chip strip covers min(7, guestOpenWindowDays) days from today --
  // real browse-ahead bound, not an arbitrary 7. The native <input type="date"> stays the source
  // of truth (`bookingDate`); chips just set the same state via a friendlier control.
  const guestOpenWindowDays = pool?.bookingRules?.[0]?.guestOpenWindowDays ?? 7;
  const toDateKey = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  const dayChips = Array.from({ length: Math.min(7, guestOpenWindowDays) }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      key: toDateKey(d),
      dow: d.toLocaleDateString([], { weekday: 'short' }).toUpperCase(),
      day: d.getDate(),
    };
  });
  const maxDateKey = (() => {
    const d = new Date();
    d.setDate(d.getDate() + guestOpenWindowDays);
    return toDateKey(d);
  })();

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
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] gap-[14px]" style={{ background: 'var(--color-bg)' }}>
        <style>{'@keyframes court-booking-spin { to { transform: rotate(360deg); } }'}</style>
        <div
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '999px',
            border: '4px solid var(--color-accent-200)',
            borderTopColor: 'var(--color-accent-700)',
            animation: 'court-booking-spin 1s linear infinite',
          }}
        />
        <div className="flex flex-col gap-1 items-center">
          <div style={{ fontFamily: 'var(--font-body-organic)', fontSize: '14.5px', fontWeight: 700, color: 'var(--color-text)' }}>
            Setting up your booking
          </div>
          <div style={{ fontFamily: 'var(--font-body-organic)', fontSize: '12.5px', color: 'var(--color-neutral-600)' }}>
            Loading real-time availability&hellip;
          </div>
        </div>
      </div>
    );
  }

  if (error || !pool) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] p-4 gap-3 text-center" style={{ background: 'var(--color-bg)' }}>
        <span
          className="flex items-center justify-center"
          style={{ width: '48px', height: '48px', borderRadius: '999px', background: 'var(--color-neutral-200)', color: 'var(--color-neutral-600)' }}
        >
          <MapPin className="h-6 w-6" />
        </span>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: '19px', color: 'var(--color-text)' }}>
          Couldn&rsquo;t load booking details
        </h3>
        <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '12.5px', lineHeight: 1.55, color: 'var(--color-neutral-600)', maxWidth: '260px' }}>
          {error}
        </p>
        <Link
          to={`/branches/${branchId}`}
          className="hover:underline"
          style={{ fontFamily: 'var(--font-body-organic)', fontSize: '12px', fontWeight: 700, color: 'var(--color-accent-700)' }}
        >
          Back to venue
        </Link>
      </div>
    );
  }

  return (
    // NOTE: `text-ink` on this wrapper is the F-190 Slice 2a default. Every text element below
    // sets its own colour, so this inherited base is inert -- kept as-is (not migrated to
    // --color-text) so Slice D leaves the already-migrated header/summary parts byte-identical.
    <div className="flex-1 w-full mx-auto text-ink" style={{ maxWidth: '1024px' }}>
      {/* F-192 Slice E: the F-190 Slice 2a dark header shell is removed -- the shared Layout band
          (F-192 Slice B) already carries the wordmark + "BOOK A COURT" + account control, so a
          second dark block here was redundant (two stacked #2e2b25 zones, wordmark twice). Per
          wireframe frame 08 this becomes a white pool-summary row on the cream ground. */}
      <div className="px-4 sm:px-6 pt-6 space-y-3">
        <div
          className="flex items-center gap-3"
          style={{ background: '#fff', border: '1px solid var(--color-neutral-300)', borderRadius: '16px', padding: '13px 14px' }}
        >
          <div className="flex-1 flex flex-col gap-0.5 min-w-0">
            <div className="text-[13.5px] font-bold truncate" style={{ color: 'var(--color-text)' }}>{pool.name}</div>
            <div style={{ fontFamily: 'var(--font-body-organic)', fontSize: '11px', letterSpacing: '0.04em', color: 'var(--color-neutral-600)' }}>
              {pool.capacity} COURT{pool.capacity === 1 ? '' : 'S'}
              {branchAbout?.workingHoursStart && branchAbout?.workingHoursEnd
                ? ` · ${branchAbout.workingHoursStart}–${branchAbout.workingHoursEnd}`
                : ''}
            </div>
          </div>
          <Link
            to={`/branches/${branchId}`}
            className="shrink-0 flex items-center justify-center text-[12.5px] font-bold rounded-full px-4"
            style={{ minHeight: '44px', background: 'var(--color-neutral-100)', border: '1px solid var(--color-neutral-300)', color: 'var(--color-accent-700)', fontFamily: 'var(--font-body-organic)' }}
          >
            Change
          </Link>
        </div>

        {upcomingBooking && (
          <div className="flex items-center gap-3 rounded-2xl px-3.5 py-3" style={{ background: 'var(--color-accent-2-200)' }}>
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: 'var(--color-accent-2-600)' }} />
            <div className="flex-1 text-[12.5px] font-semibold" style={{ color: 'var(--color-accent-2-800)' }}>
              {new Date(upcomingBooking.window.startTime).toLocaleDateString([], { weekday: 'short' })}{' '}
              {new Date(upcomingBooking.window.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </div>
            <Link to="/bookings/my" className="shrink-0 text-[12px] font-bold" style={{ color: 'var(--color-accent-2-700)' }}>
              Manage
            </Link>
          </div>
        )}
      </div>

      <div className="px-4 sm:px-6 pt-4 pb-10 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column: Date & Slots */}
        <div className="lg:col-span-2 space-y-6">
          <div className="space-y-3">
            <h3 style={{ fontFamily: 'var(--font-body-organic)', fontSize: '11px', letterSpacing: '0.09em', color: 'var(--color-neutral-700)' }}>
              01 &middot; DAY
            </h3>

            <div className="flex items-center gap-2">
              <div className="flex gap-[7px] overflow-x-auto flex-1 pb-1">
                {dayChips.map((chip) => {
                  const active = bookingDate === chip.key;
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => pickDate(chip.key)}
                      className="shrink-0 flex flex-col items-center justify-center gap-0.5 rounded-2xl"
                      style={{
                        width: '46px',
                        minHeight: '50px',
                        background: active ? 'var(--color-accent-700)' : '#fff',
                        color: active ? 'var(--color-accent-100)' : 'var(--color-text)',
                        border: `1px solid ${active ? 'var(--color-accent-700)' : 'var(--color-neutral-300)'}`,
                      }}
                    >
                      <span className="text-[10px] font-semibold opacity-80">{chip.dow}</span>
                      <span className="text-base font-bold">{chip.day}</span>
                    </button>
                  );
                })}
              </div>
              {/* F-190 Slice 2a: only shown when the pool's real guestOpenWindowDays exceeds the
                  7-day chip strip -- JBC's actual current value is 7, so this branch is dormant on
                  real traffic today but real for any pool configured with a longer window. */}
              {guestOpenWindowDays > 7 && (
                <button
                  type="button"
                  onClick={() => {
                    // showPicker() can throw even when it exists (e.g. NotAllowedError outside a
                    // trusted user gesture, or browser-specific quirks on a visually hidden
                    // input) -- always fall back to focus() rather than leaving the button inert.
                    const el = dateInputRef.current as any;
                    try {
                      if (el?.showPicker) el.showPicker();
                      else el?.focus();
                    } catch {
                      el?.focus();
                    }
                  }}
                  aria-label="Choose a date beyond the next 7 days"
                  className="shrink-0 h-11 w-11 flex items-center justify-center rounded-full"
                  style={{ background: '#fff', border: '1px solid var(--color-neutral-300)', color: 'var(--color-text)' }}
                >
                  <Calendar className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Real native date input, kept in the DOM (not display:none) so
                f041-verification.spec.ts and f043-phase-c.spec.ts's real
                `input[type="date"]` .fill() calls keep working -- the chip strip above is the
                primary control, this is visually hidden but fully present and functional. */}
            <input
              ref={dateInputRef}
              type="date"
              value={bookingDate}
              onChange={(e) => pickDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              max={maxDateKey}
              style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', border: 0, opacity: 0 }}
            />
          </div>

          {/* F-212: shown only once we've actually landed (with slots) on an auto-advanced date,
              so it never appears next to the generic "no slots" fallback. */}
          {autoAdvanceNotice && autoAdvanceNotice.to === bookingDate && slots.length > 0 && (
            <p
              id="auto-advance-notice"
              className="text-xs px-3 py-2 text-center"
              style={{ color: 'var(--color-neutral-700)', background: 'var(--color-neutral-100)', border: '1px solid var(--color-neutral-300)', borderRadius: 'var(--radius-md)' }}
            >
              No slots on {formatDateReadable(autoAdvanceNotice.from)} &mdash; showing the next available date, {formatDateReadable(autoAdvanceNotice.to)}.
            </p>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 style={{ fontFamily: 'var(--font-body-organic)', fontSize: '11px', letterSpacing: '0.09em', color: 'var(--color-neutral-700)' }}>
                02 &middot; START
              </h3>
            </div>

            {/* F-187: Fast Grid period tabs — 44px tall (slide 4a correction over the wireframe's
                drawn 33-38px), so the tap target stays comfortable on a phone. Slice 2a: token
                swap only, matching ds.css's .seg/.seg-opt segmented-control look. */}
            {!slotsLoading && slots.length > 0 && (
              <div className="grid grid-cols-3 gap-1 p-1 rounded-xl" role="tablist" aria-label="Time of day" style={{ background: 'var(--color-neutral-200)' }}>
                {groupedSlots.map((g) => (
                  <button
                    key={g.key}
                    type="button"
                    role="tab"
                    aria-selected={activePeriod === g.key}
                    onClick={() => setActivePeriod(g.key)}
                    disabled={g.slots.length === 0}
                    className="h-11 rounded-lg text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: activePeriod === g.key ? 'var(--color-accent-700)' : 'transparent',
                      color: activePeriod === g.key ? 'var(--color-accent-100)' : 'var(--color-text)',
                    }}
                  >
                    {g.label} <span className="opacity-70 font-mono">({g.slots.length})</span>
                  </button>
                ))}
              </div>
            )}

            {slotsLoading ? (
              <div className="py-12 flex justify-center">
                <Activity className="h-8 w-8 animate-spin" style={{ color: 'var(--color-accent-700)' }} />
              </div>
            ) : slots.length === 0 ? (
              <p
                className="text-xs py-8 text-center"
                style={{ color: 'var(--color-neutral-600)', background: 'var(--color-neutral-100)', border: '1px solid var(--color-neutral-300)', borderRadius: 'var(--radius-md)' }}
              >
                No slots available on this date. Try another date.
              </p>
            ) : visibleSlots.length === 0 ? (
              <p
                className="text-xs py-8 text-center"
                style={{ color: 'var(--color-neutral-600)', background: 'var(--color-neutral-100)', border: '1px solid var(--color-neutral-300)', borderRadius: 'var(--radius-md)' }}
              >
                No {activePeriod} slots on this date. Try another period or date.
              </p>
            ) : (
              // F-190 Slice 2a: real breakpoint rework per 4a's table -- 3 across mobile, 4-5
              // tablet, 6 laptop (one row per period), replacing the old grid-cols-1 sm:grid-cols-2.
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-[7px]">
                {visibleSlots.map((slot) => {
                  const isSelected = selectedSlot?.window?.id === slot.window.id;
                  const timeRange = formatTimeRange(slot.window);
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
                      className="cursor-pointer border transition-all flex flex-col items-start justify-center gap-0.5 px-2.5 py-2"
                      style={{
                        borderRadius: 'var(--radius-md)',
                        minHeight: '66px',
                        // F-192 Slice D: --slot-selected-surface is now a solid --color-accent-700
                        // fill (was a 10% --brand-primary tint), so the time/price text switches to
                        // --slot-selected-label and the seats line to --slot-selected-meta when
                        // selected -- dark ink over the solid fill would be unreadable.
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
                      <span
                        className="text-[13px] font-bold font-mono leading-tight"
                        style={{ color: isSelected ? 'var(--slot-selected-label)' : 'var(--color-text)' }}
                      >
                        {timeRange.split(' - ')[0]}
                      </span>
                      <span
                        className="text-[11px] font-bold font-mono"
                        style={{ color: isSelected ? 'var(--slot-selected-label)' : 'var(--color-text)' }}
                      >
                        ₹{rate}
                      </span>
                      <span
                        className="text-[9.5px] font-mono leading-tight"
                        style={{ color: isSelected ? 'var(--slot-selected-meta)' : isAlmostFull ? 'var(--slot-almostfull-text)' : 'var(--slot-available-accent)' }}
                      >
                        {isAlmostFull ? `${slot.remainingCapacity} left` : `${slot.remainingCapacity} seats`}
                      </span>
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
            <>
              {/* F-190 Slice 2b: F-153's scroll effect is retargeted here, not removed -- this div
                  no longer contains the reserve button (moved to the sticky bar below), so it's
                  shorter than before and the same scrollIntoView({block:'nearest'}) now reveals
                  duration+review without needing to evict the slot grid, matching the wireframe's
                  own "Scrolling" guidance (4a): scroll only far enough to reveal the duration
                  stepper, keep the slot grid on screen. */}
              <div
                ref={summaryRef}
                id="rate-summary-panel"
                className="space-y-5"
                style={{ background: '#fff', border: '1px solid var(--color-neutral-300)', borderRadius: '16px', overflow: 'hidden' }}
              >
                <div className="p-5 space-y-0">
                  {/* MVP: the participant-collection list was removed here — see the note at the
                      top of this component. The API still accepts coPlayers; only this UI step is
                      gone. */}

                  {/* F-153: echo which slot was picked. On a long list the tapped card necessarily
                      leaves the viewport when this panel scrolls into view — a 375px screen cannot
                      hold both — so the confirmation of WHAT was selected has to exist here too,
                      not only as the highlight in the list. Deliberately additive: F-146's
                      selected-slot styling is untouched. */}
                  <div className="flex justify-between items-center py-3" style={{ borderBottom: '1px solid var(--color-neutral-200)' }}>
                    <span className="text-[13.5px]" style={{ color: 'var(--color-neutral-700)' }}>Slot</span>
                    <span className="text-[13.5px] font-bold font-mono" style={{ color: 'var(--color-text)' }} id="selected-slot-echo">
                      {(() => {
                        const chain = getSelectedChain();
                        const last = chain[chain.length - 1] ?? selectedSlot;
                        return `${formatTimeRange(selectedSlot.window).split(' - ')[0]} - ${formatTimeRange(last.window).split(' - ')[1]}`;
                      })()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-3" style={{ borderBottom: '1px solid var(--color-neutral-200)' }}>
                    <span className="text-[13.5px]" style={{ color: 'var(--color-neutral-700)' }}>Pricing</span>
                    <span className="text-[13.5px] font-bold" style={{ color: 'var(--color-text)' }}>
                      {(selectedSlot.window.pricingMode || pool.pricingMode || 'FLAT') === 'PER_PERSON'
                        ? 'Per-person rate multiplication'
                        : 'Flat booking rate'}
                    </span>
                  </div>

                  {/* F-187: duration stepper. Whole-hour increments only (not the wireframe's drawn
                      30-min steps — the pool's own minBookingDurationMinutes/AvailabilityWindow
                      grain is hourly here), capped by maxAdditionalWindows AND by how many
                      contiguous hours actually exist after the selected slot. Slice 2b: buttons
                      resized to 52px (from 28px, under 4a's 44px floor for a control that changes
                      the price) -- restyle only, no logic change. */}
                  <div className="flex justify-between items-center py-3">
                    <span className="text-[13.5px]" style={{ color: 'var(--color-neutral-700)' }}>Duration</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAdditionalWindowsCount((c) => Math.max(0, c - 1))}
                        disabled={additionalWindowsCount === 0}
                        className="h-[52px] w-[52px] rounded-2xl font-bold text-lg disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ border: '1px solid var(--color-neutral-300)', background: '#fff', color: 'var(--color-text)' }}
                        id="duration-decrement-btn"
                        aria-label="Decrease duration"
                      >
                        −
                      </button>
                      <span className="font-mono font-bold w-16 text-center text-[15px]" style={{ color: 'var(--color-text)' }} id="duration-display">
                        {additionalWindowsCount + 1} hr{additionalWindowsCount + 1 > 1 ? 's' : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => setAdditionalWindowsCount((c) => Math.min(maxAdditionalAvailable(selectedSlot), c + 1))}
                        disabled={additionalWindowsCount >= maxAdditionalAvailable(selectedSlot)}
                        className="h-[52px] w-[52px] rounded-2xl font-bold text-lg disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ border: '1px solid var(--color-neutral-300)', background: '#fff', color: 'var(--color-text)' }}
                        id="duration-increment-btn"
                        aria-label="Increase duration"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-3" style={{ borderTop: '1px solid var(--color-neutral-200)' }}>
                    <span className="text-[13.5px] font-bold" style={{ color: 'var(--color-neutral-700)' }}>Total</span>
                    <span className="text-xl font-extrabold font-mono" style={{ color: 'var(--color-accent-700)' }} id="computed-price-display">
                      ₹{calculatePrice()}
                    </span>
                  </div>
                </div>

                {/* F-187: daily-cap / cancellation-policy copy, read directly off the pool's own
                    BookingRule — no new fetch, this is the same `pool` state already loaded above.
                    Real dynamic content untouched; the wireframe's own hardcoded "Free
                    cancellation up to 4 hours before start" example line is deliberately not
                    copied, same trap already avoided elsewhere in F-187. */}
                {(pool.bookingRules?.[0]?.maxDailyBookingsPerGuest != null || pool.bookingRules?.[0]?.cancellationPolicyJson) && (
                  <div className="text-[11.5px] p-4 space-y-1" style={{ background: 'var(--color-neutral-100)', color: 'var(--color-neutral-700)' }}>
                    <p>
                      Up to <span className="font-bold" style={{ color: 'var(--color-text)' }}>{pool.bookingRules?.[0]?.maxDailyBookingsPerGuest ?? 3}</span> booking(s) per day per guest.
                    </p>
                    {formatCancellationPolicy(pool.bookingRules?.[0]?.cancellationPolicyJson).map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                )}

                {/* F-190 Slice 2b: kept in the scrollable review card rather than duplicated near
                    the sticky bar -- a real potential UX improvement, but out of this slice's
                    restyle-only mandate; noted rather than silently done or silently skipped. */}
                {bookingError && (
                  <div
                    className="p-4 flex items-start space-x-2 text-xs"
                    style={{ background: 'var(--color-neutral-100)', borderTop: '1px solid var(--color-neutral-300)', color: 'var(--color-destructive)' }}
                  >
                    <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{bookingError}</span>
                  </div>
                )}
              </div>

              {/* F-190 Slice 2b: sticky bottom bar (JBC Booking.dc.html:670-676). Mobile gets the
                  real fixed bar 4a specifies (env(safe-area-inset-bottom)-aware); sm: and up use
                  plain normal-flow positioning -- covers both the wireframe's tablet AND laptop
                  breakpoint tiers. Laptop's "sticky right rail" tier is deliberately not
                  implemented: the review card already renders fully visible in the existing
                  2-column desktop layout with no scrolling needed (confirmed in Slice 2a), so that
                  tier has no reachability consequence, unlike the mobile bar which is F-153's real
                  problem. ONE button element throughout -- only its wrapper's positioning/
                  background classes change per breakpoint, never a second element sharing
                  #reserve-court-btn. */}
              <div
                className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 px-5 pt-3.5
                  bg-[var(--color-neutral-900)] pb-[calc(14px+env(safe-area-inset-bottom))]
                  sm:static sm:px-0 sm:pt-0 sm:pb-0 sm:bg-transparent sm:block"
              >
                <div className="flex flex-col gap-0.5 min-w-[80px] sm:hidden">
                  <div style={{ fontFamily: 'var(--font-body-organic)', fontSize: '10px', letterSpacing: '0.08em', color: 'var(--color-neutral-500)' }}>
                    TOTAL
                  </div>
                  <div className="font-extrabold" style={{ fontSize: '21px', color: 'var(--color-neutral-100)' }}>
                    ₹{calculatePrice()}
                  </div>
                </div>
                <button
                  onClick={handleReserve}
                  disabled={submitting}
                  className={primaryReserveBtn}
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
              {/* Mobile-only spacer so the fixed bar above doesn't cover the last inline content. */}
              <div className="sm:hidden" style={{ height: '84px' }} />
            </>
          ) : (
            <div
              className="p-6 text-center py-16 text-xs font-semibold"
              style={{
                background: 'var(--color-neutral-100)',
                border: '1px solid var(--color-neutral-300)',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'var(--font-body-organic)',
                color: 'var(--color-neutral-600)',
              }}
            >
              Select an availability slot to display participant setup and pricing details.
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
