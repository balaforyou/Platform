import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest, branchHour, formatBranchTime } from '@badminton/ui-shared';
import { useAuth, useTenant } from '@badminton/ui-shared';
import { Calendar, ArrowLeft, Info, ShieldAlert, ChevronDown } from 'lucide-react';
import LoadingState from './ui/LoadingState';
import VenueSwitcherSheet, { type Branch } from './VenueSwitcherSheet';
import AboutSheet from './AboutSheet';
import VerifyPhoneDialog from './VerifyPhoneDialog';
import './BranchBooking.css';

// F-235 Slice A: the real merged Branch Select + Court Booking screen, replacing Phase 0's
// placeholder. This is a PORT, not a rewrite -- the booking engine below is CourtBooking.tsx's
// real, working logic (day-picker, period tabs, slot grid, duration stepper, sticky reserve
// bar), adapted to read the selected branch/pool from local component state instead of route
// params (`useParams()`), since venue/pool selection now lives inside this one screen instead
// of across the old /branches routes. Every existing element ID is preserved so the Playwright
// specs this slice rewrites are mostly navigation/interaction changes, not new selectors.
//
// F-190 Slice 2b: unchanged from CourtBooking.tsx -- accent-400 fill / neutral-900 text (was
// accent-700 / accent-100). On the dark sticky bar the old pairing measured ~2.25:1 -- below
// WCAG AA's 3:1 floor for UI components; accent-400 on neutral-900 clears it at ~6.8:1. Matches
// JBC Migration.dc.html frame 08. Deliberately NOT migrated to the shared Button component this
// slice -- Button's primary variant is width:100%, a different layout role than this
// flex-1/sm:w-full CTA (both are tenant-green as of the 26 Sep 2026 feedback round's gold-ramp
// reversal, so color is no longer the distinguishing factor); forcing the migration risks a
// real visual regression for no benefit, same discipline Phase 0 already applied to
// CancelBookingModal.tsx.
const primaryReserveBtn =
  'flex-1 sm:w-full min-h-[54px] py-3 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ' +
  'bg-[var(--color-accent-400)] text-[var(--color-neutral-900)] hover:bg-[var(--color-accent-300)] active:bg-[var(--color-accent-500)]';

// F-266: matches admin-v2's `RateSource`/`RATE_SOURCE_LABEL`
// (apps/admin-v2/src/screens/guestManagement/reservationHelpers.ts) exactly, so a guest and an
// admin see the same wording for the same rate. Duplicated rather than shared -- no package
// exists between this app and admin-v2 (same tradeoff as `lib/courtLabel.ts` in this batch).
type RateSource = 'window' | 'peak' | 'standard' | 'default';
const RATE_SOURCE_LABEL: Record<RateSource, string> = {
  window: "this slot's set price",
  peak: 'the guest peak rate',
  standard: 'the guest standard rate',
  default: "the pool's default rate",
};

// F-318 (29 Sep 2026) secondary fix: a guest who reaches /bookings/:id/pay and taps back loses
// their multi-select entirely -- this component unmounts on route change and selectedSlots is
// plain state. Persisted here, keyed by pool+date so a stale selection from a different
// pool/day is never restored. Additive-only: the real correctness fix (F-318 primary) is the
// backend's own duplicate-HELD-booking detection in POST /bookings -- this only reduces how
// often a guest reaches the resubmit path in the first place.
const PENDING_SELECTION_KEY = 'pending_slot_selection';

// F-339: "today" for the date picker -- the browser's local calendar date. This is the original
// useState initialiser, extracted unchanged so a venue switch can put the picker back on the same value.
function todayKey(): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// F-339: F-212's two auto-advance guards are keyed by pool AND date. A date alone let a date one venue
// had already advanced to count as "already searched" for the next venue. Takes real strings only, so a
// pool that is still loading (null) can never produce a key.
function searchKey(poolId: string, date: string): string {
  return `${poolId}|${date}`;
}

// F-335: a stored branch time zone is only usable if Intl accepts it. The bar below shows a time ONLY
// for a known zone -- never through formatBranchTime's silent UTC fallback, which is wrong for
// Asia/Kolkata (JBC): a 6:00 AM IST booking would read 12:30 AM until the zone arrives.
function isKnownTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

