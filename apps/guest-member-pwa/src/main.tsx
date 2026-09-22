import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiRequest, TenantProvider, useTenant, AuthProvider, useAuth, formatBranchTime } from '@badminton/ui-shared';
import { applyTheme, getStoredTheme } from './lib/theme';

// F-235 Phase 0: apply the stored/OS theme before first paint, so no screen (LoginScreen
// included) ever flashes the wrong light/dark theme before any provider mounts.
applyTheme(getStoredTheme());
import LoginScreen from './components/LoginScreen';
import BranchBooking from './components/BranchBooking';
import BookingPay from './components/BookingPay';
import BookingHistory from './components/BookingHistory';
import BookingConfirmation from './components/BookingConfirmation';
import Shell from './components/Shell';
import LoadingState from './components/ui/LoadingState';
import { AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, Clock, MapPin, Navigation } from 'lucide-react';
import './index.css';

// Capture beforeinstallprompt event globally to avoid React component mounting race conditions
(window as any).__deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  console.log('[GLOBAL] beforeinstallprompt event captured.');
  (window as any).__deferredPrompt = e;
  if ((window as any).__onBeforeInstallPrompt) {
    (window as any).__onBeforeInstallPrompt(e);
  }
});

// Register custom minimal Service Worker for PWA installability
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('Service Worker registered successfully, scope:', reg.scope))
      .catch((err) => console.error('Service Worker registration failed:', err));
  });
}

// Initialize TanStack Query Client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

/**
 * Generic pre-resolve dark band. Tenant identity is not known yet at this point, so this shows a
 * neutral platform wordmark rather than a tenant name/logo.
 */
function StartupBand({ label }: { label: string }) {
  return (
    <div
      className="flex-none flex items-center justify-between"
      style={{ background: 'var(--color-neutral-900)', padding: '15px 18px' }}
    >
      <span style={{ fontFamily: 'var(--font-heading)', fontSize: '19px', color: 'var(--color-bg)' }}>
        Courts
      </span>
      <span
        style={{
          fontFamily: 'var(--font-body-organic)',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.1em',
          color: 'var(--color-neutral-400)',
        }}
      >
        {label}
      </span>
    </div>
  );
}

/** Organic-themed replacement for TenantProvider's default tenant-resolution loading screen. */
function TenantResolveLoading() {
  return <LoadingState variant="full" label="Finding your court" />;
}

/** Organic-themed replacement for TenantProvider's default tenant-not-found screen. */
function TenantResolveError({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <StartupBand label="COURT NOT FOUND" />
      <div className="flex-1 flex items-center justify-center p-4">
        <div
          className="w-full text-center"
          style={{
            maxWidth: '448px',
            background: 'var(--color-neutral-100)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            padding: '32px',
          }}
        >
          <div
            className="mx-auto flex items-center justify-center"
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '999px',
              background: 'var(--color-accent-100)',
              color: 'var(--color-accent-700)',
              marginBottom: '24px',
            }}
          >
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 400,
              fontSize: '24px',
              lineHeight: 1.15,
              color: 'var(--color-text)',
              margin: '0 0 8px',
            }}
          >
            Can&rsquo;t load this venue
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-body-organic)',
              fontSize: '14px',
              lineHeight: 1.55,
              color: 'var(--color-neutral-800)',
              margin: '0 0 24px',
            }}
          >
            We couldn&rsquo;t resolve the branding for this address. In development, check that
            Tenant Management is running and try appending{' '}
            <code
              style={{
                background: 'var(--color-neutral-200)',
                borderRadius: '4px',
                color: 'var(--color-accent-800)',
                fontFamily: 'ui-monospace, monospace',
                padding: '2px 4px',
              }}
            >
              ?tenant=courtowner1
            </code>{' '}
            to the URL.
            {message ? <><br /><span style={{ fontSize: '12px', color: 'var(--color-neutral-600)' }}>{message}</span></> : null}
          </p>
          <a
            href="?tenant=courtowner1"
            className="inline-block w-full"
            style={{
              background: 'var(--color-accent-700)',
              borderRadius: '14px',
              color: 'var(--color-accent-100)',
              fontFamily: 'var(--font-body-organic)',
              fontWeight: 700,
              padding: '12px 16px',
              textDecoration: 'none',
            }}
          >
            Load Courtowner1 (default)
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Main dashboard screen loaded when authenticated.
 */
function MainDashboard() {
  const { tenant } = useTenant();
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();
  // F-133 Slice B: a member may hold more than one ACTIVE batch concurrently (Slice A dropped
  // the one-active-assignment constraint) -- today-assignment now returns one entry per batch.
  // activeAssignmentId is the tab bar's selection; memberSession (derived below) is whichever
  // entry it currently points at, so every existing render below reads the exact same shape as
  // before the array rework.
  const [memberSessions, setMemberSessions] = useState<any[]>([]);
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);
  const [memberSessionLoading, setMemberSessionLoading] = useState(false);
  const [memberSessionError, setMemberSessionError] = useState<string | null>(null);
  const [confirmingAttendance, setConfirmingAttendance] = useState(false);
  const [decliningAttendance, setDecliningAttendance] = useState(false);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const [upcomingError, setUpcomingError] = useState<string | null>(null);
  // F-234: the member-session card's branch (single-fetch shape, mirroring
  // BookingConfirmation.tsx/BookingPay.tsx — one fetch per the CURRENTLY SELECTED batch/tab).
  const [memberSessionBranchAbout, setMemberSessionBranchAbout] = useState<any>(null);
  // F-234: the upcoming-slots card can span more than one branch, so this needs the dedup-map
  // shape (mirroring BookingHistory.tsx's branchAboutById exactly) rather than a single fetch.
  const [branchAboutById, setBranchAboutById] = useState<Record<string, any>>({});

  const memberSession = memberSessions.find((s) => s?.assignmentId === activeAssignmentId) ?? null;

  const loadMemberSession = async () => {
    if (user?.userType !== 'MEMBER' || !accessToken) return;
    try {
      setMemberSessionLoading(true);
      setMemberSessionError(null);
      const res = await apiRequest<any[]>('/slot-engine/member/today-assignment', {
        token: accessToken,
      });
      const sessions = Array.isArray(res) ? res : [];
      setMemberSessions(sessions);
      // Keep the current tab selected if it still exists; otherwise default to the first batch.
      setActiveAssignmentId((prev) =>
        prev && sessions.some((s) => s?.assignmentId === prev) ? prev : (sessions[0]?.assignmentId ?? null),
      );
    } catch (err: any) {
      setMemberSessionError(err.message || 'Unable to load today\'s member session.');
    } finally {
      setMemberSessionLoading(false);
    }
  };

  useEffect(() => {
    loadMemberSession();
  }, [accessToken, user?.userType]);

  // F-234: `memberSession.assignment.resourcePool.branchId` is already in the payload
  // loadMemberSession fetches above — no backend change needed, just reading it.
  useEffect(() => {
    const branchId = memberSession?.assignment?.resourcePool?.branchId;
    if (!branchId) return;
    let isMounted = true;
    apiRequest<any>(`/tenant/branches/${branchId}/about`, { token: accessToken })
      .then((res) => { if (isMounted && res) setMemberSessionBranchAbout(res); })
      .catch(() => { /* leave it null — formatBranchTime falls back to UTC */ });
    return () => { isMounted = false; };
  }, [memberSession?.assignment?.resourcePool?.branchId, accessToken]);

  // F-156: the "Upcoming Slots" card below rendered a hardcoded paragraph from the baseline commit
  // onward — it had never been wired to booking data, so it read "No pre-scheduled matches today"
  // even with a live booking on the books, and the booking only became visible on My Bookings.
  //
  // The register originally described this as a cache or query-invalidation gap. It was not: there
  // was no cache, no query and no fetch. Measured on the deployed dashboard before this change,
  // with a real upcoming booking held: zero requests to /bookings/my from this screen.
  //
  // No invalidation call is needed and none is added. MainDashboard is the `/` route element, so it
  // unmounts on navigation and this effect re-runs on every return to the dashboard.
  const loadUpcoming = async () => {
    if (!accessToken) return;
    try {
      setUpcomingLoading(true);
      setUpcomingError(null);
      const res = await apiRequest<any[]>('/slot-engine/bookings/my', { token: accessToken });
      setUpcoming(Array.isArray(res) ? res : []);
    } catch (err: any) {
      setUpcomingError(err.message || 'Unable to load your upcoming slots.');
    } finally {
      setUpcomingLoading(false);
    }
  };

  useEffect(() => {
    loadUpcoming();
  }, [accessToken]);

  // F-234: dedup-fetch each upcoming booking's own branch (ported from BookingHistory.tsx:24-41
  // verbatim — a guest's upcoming bookings can genuinely span more than one branch, so this is the
  // dedup-map shape, not the single-fetch shape used above for the member-session card).
  useEffect(() => {
    const missingIds = Array.from(new Set(upcoming.map((b) => b.branchId).filter(Boolean)))
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
        .catch(() => { /* leave this branch's timezone absent — formatBranchTime falls back to UTC */ });
    });

    return () => { isMounted = false; };
  }, [upcoming, accessToken]);

  // F-247: same real coordinate-validity check as BookingHistory.tsx/BookingConfirmation.tsx --
  // Number.isFinite, not truthy, since 0/0 is a real point (Gulf of Guinea). branchAboutById
  // already carries the coordinates this needs (fetched above); only the render was missing.
  const hasCoordinates = (about: any) =>
    typeof about?.latitude === 'number' && Number.isFinite(about.latitude) &&
    typeof about?.longitude === 'number' && Number.isFinite(about.longitude);

  // Upcoming = has not started yet, and is still a live booking. CANCELLED and RELEASED_NO_SHOW are
  // excluded. HELD is deliberately included: a hold carries a 5-minute TTL swept server-side
  // (slot-engine/src/index.ts:2944), so a HELD row here is genuinely in flight. Dropping it would
  // blank this card for the seconds between payment and capture — reproducing F-156's exact symptom
  // on a fresh cause.
  const upcomingSlots = upcoming
    .filter((b) => b?.window?.startTime && ['HELD', 'CONFIRMED', 'CHECKED_IN'].includes(b.status))
    .filter((b) => new Date(b.window.startTime).getTime() > Date.now())
    .sort((a, b) => new Date(a.window.startTime).getTime() - new Date(b.window.startTime).getTime());

  // F-192 Slice F: same token families as BookingHistory.getStatusBadge -- amber through the one
  // sanctioned --slot-almostfull-* set, Confirmed sage, Checked-in on the accent ramp.
  const upcomingBadge = (status: string): { label: string; style: React.CSSProperties } => {
    if (status === 'HELD') return {
      label: 'Payment pending',
      style: { background: 'var(--slot-almostfull-surface)', color: 'var(--slot-almostfull-text)', borderColor: 'var(--slot-almostfull-border)' },
    };
    if (status === 'CHECKED_IN') return {
      label: 'Checked in',
      style: { background: 'var(--color-accent-100)', color: 'var(--color-accent-800)', borderColor: 'var(--color-accent-200)' },
    };
    return {
      label: 'Confirmed',
      style: { background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-800)', borderColor: 'var(--color-accent-2-200)' },
    };
  };

  // F-235 Slice A: venue selection now lives inside the merged /book screen itself (a
  // venue-switcher chip, not a separate route), so there's no pre-step branching on whether a
  // branch was previously saved -- /book reads localStorage['selected_branch_id'] itself.
  const handleBookNow = () => {
    navigate('/book');
  };

  const handleConfirmAttendance = async () => {
    if (!activeAssignmentId) return;
    try {
      setConfirmingAttendance(true);
      setMemberSessionError(null);
      await apiRequest('/slot-engine/member/today-assignment/confirm', {
        method: 'POST',
        token: accessToken,
        body: JSON.stringify({ assignmentId: activeAssignmentId }),
      });
      await loadMemberSession();
    } catch (err: any) {
      setMemberSessionError(err.message || 'Attendance confirmation failed.');
      await loadMemberSession();
    } finally {
      setConfirmingAttendance(false);
    }
  };

  // F-133 Slice B: the real explicit "not attending" action -- mirrors handleConfirmAttendance
  // exactly, same assignmentId-scoped POST, same reload-on-settle behaviour either way.
  const handleDeclineAttendance = async () => {
    if (!activeAssignmentId) return;
    try {
      setDecliningAttendance(true);
      setMemberSessionError(null);
      await apiRequest('/slot-engine/member/today-assignment/decline', {
        method: 'POST',
        token: accessToken,
        body: JSON.stringify({ assignmentId: activeAssignmentId }),
      });
      await loadMemberSession();
    } catch (err: any) {
      setMemberSessionError(err.message || 'Marking attendance as declined failed.');
      await loadMemberSession();
    } finally {
      setDecliningAttendance(false);
    }
  };

  const renderMemberSessionCard = () => {
    if (user?.userType !== 'MEMBER') return null;

    const booking = memberSession?.booking;
    const windowStartIso = memberSession?.window?.startTime ?? null;
    const poolName = memberSession?.assignment?.resourcePool?.name;
    const branchTimezone = memberSessionBranchAbout?.timezone;
    const isConfirmed = booking?.status === 'CONFIRMED' && !!booking?.memberAttendanceConfirmedAt;
    const isDeclined = booking?.status === 'RELEASED_NO_SHOW';
    const canConfirm = !!memberSession?.canConfirm;
    const canDecline = !!memberSession?.canDecline;
    // F-133 Slice B: a tab per batch -- shown only once there's more than one, so a single-batch
    // member (still the common case, and the real e2e fixture) sees exactly the same card as
    // before this rework, no tab bar at all.
    const showTabs = memberSessions.length > 1;

    return (
      <section className="p-6 rounded-2xl space-y-4" style={{ background: 'var(--color-neutral-100)', border: '1px solid var(--color-neutral-300)' }} id="member-session-card">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wider font-bold" style={{ color: 'var(--color-accent-700)' }}>Member Attendance</p>
            <h3 className="text-xl" style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, color: 'var(--color-text)' }}>Today&apos;s Member Session</h3>
          </div>
          <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-accent-100)', color: 'var(--color-accent-700)' }}>
            <Clock className="h-5 w-5" />
          </div>
        </div>

        {showTabs ? (
          <div className="flex gap-2 overflow-x-auto" id="member-batch-tabs">
            {memberSessions.map((session) => {
              const isActive = session.assignmentId === activeAssignmentId;
              const label = session.assignment?.resourcePool?.name || 'Batch';
              return (
                <button
                  key={session.assignmentId}
                  type="button"
                  onClick={() => setActiveAssignmentId(session.assignmentId)}
                  className="rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap"
                  style={
                    isActive
                      ? { background: 'var(--color-accent-700)', color: 'var(--color-accent-100)' }
                      : { background: 'var(--color-neutral-200)', color: 'var(--color-neutral-700)' }
                  }
                  data-assignment-id={session.assignmentId}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : null}

        {memberSessionLoading ? (
          <LoadingState variant="compact" label="Loading today's session…" />
        ) : null}

        {memberSessionError ? (
          <div className="flex items-center gap-2 rounded-xl p-3 text-sm" style={{ background: 'var(--color-neutral-100)', border: '1px solid var(--color-neutral-300)', color: 'var(--color-destructive)' }}>
            <AlertTriangle className="h-4 w-4" />{memberSessionError}
          </div>
        ) : null}

        {memberSession?.state === 'HAS_SESSION' ? (
          <div className="space-y-4">
            <div className="grid gap-2 text-sm" style={{ color: 'var(--color-neutral-600)' }}>
              <div className="flex justify-between gap-4"><span>Slot</span><span className="font-semibold" style={{ color: 'var(--color-text)' }}>{poolName}</span></div>
              <div className="flex justify-between gap-4"><span>Time</span><span className="font-semibold" style={{ color: 'var(--color-text)' }}>{windowStartIso ? formatBranchTime(windowStartIso, branchTimezone, { hour: '2-digit', minute: '2-digit' }) : memberSession.assignment?.startTime}</span></div>
              {memberSession.cutoffTime ? <div className="flex justify-between gap-4"><span>Confirm before</span><span className="font-semibold" style={{ color: 'var(--color-text)' }}>{formatBranchTime(memberSession.cutoffTime, branchTimezone, { hour: '2-digit', minute: '2-digit' })}</span></div> : null}
            </div>
            {isConfirmed ? (
              <div className="flex items-center gap-2 rounded-xl p-3 text-sm" style={{ background: 'var(--color-accent-2-100)', border: '1px solid var(--color-accent-2-200)', color: 'var(--color-accent-2-800)' }}>
                <CheckCircle className="h-4 w-4" />Attendance confirmed
              </div>
            ) : isDeclined ? (
              <div className="flex items-center gap-2 rounded-xl p-3 text-sm" style={{ background: 'var(--slot-almostfull-surface)', border: '1px solid var(--slot-almostfull-border)', color: 'var(--slot-almostfull-text)' }}>
                {/* F-133 Slice B real bug fix: RELEASED_NO_SHOW no longer always means "cutoff
                    passed" -- it's now also the real state of an explicit pre-cutoff decline,
                    which canConfirm (still true before cutoff) distinguishes from the sweep's
                    post-cutoff release. */}
                <AlertTriangle className="h-4 w-4" />{canConfirm ? 'Marked as not attending' : 'Confirmation cutoff passed'}
              </div>
            ) : null}
            {(canConfirm || canDecline) ? (
              <div className="flex gap-3">
                {canConfirm ? (
                  <button
                    className="flex-1 rounded-2xl px-5 py-3 font-bold disabled:opacity-60"
                    style={{ background: 'var(--color-accent-700)', color: 'var(--color-accent-100)' }}
                    disabled={confirmingAttendance || decliningAttendance}
                    onClick={handleConfirmAttendance}
                    id="confirm-member-attendance-btn"
                  >
                    {confirmingAttendance ? 'Confirming...' : 'I am coming'}
                  </button>
                ) : null}
                {canDecline ? (
                  <button
                    className="flex-1 rounded-2xl px-5 py-3 font-bold disabled:opacity-60"
                    style={{ background: 'var(--color-neutral-200)', color: 'var(--color-neutral-700)' }}
                    disabled={confirmingAttendance || decliningAttendance}
                    onClick={handleDeclineAttendance}
                    id="decline-member-attendance-btn"
                  >
                    {decliningAttendance ? 'Updating...' : 'Not attending'}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {memberSession?.state === 'NO_SESSION_TODAY' ? (
          <p className="text-sm" style={{ color: 'var(--color-neutral-600)' }}>No recurring member session is scheduled for you today.</p>
        ) : null}
        {!memberSessionLoading && !memberSessionError && memberSessions.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-neutral-600)' }}>No active recurring member assignment is linked to this account.</p>
        ) : null}
        {memberSession?.state === 'SUBSCRIPTION_INACTIVE' ? (
          <p className="text-sm" style={{ color: 'var(--slot-almostfull-text)' }}>Your recurring slot is paused because the subscription is not active.</p>
        ) : null}
        {memberSession?.state === 'WINDOW_NOT_FOUND' ? (
          // F-178: no longer a single cause (F-170/F-172 route two more into this state), and the
          // server doesn't distinguish them at this state — see resolveAssignmentToday in
          // slot-engine's index.ts. Neutral copy, matching the admin attendance view's identical
          // 'Window not found' answer to the same ambiguity (index.ts:797).
          <p className="text-sm" style={{ color: 'var(--slot-almostfull-text)' }}>No session found for today.</p>
        ) : null}
      </section>
    );
  };

  return (
    <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* F-235 Slice E: trimmed hero -- the real mockup's Home/Dashboard artboard has no gradient
          hero block; its top bar is just the header avatar (Shell.tsx, unchanged) plus a greeting.
          The tenant pill + "Welcome back" heading are kept (not in the mockup's own text, but this
          exact heading text is asserted by real Playwright specs -- guest-booking.spec.ts,
          pwa-install-dismissal.spec.ts -- so it stays, just trimmed of the old gradient/subtext/
          two-button hero treatment that's being replaced by the sections below). */}
      <div className="space-y-2">
        <div
          className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider"
          style={{ background: 'var(--color-accent-100)', color: 'var(--color-accent-700)', fontFamily: 'var(--font-body-organic)' }}
        >
          <MapPin className="h-3.5 w-3.5" />
          <span>{tenant?.name}</span>
        </div>
        {/* F-285: the "Welcome back to {tenant}" heading below is left completely untouched --
            its exact text is asserted by real Playwright specs (see the comment above this
            block). The first-name greeting is a separate line instead of being worked into that
            sentence, so it adds real personalization with zero risk to those assertions. No
            separate first-name field exists on the token -- split displayName client-side, same
            fallback chain AccountSheet.tsx already establishes for when it's unset. */}
        {(user?.displayName || user?.name || user?.email) && (
          <p className="text-sm font-semibold" style={{ color: 'var(--color-accent-700)', fontFamily: 'var(--font-body-organic)' }}>
            {`Hi, ${(user?.displayName || user?.name || user?.email || '').split(' ')[0]}`}
          </p>
        )}
        <h2 className="text-3xl md:text-4xl" style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, lineHeight: 1.1, color: 'var(--color-text)' }}>
          Welcome back to <span style={{ color: 'var(--color-accent-700)' }}>{tenant?.appName}</span>
        </h2>
      </div>

      {renderMemberSessionCard()}

      {user?.userType === 'MEMBER' && activeAssignmentId ? (
        <MemberCalendarCard assignmentId={activeAssignmentId} accessToken={accessToken} />
      ) : null}

      {/* F-235 Slice E: primary new-booking action -- real mockup structure confirmed via the
          canvas's own code inspector: a Button sits directly below the session card, ahead of the
          bookings list. handleBookNow/navigate('/book') unchanged, same id Playwright specs
          (findings-verification, guest-booking) already click. */}
      <button
        onClick={handleBookNow}
        className="w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors"
        style={{ background: 'var(--color-accent-2-400)', color: 'var(--color-neutral-900)', fontFamily: 'var(--font-body-organic)' }}
        id="book-court-dashboard-btn"
      >
        <span>{user?.userType === 'MEMBER' ? '+ Book as Guest' : '+ New Booking'}</span>
      </button>

      {/* F-235 Slice E: "My Bookings" -- the mockup's real bookings-list body. Reuses upcomingSlots'
          existing fetch/dedup/sort/filter logic unchanged (a layout change, not a new data
          source) -- HELD is still deliberately included, see the F-156 comment above. */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg" style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, color: 'var(--color-text)' }}>
            My Bookings
          </h3>
          <Link
            to="/bookings/my"
            className="text-xs font-semibold hover:underline"
            style={{ color: 'var(--color-accent-700)' }}
            id="view-my-bookings-btn"
          >
            View all
          </Link>
        </div>

        {upcomingLoading ? (
          <LoadingState variant="compact" label="Loading your upcoming slots…" />
        ) : upcomingError ? (
          <p className="text-xs" style={{ color: 'var(--color-destructive)' }} id="upcoming-slots-error">{upcomingError}</p>
        ) : upcomingSlots.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--color-neutral-600)' }} id="upcoming-slots-empty">
            No pre-scheduled matches today. Tap {user?.userType === 'MEMBER' ? '"+ Book as Guest"' : '"+ New Booking"'} to search for court times.
          </p>
        ) : (
          <div className="space-y-2" id="upcoming-slots-list">
            {upcomingSlots.slice(0, 3).map((b) => {
              const timezone = branchAboutById[b.branchId]?.timezone;
              const badge = upcomingBadge(b.status);
              const about = branchAboutById[b.branchId];
              return (
                <div
                  key={b.id}
                  id={`upcoming-slot-${b.id}`}
                  className="rounded-xl p-3 space-y-1"
                  style={{ background: 'var(--color-neutral-100)', border: '1px solid var(--color-neutral-300)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold truncate" style={{ color: 'var(--color-text)' }}>
                      {b.window.resourcePool?.name || 'Court booking'}
                    </span>
                    <span className="shrink-0 text-[10px] font-bold font-mono uppercase px-2 py-0.5 rounded-full border" style={badge.style}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-mono" style={{ color: 'var(--color-neutral-600)' }}>
                      {formatBranchTime(b.window.startTime, timezone, { weekday: 'short', month: 'short', day: 'numeric' })}
                      {' · '}
                      {formatBranchTime(b.window.startTime, timezone, { hour: '2-digit', minute: '2-digit' })}
                      {' - '}
                      {formatBranchTime(b.window.endTime, timezone, { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* F-247: same real Directions link BookingHistory.tsx already has --
                          branchAboutById already carries the coordinates, only the render was
                          missing here. */}
                      {about && hasCoordinates(about) && (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${about.latitude},${about.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Directions"
                          className="inline-flex items-center"
                          style={{ color: 'var(--color-accent-700)' }}
                        >
                          <Navigation className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {/* F-242: a HELD row here had no way to complete payment without an extra
                          navigation to My Bookings first -- same pay-now-btn pattern
                          BookingHistory.tsx already uses. */}
                      {b.status === 'HELD' && (
                        <Link
                          to={`/bookings/${b.id}/pay`}
                          className="text-[11px] font-semibold px-2.5 py-1 rounded-lg shrink-0"
                          style={{ background: 'var(--color-accent-700)', color: 'var(--color-accent-100)' }}
                          id={`pay-now-btn-${b.id}`}
                        >
                          Pay Now
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {upcomingSlots.length > 3 && (
              <Link
                to="/bookings/my"
                className="block text-[11px] font-semibold hover:underline pt-1"
                style={{ color: 'var(--color-accent-700)' }}
                id="upcoming-slots-view-all"
              >
                View all {upcomingSlots.length} upcoming slots
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// F-133 Slice C — a real month's worth of day-status for the currently active batch tab (Slice
// B's activeAssignmentId, same id). Scoped to one assignment at a time, matching "tabs scope the
// calendar to whichever batch tab is active, same as landing". Four visually distinct states per
// the decided derivation (memberAttendanceConfirmedAt/DeclinedAt, never CHECKED_IN); a real "not
// enough history yet" empty state when the server reports no session has occurred yet.
const CALENDAR_STATE_STYLE: Record<string, React.CSSProperties> = {
  ATTENDED: { background: 'var(--color-accent-2-500, #16a34a)', color: '#fff' },
  DECLINED: { background: 'var(--slot-almostfull-surface)', color: 'var(--slot-almostfull-text)', border: '1px solid var(--slot-almostfull-border)' },
  NO_RESPONSE: { background: 'var(--color-destructive, #dc2626)', color: '#fff' },
  NO_DATA: { background: 'var(--color-neutral-200)', color: 'var(--color-neutral-400)' },
};

function MemberCalendarCard({ assignmentId, accessToken }: { assignmentId: string; accessToken: string | null }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [days, setDays] = useState<{ date: string; state: string }[]>([]);
  const [hasEnoughHistory, setHasEnoughHistory] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monthDate = new Date();
  monthDate.setUTCMonth(monthDate.getUTCMonth() + monthOffset, 1);
  const monthStr = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, '0')}`;

  useEffect(() => {
    if (!assignmentId || !accessToken) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiRequest<{ days: { date: string; state: string }[]; hasEnoughHistory: boolean }>(
      `/slot-engine/member/calendar?assignmentId=${assignmentId}&month=${monthStr}`,
      { token: accessToken },
    )
      .then((res) => {
        if (cancelled) return;
        setDays(res?.days ?? []);
        setHasEnoughHistory(!!res?.hasEnoughHistory);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message || 'Unable to load calendar.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assignmentId, accessToken, monthStr]);

  // Reset to the current month whenever the active batch tab changes -- a stale month offset
  // from a previously-viewed batch should not carry over.
  useEffect(() => {
    setMonthOffset(0);
  }, [assignmentId]);

  const leadingBlanks = days[0] ? new Date(`${days[0].date}T00:00:00Z`).getUTCDay() : 0;
  const monthLabel = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <section className="p-6 rounded-2xl space-y-4" style={{ background: 'var(--color-neutral-100)', border: '1px solid var(--color-neutral-300)' }} id="member-calendar-card">
      <div className="flex items-center justify-between">
        <button type="button" aria-label="Previous month" onClick={() => setMonthOffset((m) => m - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-neutral-600)' }}>
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="font-semibold" style={{ color: 'var(--color-text)' }}>{monthLabel}</p>
        <button type="button" aria-label="Next month" onClick={() => setMonthOffset((m) => m + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-neutral-600)' }}>
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {loading ? <LoadingState variant="compact" label="Loading calendar…" /> : null}
      {error ? (
        <div className="flex items-center gap-2 rounded-xl p-3 text-sm" style={{ background: 'var(--color-neutral-100)', border: '1px solid var(--color-neutral-300)', color: 'var(--color-destructive)' }}>
          <AlertTriangle className="h-4 w-4" />{error}
        </div>
      ) : null}

      {!loading && !error && !hasEnoughHistory ? (
        <p className="text-sm" id="calendar-not-enough-history" style={{ color: 'var(--color-neutral-600)' }}>
          Not enough history yet — check back after your first session.
        </p>
      ) : null}

      {!loading && !error && hasEnoughHistory ? (
        <div className="grid grid-cols-7 gap-1" id="calendar-grid">
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} />
          ))}
          {days.map((d) => (
            <div
              key={d.date}
              title={`${d.date}: ${d.state}`}
              data-date={d.date}
              data-state={d.state}
              style={{
                ...CALENDAR_STATE_STYLE[d.state],
                borderRadius: 8,
                aspectRatio: '1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {Number(d.date.slice(8, 10))}
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex gap-3 flex-wrap text-xs" style={{ color: 'var(--color-neutral-600)' }}>
        <span className="flex items-center gap-1"><span style={{ ...CALENDAR_STATE_STYLE.ATTENDED, width: 10, height: 10, borderRadius: 3, display: 'inline-block' }} />Attended</span>
        <span className="flex items-center gap-1"><span style={{ ...CALENDAR_STATE_STYLE.DECLINED, width: 10, height: 10, borderRadius: 3, display: 'inline-block' }} />Declined</span>
        <span className="flex items-center gap-1"><span style={{ ...CALENDAR_STATE_STYLE.NO_RESPONSE, width: 10, height: 10, borderRadius: 3, display: 'inline-block' }} />No response</span>
        <span className="flex items-center gap-1"><span style={{ ...CALENDAR_STATE_STYLE.NO_DATA, width: 10, height: 10, borderRadius: 3, display: 'inline-block' }} />No data</span>
      </div>
    </section>
  );
}

function AuthLoadingSpinner() {
  return <LoadingState variant="full" />;
}

/**
 * Route protection wrapper for the real app. Redirects unauthenticated users to /login.
 * F-235 Slice D: no more phone-presence check/redirect here -- a fresh Google signup with no
 * phone on file goes straight to the dashboard now; phone capture moved to its real point of
 * need (Reserve, via VerifyPhoneDialog's phone-entry mode).
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return <AuthLoadingSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/**
 * App Router structure.
 */
function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route
        element={
          <ProtectedRoute>
            <Shell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<MainDashboard />} />
        <Route path="/book" element={<BranchBooking />} />
        <Route path="/bookings/:bookingId/pay" element={<BookingPay />} />
        <Route path="/bookings/:bookingId/confirmation" element={<BookingConfirmation />} />
        <Route path="/bookings/my" element={<BookingHistory />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// WHY: Entry point wrapping Router, TanStack Query, and Context Providers.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <TenantProvider
        loadingFallback={<TenantResolveLoading />}
        errorFallback={(message) => <TenantResolveError message={message} />}
        // F-235 Phase 0 Correction 5: --color-neutral-100's real dark-mode value (index.css) --
        // the background Shell's active-nav-item and AccountSheet's active-segment render their
        // --color-accent-emphasis text against. Computed per-tenant, see TenantContext.tsx.
        emphasisBackgrounds={{ dark: '#201d17' }}
      >
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </TenantProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