export default function BranchBooking() {
  const { tenant } = useTenant();
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();

  // -------------------------------------------------------------------------------------------
  // Venue selection -- local component state, not the URL (Phase 0's own recorded note: "a
  // shareable/deep-linkable venue URL is a real future nice-to-have, not in scope here").
  // Persisted via the same `localStorage['selected_branch_id']` key BranchSelect.tsx already
  // used, so a returning guest doesn't have to reselect.
  // -------------------------------------------------------------------------------------------
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(() => localStorage.getItem('selected_branch_id'));
  const [branchAbout, setBranchAbout] = useState<any>(null);
  // F-335: the /about payload has no id, so record which branch the current `branchAbout` (or its
  // failure) belongs to. The bar below reads it only when this matches, never a previous venue's.
  const [branchAboutFor, setBranchAboutFor] = useState<string | null>(null);
  const [venueSheetOpen, setVenueSheetOpen] = useState(false);
  const [aboutSheetOpen, setAboutSheetOpen] = useState(false);
  // F-235 Slice C: phone-re-verify gate at Reserve, for a walk-in-created guest (F-229) whose
  // phone was typed in by an admin and never proven live.
  const [verifyPhoneOpen, setVerifyPhoneOpen] = useState(false);

  // No saved branch yet (first-ever visit): auto-select the first real branch. There is no
  // "pick a venue first" step in the merged design -- the switcher chip is how a guest corrects
  // this if it's the wrong one.
  useEffect(() => {
    if (selectedBranchId || !tenant) return;
    apiRequest<Branch[]>(`/tenant/tenants/${tenant.id}/branches`, { token: accessToken })
      .then((res) => {
        if (res && res.length > 0) {
          setSelectedBranchId(res[0].id);
          localStorage.setItem('selected_branch_id', res[0].id);
        }
      })
      .catch(() => {});
    // Deliberately keyed on selectedBranchId/tenant only -- runs once until a branch is chosen.
  }, [selectedBranchId, tenant, accessToken]);

  // F-190 Slice 2a header shell data, ported from CourtBooking.tsx -- consolidated to one fetch
  // here since the header (venue-switcher name, About badge) and the booking body below are now
  // one component instead of two separately-routed screens that each fetched this independently.
  useEffect(() => {
    if (!selectedBranchId) return;
    // F-335: a response for a branch the guest has since left must not land (it would pair a
    // previous venue's about with the new selection).
    let isCurrentRequest = true;
    apiRequest<any>(`/tenant/branches/${selectedBranchId}/about`, { token: accessToken })
      .then((res) => {
        if (!isCurrentRequest) return;
        setBranchAbout(res);
        setBranchAboutFor(selectedBranchId);
      })
      .catch(() => {
        if (!isCurrentRequest) return;
        setBranchAbout(null);
        setBranchAboutFor(selectedBranchId);
      });
    return () => {
      isCurrentRequest = false;
    };
  }, [selectedBranchId, accessToken]);

  const handleSelectBranch = (branch: Branch) => {
    if (branch.id !== selectedBranchId) {
      resetAutoAdvance();
      // Same reset the pools effect does after the next render, done in the same batch so the old pool is never
      // fetched for one render with the reset date.
      setSelectedPoolId(null);
    }
    setSelectedBranchId(branch.id);
    localStorage.setItem('selected_branch_id', branch.id);
    setVenueSheetOpen(false);
  };

  // -------------------------------------------------------------------------------------------
  // Pool resolution -- real-data check (F-235 Slice A investigation) confirmed both real JBC
  // branches have exactly 1 pool today, so auto-select is the common real path. The chip row
  // below only renders when a branch genuinely has more than one -- kept real, not stubbed,
  // since f023-full-system.spec.ts's own fixture exercises a real 2-pool scenario.
  // -------------------------------------------------------------------------------------------
  const [pools, setPools] = useState<any[]>([]);
  const [poolsLoading, setPoolsLoading] = useState(true);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedBranchId) return;
    let isCurrentRequest = true;
    setPoolsLoading(true);
    setSelectedPoolId(null);
    apiRequest<any[]>(`/slot-engine/branches/${selectedBranchId}/resource-pools`, { token: accessToken })
      .then((res) => {
        if (!isCurrentRequest) return;
        const list = Array.isArray(res) ? res : [];
        setPools(list);
        if (list.length === 1) setSelectedPoolId(list[0].id);
      })
      .catch(() => {
        if (isCurrentRequest) setPools([]);
      })
      .finally(() => {
        if (isCurrentRequest) setPoolsLoading(false);
      });
    return () => {
      isCurrentRequest = false;
    };
  }, [selectedBranchId, accessToken]);

  const branchId = selectedBranchId;
  const poolId = selectedPoolId;
  const pool = pools.find((p) => p.id === poolId) || null;

  // -------------------------------------------------------------------------------------------
  // Everything below this line is CourtBooking.tsx's real booking engine, ported verbatim except
  // for reading branchId/poolId from the state above instead of useParams(). See that file's own
  // history for the F-numbered rationale behind each piece -- preserved here, not re-derived.
  // -------------------------------------------------------------------------------------------
  const [slots, setSlots] = useState<any[]>([]);
  // F-310 Phase 2: replaces the old single selectedSlot + additionalWindowsCount duration-stepper
  // model. A guest now toggles any number of slots on/off directly, contiguous or not, same-pool
  // or not (POST /booking-orders imposes no such restriction) -- see toggleSlotSelection below.
  const [selectedSlots, setSelectedSlots] = useState<any[]>([]);
  const [activePeriod, setActivePeriod] = useState<'morning' | 'afternoon' | 'evening'>('morning');
  // F-310 Phase 2: real result of a >1-slot POST /booking-orders call, rendered inline on this
  // same screen as the "explicit confirm tap" the handover asked for -- which windows actually
  // held vs. were rejected (and why), before the guest leaves for /bookings/my. Null until a
  // multi-slot submit has actually happened.
  const [orderResult, setOrderResult] = useState<{ orderId: string; held: any[]; rejected: { windowId: string; code: string; message: string }[] } | null>(null);
  const [bookingDate, setBookingDate] = useState(todayKey);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const prevSelectedCountRef = useRef(0);

  const [autoAdvanceNotice, setAutoAdvanceNotice] = useState<{ from: string; to: string } | null>(null);
  // F-339: both hold a searchKey(poolId, date), not a bare date.
  const autoAdvancedToRef = useRef<string | null>(null);
  const searchRanForRef = useRef<string | null>(null);
  const prevSlotsLoadingRef = useRef(false);
  // F-318 secondary: guards the write-through effect below from firing on the very first render
  // (selectedSlots starts at []) before the fetch-slots effect's async restore attempt has run --
  // without this, the write-through effect sees an empty array first and wipes the saved
  // selection before it can ever be restored. Set true once the fetch-slots effect has made its
  // one restore attempt, regardless of whether anything was actually restored.
  const restoreAttemptedRef = useRef(false);

  // F-335: the soonest upcoming booking in a DIFFERENT pool from the one open, kept together with the
  // pool it was computed for. Only a result for the pool open right now is ever shown (a pool still
  // unknown shows nothing), so neither a stale response nor the pre-pool request can put a booking
  // from the current pool in the bar.
  const [upcomingResult, setUpcomingResult] = useState<{ poolId: string; booking: any | null } | null>(null);
  const upcomingBooking = poolId && upcomingResult?.poolId === poolId ? upcomingResult.booking : null;

  // F-335: the bar's venue, keyed by branch id -- never one copied value that a different branch's
  // booking could inherit (the old single copied value showed the PREVIOUS venue's name and time
  // zone while a lookup was pending or after it failed). Same branch as the screen: branchAbout,
  // valid only while branchAboutFor says it belongs to that branch. Other branch: fetched once per
  // id below; a lookup that settles without a result is recorded so the bar can tell failed from pending.
  const [upcomingAboutById, setUpcomingAboutById] = useState<Record<string, any>>({});
  const [upcomingAboutSettledEmpty, setUpcomingAboutSettledEmpty] = useState<Record<string, true>>({});
  const upcomingAboutRequestedRef = useRef<Set<string>>(new Set());
  const upcomingBranchId: string | null = upcomingBooking?.branchId ?? null;
  const upcomingIsHere = !!upcomingBranchId && upcomingBranchId === branchId;
  const upcomingAbout = !upcomingBranchId
    ? null
    : upcomingIsHere
      ? (branchAboutFor === upcomingBranchId ? branchAbout : null)
      : (upcomingAboutById[upcomingBranchId] ?? null);
  const upcomingAboutSettled = !upcomingBranchId
    ? false
    : upcomingIsHere
      ? branchAboutFor === upcomingBranchId
      : !!upcomingAboutById[upcomingBranchId] || !!upcomingAboutSettledEmpty[upcomingBranchId];
  const upcomingVenueState: 'loaded' | 'pending' | 'unavailable' = upcomingAbout
    ? 'loaded'
    : upcomingAboutSettled
      ? 'unavailable'
      : 'pending';

  // Venue and time for the bar's second line. The time needs a KNOWN zone (no UTC fallback); pending
  // and failed lookups show only the label line. A name that is missing or blank is left out, never
  // replaced by a placeholder.
  const upcomingBarVenue = typeof upcomingAbout?.name === 'string' ? upcomingAbout.name.trim() : '';
  const upcomingBarZone = isKnownTimeZone(upcomingAbout?.timezone) ? upcomingAbout.timezone.trim() : null;
  const upcomingBarWhen =
    upcomingBooking && upcomingBarZone
      ? `${formatBranchTime(upcomingBooking.window.startTime, upcomingBarZone, { weekday: 'short' })} ${formatBranchTime(upcomingBooking.window.startTime, upcomingBarZone, { hour: 'numeric', minute: '2-digit' })}`
      : '';
  const upcomingBarTitle = ['Your next booking', upcomingBarVenue, upcomingBarWhen].filter(Boolean).join(' \u00b7 ');

  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!upcomingBranchId || upcomingIsHere) return;
    if (upcomingAboutRequestedRef.current.has(upcomingBranchId)) return;
    upcomingAboutRequestedRef.current.add(upcomingBranchId);
    const id = upcomingBranchId;
    // Results are keyed by id, so a response can never land on the wrong branch; no cancellation needed.
    apiRequest<any>(`/tenant/branches/${id}/about`, { token: accessToken })
      .then((res) => {
        if (res) setUpcomingAboutById((prev) => ({ ...prev, [id]: res }));
        else setUpcomingAboutSettledEmpty((prev) => ({ ...prev, [id]: true }));
      })
      .catch(() => setUpcomingAboutSettledEmpty((prev) => ({ ...prev, [id]: true })));
  }, [upcomingBranchId, upcomingIsHere, accessToken]);

  useEffect(() => {
    // F-335: no request until the pool is known (the "another pool" filter is meaningless without
    // it), and a response for a pool the guest has since left is ignored.
    if (!accessToken || !poolId) return;
    let isCurrentRequest = true;
    apiRequest<any[]>('/slot-engine/bookings/my', { token: accessToken })
      .then((res) => {
        if (!isCurrentRequest) return;
        const list = Array.isArray(res) ? res : [];
        const next = list
          .filter((b) => b?.window?.startTime && ['HELD', 'CONFIRMED', 'CHECKED_IN'].includes(b.status))
          .filter((b) => new Date(b.window.startTime).getTime() > Date.now())
          .filter((b) => b.resourcePoolId !== poolId)
          .sort((a, b) => new Date(a.window.startTime).getTime() - new Date(b.window.startTime).getTime());
        setUpcomingResult({ poolId, booking: next[0] ?? null });
      })
      .catch(() => {});
    return () => {
      isCurrentRequest = false;
    };
  }, [accessToken, poolId]);

  // F-187: Morning/Afternoon/Evening buckets, half-open ranges so every slot lands in exactly
  // one bucket.
  const periodsDef: { key: 'morning' | 'afternoon' | 'evening'; label: string; test: (hour: number) => boolean }[] = [
    { key: 'morning', label: 'Morning', test: (h) => h < 12 },
    { key: 'afternoon', label: 'Afternoon', test: (h) => h >= 12 && h < 17 },
    { key: 'evening', label: 'Evening', test: (h) => h >= 17 },
  ];

  const sortedSlots = [...slots].sort(
    (a, b) => new Date(a.window.startTime).getTime() - new Date(b.window.startTime).getTime(),
  );
  // F-234: branch-local hour via branchHour(), not the viewer's browser hour -- preserved
  // verbatim from CourtBooking.tsx. Do not regress to new Date(...).getHours().
  const groupedSlots = periodsDef.map((p) => ({
    ...p,
    slots: sortedSlots.filter((s) => p.test(branchHour(s.window.startTime, branchAbout?.timezone))),
  }));
  const visibleSlots = groupedSlots.find((g) => g.key === activePeriod)?.slots ?? [];

  // F-310 Phase 2: toggles a slot in/out of the current multi-select. One function, two entry
  // points (the grid onClick below and the selected-slots panel's × control), so selection state
  // can never drift between them.
  const toggleSlotSelection = (slot: any) => {
    setSelectedSlots((prev) => {
      const exists = prev.some((s) => s.window.id === slot.window.id);
      if (exists) return prev.filter((s) => s.window.id !== slot.window.id);
      return [...prev, slot];
    });
    setOrderResult(null);
    setBookingError(null);
  };

  // F-318 secondary: write-through persistence for the restore logic in the fetch-slots effect
  // below. Skipped while poolId/bookingDate aren't known yet, so a selection is never saved
  // under an incomplete/undefined key.
  useEffect(() => {
    if (!poolId || !bookingDate) return;
    // Skip entirely until the fetch-slots effect below has made its one restore attempt --
    // otherwise this fires on the very first render (selectedSlots still []) and wipes a saved
    // selection before it ever gets read back.
    if (!restoreAttemptedRef.current) return;
    if (selectedSlots.length === 0) {
      sessionStorage.removeItem(PENDING_SELECTION_KEY);
      return;
    }
    sessionStorage.setItem(
      PENDING_SELECTION_KEY,
      JSON.stringify({ poolId, bookingDate, windowIds: selectedSlots.map((s) => s.window.id) }),
    );
  }, [selectedSlots, poolId, bookingDate]);

  // 2. Fetch availability slots when date or pool changes
  useEffect(() => {
    if (!poolId || !bookingDate) return;
    let isCurrentRequest = true;

    const fetchSlots = async () => {
      try {
        setSlotsLoading(true);
        setSlots([]);
        setSelectedSlots([]);
        setOrderResult(null);
        setBookingError(null);
        const res = await apiRequest<any[]>(`/slot-engine/resource-pools/${poolId}/availability?date=${bookingDate}`, {
          token: accessToken,
        });
        if (!isCurrentRequest) return;
        const freshSlots = Array.isArray(res) ? res : (res as any)?.data || [];
        setSlots(freshSlots);

        // F-318 secondary: restore a selection saved before navigating away (e.g. to /pay), only
        // if it was saved for this exact pool+date and every named window still appears in this
        // fresh availability response -- never restore a stale or mismatched selection.
        try {
          const raw = sessionStorage.getItem(PENDING_SELECTION_KEY);
          if (raw) {
            const saved = JSON.parse(raw);
            if (saved?.poolId === poolId && saved?.bookingDate === bookingDate && Array.isArray(saved.windowIds)) {
              const restored = saved.windowIds
                .map((id: string) => freshSlots.find((s: any) => s.window.id === id))
                .filter(Boolean);
              if (restored.length > 0) setSelectedSlots(restored);
            }
          }
        } catch {
          // Corrupt/unparseable sessionStorage value -- ignore, selection just stays empty.
        }
      } catch (err: any) {
        if (!isCurrentRequest) return;
        setBookingError(err.message || 'Failed to fetch availability.');
      } finally {
        if (isCurrentRequest) setSlotsLoading(false);
        // F-318 secondary: unblock the write-through effect once this attempt is done, success
        // or failure -- otherwise a failed availability fetch would permanently gate it closed.
        restoreAttemptedRef.current = true;
      }
    };

    fetchSlots();
    return () => {
      isCurrentRequest = false;
    };
  }, [poolId, bookingDate, accessToken]);

  useEffect(() => {
    const current = groupedSlots.find((g) => g.key === activePeriod);
    if (current && current.slots.length === 0) {
      const firstNonEmpty = groupedSlots.find((g) => g.slots.length > 0);
      if (firstNonEmpty) setActivePeriod(firstNonEmpty.key);
    }
    // Keys only on `slots` deliberately -- not groupedSlots/activePeriod.
  }, [slots]);

  useEffect(() => {
    const justFinished = prevSlotsLoadingRef.current && !slotsLoading;
    prevSlotsLoadingRef.current = slotsLoading;
    if (!justFinished || slots.length > 0) return;
    if (!poolId || !bookingDate) return;
    const key = searchKey(poolId, bookingDate);
    if (autoAdvancedToRef.current === key) return;
    if (searchRanForRef.current === key) return;
    searchRanForRef.current = key;

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
          autoAdvancedToRef.current = searchKey(poolId, nextDate);
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

  // F-339: called when the guest changes venue or pool. Drops the notice and both guards so the new pool
  // gets its own F-212 search, and puts an AUTO-ADVANCED date back on today (the advance was the old pool's
  // answer, not the guest's choice). A date the guest picked by hand is kept.
  const resetAutoAdvance = () => {
    const wasAutoAdvanced = poolId !== null && autoAdvancedToRef.current === searchKey(poolId, bookingDate);
    autoAdvancedToRef.current = null;
    searchRanForRef.current = null;
    setAutoAdvanceNotice(null);
    if (wasAutoAdvanced) setBookingDate(todayKey());
  };

  const pickDate = (d: string) => {
    autoAdvancedToRef.current = null;
    searchRanForRef.current = null;
    setAutoAdvanceNotice(null);
    setBookingDate(d);
  };

  const formatDateReadable = (key: string) =>
    new Date(`${key}T00:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  // F-310 Phase 2: keyed on the panel's empty->non-empty transition (0 -> N>0 selected) via a
  // ref-tracked previous count, not on every selectedSlots change -- a guest toggling a 2nd/3rd
  // slot on or off (or removing back down to 1 remaining) already has the panel in view, and
  // re-scrolling on every toggle would be a real, new annoyance the old single-select model
  // never had.
  useEffect(() => {
    const el = summaryRef.current;
    const cameFromEmpty = prevSelectedCountRef.current === 0 && selectedSlots.length > 0;
    prevSelectedCountRef.current = selectedSlots.length;
    if (!cameFromEmpty || !el) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 26 Sep 2026 feedback round: 'nearest' only nudged the minimum distance needed -- often just
    // enough to reveal the top of the summary card (Slot/Pricing) while Duration stayed below the
    // fold, confirmed real via Bala's own device report. 'center' reveals the whole (now shorter,
    // Total hidden on mobile below) card in one scroll.
    el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
  }, [selectedSlots.length]);

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
      month: d.getMonth(),
      year: d.getFullYear(),
    };
  });
  // 26 Sep 2026 feedback round: the date ribbon's individual chips only ever show a bare day
  // number (no month), which was ambiguous with no month shown anywhere -- shown once in the
  // section header instead of repeating it on every chip. Computed from the real chip range
  // (a static 7-ish-day window, not scroll-tracked -- the whole range is always on screen at
  // once, unlike a true infinite-scroll calendar), so a real month boundary (e.g. late Sep into
  // early Oct) renders as a joined "Sep - Oct 2026" label rather than silently picking one.
  const dateRangeLabel = (() => {
    if (dayChips.length === 0) return '';
    const monthName = (m: number) => new Date(2000, m, 1).toLocaleDateString([], { month: 'short' });
    const first = dayChips[0];
    const last = dayChips[dayChips.length - 1];
    if (first.month === last.month && first.year === last.year) return `${monthName(first.month)} ${first.year}`;
    if (first.year === last.year) return `${monthName(first.month)} - ${monthName(last.month)} ${first.year}`;
    return `${monthName(first.month)} ${first.year} - ${monthName(last.month)} ${last.year}`;
  })();
  const maxDateKey = (() => {
    const d = new Date();
    d.setDate(d.getDate() + guestOpenWindowDays);
    return toDateKey(d);
  })();

  const formatTimeRange = (win: any) =>
    `${formatBranchTime(win.startTime, branchAbout?.timezone, { hour: '2-digit', minute: '2-digit' })} - ` +
    `${formatBranchTime(win.endTime, branchAbout?.timezone, { hour: '2-digit', minute: '2-digit' })}`;

  // F-239: sums the server-resolved guestPrice (GET /resource-pools/:id/availability) directly
  // -- resolvePrice already bakes in PER_PERSON-vs-FLAT and peak-vs-standard rate resolution, so
  // there is no rate/mode logic left to reimplement here. This is the same number POST /bookings
  // (or, for 2+ slots, POST /booking-orders) will actually charge, not a second,
  // independently-computed estimate of it.
  //
  // F-310 Phase 2: each selected slot is priced independently and summed -- no contiguity/chain
  // assumption, simpler than the old chain-walk this replaces.
  const calculatePrice = () => {
    if (!pool || selectedSlots.length === 0) return 0;
    return selectedSlots.reduce((sum, slot) => sum + Number(slot.guestPrice), 0);
  };

  const handleReserve = async () => {
    if (!tenant || !branchId || !poolId || !user || selectedSlots.length === 0) return;

    // F-235 Slice C: a walk-in-created guest (F-229) has a phone on file but never proved live
    // possession of it. Reserve is the real, single choke point (same one the original design
    // brief always pointed to) -- an already-verified guest (the normal case) sees zero change.
    if (!user.isPhoneVerified) {
      setVerifyPhoneOpen(true);
      return;
    }

    await doReserve();
  };

  // F-317 (29 Sep 2026): single-slot path is unchanged (real e2e specs assert navigation
  // straight to /bookings/:id/pay off this exact call). The 2+-slot path now also calls
  // POST /slot-engine/bookings -- F-183's parent/child chain, with NON_CONTIGUOUS_WINDOWS
  // relaxed server-side, superseding the old POST /booking-orders path (see
  // reserveViaBookingOrders_DEPRECATED_F317 below, kept but no longer called). One booking, one
  // payment, one cancellation for the whole selection -- same post-submit navigation as the
  // single-slot case, no held/rejected banner: a chain-create is one atomic transaction, so a
  // failure (e.g. a window no longer available) surfaces through the same bookingError state
  // the single-slot path already uses, not a partial-failure summary.
  const doReserve = async () => {
    if (!tenant || !branchId || !poolId || !user || selectedSlots.length === 0) return;

    const [firstSlot, ...additionalSlots] = selectedSlots;
    try {
      setSubmitting(true);
      setBookingError(null);

      const idempotencyKey = crypto.randomUUID();

      const booking = await apiRequest<any>('/slot-engine/bookings', {
        method: 'POST',
        token: accessToken,
        headers: { 'idempotency-key': idempotencyKey },
        body: JSON.stringify({
          tenantId: tenant.id,
          branchId,
          resourcePoolId: poolId,
          resourceId: firstSlot.window.resourceId || null,
          windowId: firstSlot.window.id,
          additionalWindowIds: additionalSlots.map((slot) => slot.window.id),
          userId: user.userId || user.id,
          coPlayers: [],
        }),
      });

      // F-318 secondary: deliberately NOT cleared here. The whole point of persisting this
      // selection is the guest hitting the Pay screen's real back arrow (navigate(-1),
      // BookingPay.tsx) and landing back on /book -- clearing on submit would wipe it at exactly
      // the moment it's needed, defeating the fix. Safe to leave in place: the primary F-318 fix
      // (the backend's own duplicate-HELD-booking detection) means resubmitting this exact
      // selection after a restore harmlessly redirects to this same booking rather than
      // double-holding. Left to expire naturally (deselection, a different pool/date, or the tab
      // closing), not on any single navigation event.
      navigate(`/bookings/${booking.id}/pay`);
    } catch (err: any) {
      setBookingError(err.message || 'Failed to reserve slot. Please try another slot.');
    } finally {
      setSubmitting(false);
    }
  };

  // DEPRECATED as of F-317 (29 Sep 2026) -- superseded by F-183 chain reuse for non-contiguous
  // booking (see doReserve above). Not wired into any active UI path -- nothing calls this
  // function any more. Kept for possible extraction into a generic multi-booking component in a
  // future project, per Chief's explicit instruction not to delete real, shipped, tested F-310
  // code. This is the original F-310 Phase 2 >1-slot submit path: POST /booking-orders creates N
  // independent HELD bookings (no parentBookingId chain) sharing one orderId, and always
  // responds 201 with the real { orderId, held, rejected } split -- even when every window was
  // rejected, so apiRequest() never discards this body (see F-312, filed for the underlying
  // shared-client defect this route's status-code choice works around).
  // @ts-expect-error -- deliberately unused (deprecated, kept for reference only)
  const reserveViaBookingOrders_DEPRECATED_F317 = async () => {
    if (!tenant || !branchId || !poolId || !user || selectedSlots.length === 0) return;
    try {
      setSubmitting(true);
      setBookingError(null);
      setOrderResult(null);

      const idempotencyKey = crypto.randomUUID();
      const result = await apiRequest<{ orderId: string; held: any[]; rejected: { windowId: string; code: string; message: string }[] }>(
        '/slot-engine/booking-orders',
        {
          method: 'POST',
          token: accessToken,
          headers: { 'idempotency-key': idempotencyKey },
          body: JSON.stringify({
            branchId,
            windowIds: selectedSlots.map((slot) => slot.window.id),
            coPlayers: [],
          }),
        },
      );
      setOrderResult(result);
    } catch (err: any) {
      setBookingError(err.message || 'Failed to hold these slots. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 w-full mx-auto text-ink" style={{ maxWidth: '1024px' }}>
      {/* 26 Sep 2026 UI-polish batch: replaces the dark dropdown pill (venue-chip) + separate
          Star about-badge row with one sticky top bar. Both real triggers are kept, relocated
          rather than dropped -- venue-switch is now the title tap target, about-sheet opens from
          the info icon next to the subtitle. Judgment call, flagged for Bala/Chief: the two were
          genuinely separate elements (different sheets), so "fold both into the new bar" was this
          session's interpretation of a handover line that read them as one -- open to correction.
          Avatar is intentionally not duplicated here -- Shell.tsx's fixed account-trigger already
          covers every route. */}
      <div className="gpwa-branchbooking__topbar">
        <button type="button" className="gpwa-branchbooking__back-btn" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="gpwa-branchbooking__topbar-text">
          {/* 26 Sep 2026, real device report: a branch is already known (selectedBranchId comes
              synchronously from localStorage on mount) the instant this screen loads, but its
              /about fetch is async -- during that brief real gap, this fell back to literal
              "Choose a venue" text, which is factually wrong (a venue IS chosen, its details just
              haven't arrived yet) and reads as a jarring flash/flicker. Only show that literal
              text for a genuinely venue-less first visit; show a skeleton bar instead while a
              real selection is just waiting on its own fetch. */}
          {/* 26 Sep 2026, real feedback: a plain bold title gave no visual cue this is tappable
              to switch venues -- the old dark pill (before this batch's top-bar redesign) had a
              ChevronDown for exactly this reason. Restored as a small trailing icon rather than
              reverting the whole redesign. */}
          <button type="button" className="gpwa-branchbooking__topbar-title" onClick={() => setVenueSheetOpen(true)}>
            <span className="gpwa-branchbooking__topbar-title-text">
              {branchAbout?.name ? (
                branchAbout.name
              ) : selectedBranchId ? (
                <span className="inline-block h-4 w-32 rounded animate-pulse" style={{ background: 'var(--color-neutral-300)' }} />
              ) : (
                'Choose a venue'
              )}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0" style={{ color: 'var(--color-neutral-600)' }} />
          </button>
          {branchAbout && (
            <button type="button" className="gpwa-branchbooking__topbar-subtitle" onClick={() => setAboutSheetOpen(true)}>
              <span>{branchAbout.address || branchAbout.name}</span>
              <Info className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <VenueSwitcherSheet
        open={venueSheetOpen}
        onOpenChange={setVenueSheetOpen}
        selectedBranchId={selectedBranchId}
        onSelect={handleSelectBranch}
      />
      <AboutSheet open={aboutSheetOpen} onOpenChange={setAboutSheetOpen} branchId={selectedBranchId} />
      {/* F-235 Slice D: unconditional now -- a phone-absent guest (a fresh Google signup, no
          longer forced through /complete-signup) needs to reach this dialog too, not just a
          walk-in guest re-verifying an existing number. VerifyPhoneDialog's phone-entry mode
          handles phone={''} by rendering an editable field instead of the read-only display. */}
      <VerifyPhoneDialog
        open={verifyPhoneOpen}
        onOpenChange={setVerifyPhoneOpen}
        phone={user?.phone || ''}
        onVerified={doReserve}
      />

      {/* Multi-pool chip row -- only renders when a branch genuinely has more than one pool.
          Real JBC branches have exactly one today (confirmed against the live DB), so this is
          dormant on real traffic but kept real (not stubbed) since f023-full-system.spec.ts's
          own fixture exercises a real 2-pool scenario. */}
      {!poolsLoading && pools.length > 1 && (
        <div className="gpwa-branchbooking__pool-chips">
          {pools.map((p) => (
            <button
              key={p.id}
              type="button"
              className="gpwa-branchbooking__pool-chip"
              data-active={p.id === selectedPoolId}
              id={`court-pool-card-${p.id}`}
              onClick={() => {
                if (p.id !== selectedPoolId) resetAutoAdvance();
                setSelectedPoolId(p.id);
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {poolsLoading || (!selectedPoolId && pools.length !== 1) ? (
        poolsLoading ? (
          <LoadingState variant="full" label="Loading courts…" />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] gap-4" style={{ background: 'var(--color-bg)' }}>
            <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '14px', color: 'var(--color-neutral-700)' }}>
              Pick a court category to see availability.
            </p>
          </div>
        )
      ) : !pool ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] p-4 gap-3 text-center" style={{ background: 'var(--color-bg)' }}>
          <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '13px', color: 'var(--color-neutral-600)' }}>
            No active court pools found at this venue.
          </p>
        </div>
      ) : (
        <div className="px-4 sm:px-6 pt-4 pb-10 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left column: Date & Slots */}
            <div className="lg:col-span-2 space-y-6">
              {/* 26 Sep 2026, real feedback: the "Main Courts" pool-info card removed -- with the
                  venue-name dedup already applied (Bug B's fix), it had shrunk to just the pool
                  name + capacity/hours, adding little beyond what the top bar and the real slot
                  grid below already convey. Not deleting `pool`/`displayPoolName` logic itself --
                  `pool` still drives the real booking flow below; `displayPoolName` is now genuinely
                  unused in this file (main.tsx keeps its own copy for the Home screen's card) and
                  removed alongside this block. */}

              {upcomingBooking && (
                <div
                  data-testid="upcoming-booking-bar"
                  data-venue-state={upcomingVenueState}
                  className="flex items-start gap-3 rounded-2xl px-3.5 py-3 mb-3"
                  style={{ background: 'var(--color-accent-200)' }}
                >
                  <span className="h-2 w-2 rounded-full shrink-0 mt-[5px]" style={{ background: 'var(--color-accent-600)' }} />
                  {/* F-335 (Chief's layout ruling): line 1 is the label and Manage; line 2 is the venue, which
                      truncates with an ellipsis, then the time, which never shrinks or wraps, so a long
                      venue name can never push the time out of view. While the venue is pending the second
                      line is reserved so the bar does not jump when it arrives; the reservation is released
                      as soon as the lookup loads or fails. The full text is in the title attribute. */}
                  <div
                    className="flex-1 min-w-0 text-[12.5px] font-semibold leading-snug"
                    style={{ color: 'var(--color-accent-800)', minHeight: upcomingVenueState === 'pending' ? '2.75em' : undefined }}
                    title={upcomingBarTitle}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate">Your next booking</span>
                      {/* 44px tap target without a taller bar: the hit area is an invisible extension of the link. */}
                      <Link
                        to="/bookings/my"
                        className="shrink-0 relative text-[12px] font-bold before:content-[''] before:absolute before:-inset-x-2 before:-inset-y-[14px]"
                        style={{ color: 'var(--color-accent-700)' }}
                      >
                        Manage
                      </Link>
                    </div>
                    {(upcomingBarVenue || upcomingBarWhen) && (
                      <div className="flex min-w-0 items-baseline">
                        {upcomingBarVenue && <span className="min-w-0 truncate">{upcomingBarVenue}</span>}
                        {upcomingBarVenue && upcomingBarWhen && <span className="shrink-0 whitespace-pre">{'\u00a0\u00b7\u00a0'}</span>}
                        {upcomingBarWhen && <span className="shrink-0 whitespace-nowrap">{upcomingBarWhen}</span>}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <h3 style={{ fontFamily: 'var(--font-body-organic)', fontSize: '11px', letterSpacing: '0.09em', color: 'var(--color-neutral-700)' }}>
                  Select Date &middot; {dateRangeLabel}
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
                            background: active ? 'var(--color-accent-700)' : 'var(--color-neutral-100)',
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
                  {guestOpenWindowDays > 7 && (
                    <button
                      type="button"
                      onClick={() => {
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
                      style={{ background: 'var(--color-neutral-100)', border: '1px solid var(--color-neutral-300)', color: 'var(--color-text)' }}
                    >
                      <Calendar className="h-5 w-5" />
                    </button>
                  )}
                </div>

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
                    Select Time
                  </h3>
                </div>

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
                  <LoadingState variant="compact" />
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
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-[7px]">
                    {visibleSlots.map((slot) => {
                      const isSelected = selectedSlots.some((s) => s.window.id === slot.window.id);
                      const timeRange = formatTimeRange(slot.window);
                      // F-239: server-resolved (GET /resource-pools/:id/availability's guestPrice),
                      // not recomputed from window.price/pool.defaultRate -- matches the real charge.
                      const rate = slot.guestPrice;
                      const totalCapacity = Number(slot.window.capacity) || 0;
                      const remaining = Number(slot.remainingCapacity) || 0;
                      // F-310 Phase 2: displayed remaining is reduced by 1 while this slot is part
                      // of the current selection -- a cell this guest has already claimed shouldn't
                      // still read its pre-selection count. Reverts automatically on deselect since
                      // this is computed at render time, not stored separately.
                      const displayedRemaining = remaining - (isSelected ? 1 : 0);
                      const isAlmostFull = totalCapacity > 0 && remaining > 0 && remaining / totalCapacity <= 0.25;
                      const slotState = isSelected ? 'selected' : isAlmostFull ? 'almost-full' : 'available';

                      return (
                        <div
                          key={slot.window.id}
                          onClick={() => toggleSlotSelection(slot)}
                          className="cursor-pointer border transition-all flex flex-col items-start justify-center gap-0.5 px-2.5 py-2"
                          style={{
                            borderRadius: 'var(--radius-md)',
                            minHeight: '66px',
                            // 29 Sep 2026, Bala's review: every non-selected tile shares one
                            // background/border regardless of remaining capacity -- "X left" vs
                            // "X courts open" (below) is the only almost-full signal now, not a
                            // separate tile color. --slot-almostfull-surface/-border are no
                            // longer read here (kept in index.css, unused) -- only the text color
                            // still distinguishes the low-capacity case.
                            background: isSelected ? 'var(--slot-selected-surface)' : 'var(--slot-available-surface)',
                            borderColor: isSelected ? 'var(--slot-selected-border)' : 'var(--slot-available-border)',
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
                            {/* F-284: "seats" reads as player-count/shared-table, not remaining
                                bookable courts in this hour's pool -- a court isn't a seat. */}
                            {isAlmostFull ? `${displayedRemaining} left` : `${displayedRemaining} courts open`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right column: Duration & Price Summary */}
            <div className="space-y-6">
              {selectedSlots.length > 0 ? (
                <>
                  <div
                    ref={summaryRef}
                    id="rate-summary-panel"
                    className="space-y-5"
                    style={{ background: 'var(--color-neutral-100)', border: '1px solid var(--color-neutral-300)', borderRadius: '16px', overflow: 'hidden' }}
                  >
                    <div className="p-5 space-y-0">
                      {/* F-310 Phase 2: one row per selected slot -- time range, its own
                          server-resolved guestPrice (not a chain sum), and a × that removes it via
                          the same toggleSlotSelection the grid itself uses, so state can't drift
                          between the two entry points. Replaces the single-slot "Slot"/"Pricing"
                          echo + duration stepper this screen used to show. */}
                      {selectedSlots.map((slot) => (
                        <div
                          key={slot.window.id}
                          className="flex justify-between items-center py-3"
                          style={{ borderBottom: '1px solid var(--color-neutral-200)' }}
                          id={`selected-slot-row-${slot.window.id}`}
                        >
                          <div className="flex flex-col">
                            <span className="text-[13.5px] font-bold font-mono" style={{ color: 'var(--color-text)' }}>
                              {formatTimeRange(slot.window)}
                            </span>
                            {/* F-266: which rate was actually applied (window override / peak /
                                standard / pool default). */}
                            {slot.rateSource && (
                              <span className="text-[11px]" style={{ color: 'var(--color-neutral-600)' }}>
                                at {RATE_SOURCE_LABEL[slot.rateSource as RateSource] ?? slot.rateSource}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[13.5px] font-bold font-mono" style={{ color: 'var(--color-text)' }}>₹{slot.guestPrice}</span>
                            <button
                              type="button"
                              onClick={() => toggleSlotSelection(slot)}
                              aria-label={`Remove ${formatTimeRange(slot.window)}`}
                              className="flex items-center justify-center transition-colors"
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '999px',
                                background: 'var(--color-neutral-200)',
                                color: 'var(--color-neutral-700)',
                                border: '1px solid var(--color-neutral-300)',
                              }}
                              id={`remove-selected-slot-${slot.window.id}`}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* 26 Sep 2026 feedback round: static disclaimer, real number confirmed
                          for JBC's courts -- no per-pool max-players field exists in the schema
                          (only minOccupancy, a minimum), so this is intentionally static copy,
                          not data-driven. */}
                      <div className="flex justify-end py-2">
                        <span className="text-[11.5px]" style={{ color: 'var(--color-neutral-600)' }}>
                          Up to 6 players per court
                        </span>
                      </div>

                      {/* 26 Sep 2026 feedback round: the sticky footer's own TOTAL block below is
                          `sm:hidden` (mobile-only) -- on mobile this row duplicated it (real
                          complaint, confirmed via Bala's device screenshot); on desktop the
                          footer shows no total at all, so this is the only place it exists there.
                          Hidden on mobile, kept on desktop -- not deleted outright, which would
                          have silently removed the total from desktop entirely. #computed-price-
                          display stays in the DOM either way (Playwright's own
                          guest-booking.spec.ts asserts its textContent, not visibility). */}
                      <div className="hidden sm:flex justify-between items-center pt-3" style={{ borderTop: '1px solid var(--color-neutral-200)' }}>
                        <span className="text-[13.5px] font-bold" style={{ color: 'var(--color-neutral-700)' }}>Total</span>
                        <span className="text-xl font-extrabold font-mono" style={{ color: 'var(--color-accent-700)' }} id="computed-price-display">
                          ₹{calculatePrice()}
                        </span>
                      </div>
                    </div>

                    {/* 26 Sep 2026 feedback round: cancellation policy moved to Review & Pay
                        (BookingPay.tsx), per Bala's call -- this screen keeps only the real
                        duration/pricing summary. */}

                    {/* DEPRECATED as of F-317 (29 Sep 2026) -- superseded by F-183 chain reuse.
                        doReserve's 2+-slot path no longer calls POST /booking-orders (see
                        reserveViaBookingOrders_DEPRECATED_F317, kept but never called), so
                        orderResult is never set from any live path any more and this block is
                        permanently dead. Kept, not deleted, alongside the deprecated function it
                        renders, per Chief's explicit instruction not to delete real, shipped,
                        tested F-310 code.
                        F-310 Phase 2: real held/rejected split from POST /booking-orders, rendered
                        inline on this same screen -- the "explicit confirm tap" the handover asked
                        for, without a new route or a combined payment step. Only ever set on the
                        2+-slot path; the single-slot path navigates away on success and never
                        touches this state. */}
                    {orderResult && (
                      <div
                        className="p-4 space-y-2 text-xs"
                        style={{ background: 'var(--color-accent-100)', borderTop: '1px solid var(--color-accent-300)' }}
                        id="order-result-banner"
                      >
                        <p className="font-bold" style={{ color: 'var(--color-text)' }}>
                          {orderResult.held.length} of {selectedSlots.length} slot(s) held
                        </p>
                        {orderResult.rejected.length > 0 && (
                          <ul className="space-y-1" style={{ color: 'var(--color-destructive)' }}>
                            {orderResult.rejected.map((r) => {
                              const rejectedSlot = selectedSlots.find((s) => s.window.id === r.windowId);
                              return (
                                <li key={r.windowId}>
                                  {rejectedSlot ? formatTimeRange(rejectedSlot.window) : r.windowId}: {r.message}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}

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

                  <div
                    className="fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2 px-5 pt-3.5
                      pb-[calc(14px+env(safe-area-inset-bottom))]
                      sm:static sm:px-0 sm:pt-0 sm:pb-0 sm:bg-transparent sm:block"
                    style={{ background: 'var(--gpwa-fixed-dark-bg)' }}
                  >
                    {/* F-235 Slice B: persistent notice, independent of the conditional
                        bookingError banner above -- both can be visible at once. The real
                        checkbox/acceptance happens on the Payment screen once the booking exists.
                        26 Sep 2026, real dark-mode bug found and fixed: this bar's own comment
                        always said the mobile background should be "a fixed dark literal
                        regardless of app theme", but it used --color-neutral-900 -- a token that
                        INVERTS to light in dark mode (confirmed live: the bar and its text all
                        flipped to a light-on-light mess in real dark mode, caught via a real
                        device screenshot). Repointed to real fixed (non-theme-aware) hex literals
                        --gpwa-fixed-dark-* below, matching light mode's own neutral-900/100/400
                        values -- this bar is deliberately theme-INDEPENDENT, so it must not use
                        the theme-inverting neutral scale at all, in either mode. Desktop's own
                        bg-transparent/neutral-700 path (theme-aware, matching the real page
                        background) is unaffected. */}
                    <div id="reserve-bar-terms-notice" className="text-[11px] sm:hidden" style={{ color: 'var(--gpwa-fixed-dark-muted)' }}>
                      By reserving, you agree to our court rules — you&rsquo;ll review and accept them before payment.
                    </div>
                    <div className="hidden sm:block text-[11px] sm:mb-2" style={{ color: 'var(--color-neutral-700)' }}>
                      By reserving, you agree to our court rules — you&rsquo;ll review and accept them before payment.
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-0.5 min-w-[80px] sm:hidden">
                        <div style={{ fontFamily: 'var(--font-body-organic)', fontSize: '10px', letterSpacing: '0.08em', color: 'var(--gpwa-fixed-dark-label)' }}>
                          TOTAL
                        </div>
                        <div className="font-extrabold" style={{ fontSize: '21px', color: 'var(--gpwa-fixed-dark-text)' }}>
                          ₹{calculatePrice()}
                        </div>
                      </div>
                      {orderResult ? (
                        <button
                          onClick={() => navigate('/bookings/my')}
                          className={primaryReserveBtn}
                          id="continue-to-my-bookings-btn"
                        >
                          <span>Continue to My Bookings</span>
                        </button>
                      ) : (
                        <button
                          onClick={handleReserve}
                          disabled={submitting}
                          className={primaryReserveBtn}
                          id="reserve-court-btn"
                        >
                          {submitting ? (
                            <>
                              <LoadingState variant="inline" />
                              <span>Processing Hold...</span>
                            </>
                          ) : selectedSlots.length > 1 ? (
                            <span>Review and Book {selectedSlots.length} Slots</span>
                          ) : (
                            <span>Review and Book</span>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="sm:hidden" style={{ height: '108px' }} />
                </>
              ) : (
                /* 26 Sep 2026 UI-polish batch: hidden on mobile (hidden sm:block) rather than
                   removed outright -- once a slot IS selected, mobile already gets a real fixed
                   bottom bar (below) acting as the de facto "anchored bottom sheet"; rebuilding
                   that working duration-stepper/rate-source/booking-rules panel into a stripped
                   two-row sheet would be a functional rewrite of live reserve logic, not a
                   styling pass, so it's kept intact and just no longer shows empty dead space in
                   the middle of the mobile screen before a slot is picked. Desktop keeps its
                   inline placeholder in the static side column, unchanged. */
                <div
                  className="hidden sm:block p-6 text-center py-16 text-xs font-semibold"
                  style={{
                    background: 'var(--mint-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    fontFamily: 'var(--font-body-organic)',
                    color: 'var(--color-neutral-600)',
                  }}
                >
                  Select one or more availability slots to display pricing details.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
