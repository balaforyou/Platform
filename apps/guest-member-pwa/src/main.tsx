import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiRequest, TenantProvider, useTenant, AuthProvider, useAuth } from '@badminton/ui-shared';
import LoginScreen from './components/LoginScreen';
import PwaInstallPrompt from './components/PwaInstallPrompt';
import BranchSelect from './components/BranchSelect';
import BranchDashboard from './components/BranchDashboard';
import BranchAbout from './components/BranchAbout';
import CourtBooking from './components/CourtBooking';
import BookingPay from './components/BookingPay';
import BookingHistory from './components/BookingHistory';
import BookingConfirmation from './components/BookingConfirmation';
import { AlertTriangle, Calendar, CheckCircle, Clock, User, LogOut, ArrowRight, MapPin, Phone, RefreshCw } from 'lucide-react';
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

function formatUserContact(user: any) {
  return user?.phone || 'Phone not available';
}

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
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <style>{'@keyframes organic-tenant-spin { to { transform: rotate(360deg); } }'}</style>
      <StartupBand label="STARTING UP" />
      <div className="flex-1 flex flex-col items-center justify-center gap-[18px] p-8">
        <div
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '999px',
            border: '4px solid var(--color-accent-200)',
            borderTopColor: 'var(--color-accent-700)',
            animation: 'organic-tenant-spin 1s linear infinite',
          }}
        />
        <div
          style={{
            fontFamily: 'var(--font-body-organic)',
            fontSize: '14.5px',
            fontWeight: 600,
            color: 'var(--color-neutral-800)',
          }}
        >
          Finding your court
        </div>
      </div>
    </div>
  );
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

/** Uppercase state label for the shared dark band, by route. */
function bandLabelForPath(pathname: string): string {
  if (pathname === '/') return 'HOME';
  if (pathname === '/branches') return 'CHOOSE A VENUE';
  if (pathname === '/bookings/my') return 'MY BOOKINGS';
  if (/^\/branches\/[^/]+\/about$/.test(pathname)) return 'VENUE INFO';
  if (/^\/branches\/[^/]+\/book\//.test(pathname)) return 'BOOK A COURT';
  if (/^\/branches\/[^/]+$/.test(pathname)) return 'COURT CATEGORIES';
  if (/^\/bookings\/[^/]+\/pay$/.test(pathname)) return 'CONFIRM AND PAY';
  if (/^\/bookings\/[^/]+\/confirmation$/.test(pathname)) return 'CONFIRMED';
  return '';
}

/**
 * Shared Layout wrapper containing navbar, footer, and PwaInstallPrompt.
 */
function Layout() {
  const { tenant } = useTenant();
  const { logout } = useAuth();
  const { pathname } = useLocation();
  const stateLabel = bandLabelForPath(pathname);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>
      {/* Shared dark band -- identical chrome on every authenticated screen */}
      <header
        className="sticky top-0 z-50 w-full"
        style={{ background: 'var(--color-neutral-900)' }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between" style={{ padding: '15px 18px' }}>
          <Link to="/" className="flex items-center gap-3 group" aria-label="Home">
            {tenant?.logo ? (
              <img src={tenant.logo} alt={tenant.appName} className="h-8 w-auto object-contain rounded" />
            ) : (
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: '19px', color: 'var(--color-bg)' }}>
                {tenant?.appName || 'Courts'}
              </span>
            )}
          </Link>

          <div className="flex items-center gap-3">
            {stateLabel && (
              <span
                className="hidden sm:inline"
                style={{
                  fontFamily: 'var(--font-body-organic)',
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  color: 'var(--color-neutral-400)',
                }}
              >
                {stateLabel}
              </span>
            )}
            <Link
              to="/bookings/my"
              id="nav-my-bookings-btn"
              className="transition-colors"
              style={{ fontFamily: 'var(--font-body-organic)', fontSize: '12px', fontWeight: 600, color: 'var(--color-neutral-400)' }}
            >
              My Bookings
            </Link>
            <button
              onClick={logout}
              title="Logout"
              id="logout-btn"
              className="flex items-center justify-center flex-none transition-colors"
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '999px',
                background: 'var(--color-neutral-800)',
                border: '1px solid var(--color-neutral-700)',
                color: 'var(--color-accent-300)',
              }}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Shared Page Outlet */}
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>

      {/* Footer */}
      <footer
        className="py-6 text-center"
        style={{
          borderTop: '1px solid var(--color-neutral-300)',
          background: 'var(--color-bg)',
          color: 'var(--color-neutral-600)',
          fontFamily: 'var(--font-body-organic)',
          fontSize: '12px',
        }}
      >
        &copy; 2026 {tenant?.name}. Powered by Whitelabel Badminton Platform.
      </footer>
      <PwaInstallPrompt />
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
  const [memberSession, setMemberSession] = useState<any | null>(null);
  const [memberSessionLoading, setMemberSessionLoading] = useState(false);
  const [memberSessionError, setMemberSessionError] = useState<string | null>(null);
  const [confirmingAttendance, setConfirmingAttendance] = useState(false);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const [upcomingError, setUpcomingError] = useState<string | null>(null);

  const loadMemberSession = async () => {
    if (user?.userType !== 'MEMBER' || !accessToken) return;
    try {
      setMemberSessionLoading(true);
      setMemberSessionError(null);
      const res = await apiRequest('/slot-engine/member/today-assignment', {
        token: accessToken,
      });
      setMemberSession(res);
    } catch (err: any) {
      setMemberSessionError(err.message || 'Unable to load today\'s member session.');
    } finally {
      setMemberSessionLoading(false);
    }
  };

  useEffect(() => {
    loadMemberSession();
  }, [accessToken, user?.userType]);

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

  const handleBookNow = () => {
    const savedBranch = localStorage.getItem('selected_branch_id');
    if (savedBranch) {
      navigate(`/branches/${savedBranch}`);
    } else {
      navigate('/branches');
    }
  };

  const handleConfirmAttendance = async () => {
    try {
      setConfirmingAttendance(true);
      setMemberSessionError(null);
      await apiRequest('/slot-engine/member/today-assignment/confirm', {
        method: 'POST',
        token: accessToken,
      });
      await loadMemberSession();
    } catch (err: any) {
      setMemberSessionError(err.message || 'Attendance confirmation failed.');
      await loadMemberSession();
    } finally {
      setConfirmingAttendance(false);
    }
  };

  const renderMemberSessionCard = () => {
    if (user?.userType !== 'MEMBER') return null;

    const booking = memberSession?.booking;
    const windowStart = memberSession?.window?.startTime ? new Date(memberSession.window.startTime) : null;
    const poolName = memberSession?.assignment?.resourcePool?.name;

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

        {memberSessionLoading ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-neutral-600)' }}><RefreshCw className="h-4 w-4 animate-spin" />Loading today&apos;s session</div>
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
              <div className="flex justify-between gap-4"><span>Time</span><span className="font-semibold" style={{ color: 'var(--color-text)' }}>{windowStart ? windowStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : memberSession.assignment?.startTime}</span></div>
              {memberSession.cutoffTime ? <div className="flex justify-between gap-4"><span>Confirm before</span><span className="font-semibold" style={{ color: 'var(--color-text)' }}>{new Date(memberSession.cutoffTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div> : null}
            </div>
            {booking?.memberAttendanceConfirmedAt ? (
              <div className="flex items-center gap-2 rounded-xl p-3 text-sm" style={{ background: 'var(--color-accent-2-100)', border: '1px solid var(--color-accent-2-200)', color: 'var(--color-accent-2-800)' }}>
                <CheckCircle className="h-4 w-4" />Attendance confirmed
              </div>
            ) : booking?.status === 'RELEASED_NO_SHOW' ? (
              <div className="flex items-center gap-2 rounded-xl p-3 text-sm" style={{ background: 'var(--slot-almostfull-surface)', border: '1px solid var(--slot-almostfull-border)', color: 'var(--slot-almostfull-text)' }}>
                <AlertTriangle className="h-4 w-4" />Confirmation cutoff passed
              </div>
            ) : (
              <button
                className="w-full rounded-2xl px-5 py-3 font-bold disabled:opacity-60"
                style={{ background: 'var(--color-accent-700)', color: 'var(--color-accent-100)' }}
                disabled={!memberSession.canConfirm || confirmingAttendance}
                onClick={handleConfirmAttendance}
                id="confirm-member-attendance-btn"
              >
                {confirmingAttendance ? 'Confirming...' : 'I am coming'}
              </button>
            )}
          </div>
        ) : null}

        {memberSession?.state === 'NO_SESSION_TODAY' ? (
          <p className="text-sm" style={{ color: 'var(--color-neutral-600)' }}>No recurring member session is scheduled for you today.</p>
        ) : null}
        {memberSession?.state === 'NO_ACTIVE_ASSIGNMENT' ? (
          <p className="text-sm" style={{ color: 'var(--color-neutral-600)' }}>No active recurring member assignment is linked to this account.</p>
        ) : null}
        {memberSession?.state === 'SUBSCRIPTION_INACTIVE' ? (
          <p className="text-sm" style={{ color: 'var(--slot-almostfull-text)' }}>Your recurring slot is paused because the subscription is not active.</p>
        ) : null}
        {memberSession?.state === 'WINDOW_NOT_FOUND' ? (
          // F-178: no longer a single cause (F-170/F-172 route two more into this state), and the
          // server doesn't distinguish them at this state — see resolveTodayMemberAssignment in
          // slot-engine's index.ts. Neutral copy, matching the admin attendance view's identical
          // 'Window not found' answer to the same ambiguity (index.ts:797).
          <p className="text-sm" style={{ color: 'var(--slot-almostfull-text)' }}>No session found for today.</p>
        ) : null}
      </section>
    );
  };

  return (
    <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      {/* F-192 Slice F: hero -- gradient/shadow-2xl dropped, plain column on the Layout cream ground. */}
      <div className="space-y-4">
        <div
          className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider"
          style={{ background: 'var(--color-accent-100)', color: 'var(--color-accent-700)', fontFamily: 'var(--font-body-organic)' }}
        >
          <MapPin className="h-3.5 w-3.5" />
          <span>{tenant?.name}</span>
        </div>
        <h2 className="text-4xl md:text-5xl" style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, lineHeight: 1.1, color: 'var(--color-text)' }}>
          Welcome back to <span style={{ color: 'var(--color-accent-700)' }}>{tenant?.appName}</span>
        </h2>
        <p className="text-sm md:text-base leading-relaxed" style={{ fontFamily: 'var(--font-body-organic)', color: 'var(--color-neutral-700)' }}>
          Coimbatore's premium court booking platform. Find slots, book courts, and manage your matches.
        </p>
        <div className="pt-2 flex flex-wrap gap-4">
          <button
            onClick={handleBookNow}
            className="py-3 px-6 rounded-2xl font-semibold flex items-center space-x-2 transition-colors"
            style={{ background: 'var(--color-accent-700)', color: 'var(--color-accent-100)', fontFamily: 'var(--font-body-organic)' }}
            id="book-court-dashboard-btn"
          >
            <span>Book Court Now</span>
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => navigate('/bookings/my')}
            className="py-3 px-6 rounded-2xl font-semibold transition-colors"
            style={{ background: '#fff', border: '1px solid var(--color-neutral-300)', color: 'var(--color-text)', fontFamily: 'var(--font-body-organic)' }}
            id="view-my-bookings-btn"
          >
            View My Bookings
          </button>
        </div>
      </div>

      {renderMemberSessionCard()}

      {/* Dashboard Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl space-y-4" style={{ background: 'var(--color-neutral-100)', border: '1px solid var(--color-neutral-300)' }}>
          <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-accent-100)', color: 'var(--color-accent-700)' }}>
            <Calendar className="h-5 w-5" />
          </div>
          <h3 className="text-lg" style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, color: 'var(--color-text)' }}>Upcoming Slots</h3>

          {upcomingLoading ? (
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-neutral-600)' }}>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />Loading your upcoming slots
            </div>
          ) : upcomingError ? (
            <p className="text-xs" style={{ color: 'var(--color-destructive)' }} id="upcoming-slots-error">{upcomingError}</p>
          ) : upcomingSlots.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--color-neutral-600)' }} id="upcoming-slots-empty">
              No pre-scheduled matches today. Click "Book Court Now" to search for court times.
            </p>
          ) : (
            <div className="space-y-2" id="upcoming-slots-list">
              {upcomingSlots.slice(0, 3).map((b) => {
                const start = new Date(b.window.startTime);
                const end = new Date(b.window.endTime);
                const badge = upcomingBadge(b.status);
                return (
                  <div
                    key={b.id}
                    id={`upcoming-slot-${b.id}`}
                    className="rounded-xl p-3 space-y-1"
                    style={{ background: '#fff', border: '1px solid var(--color-neutral-300)' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold truncate" style={{ color: 'var(--color-text)' }}>
                        {b.window.resourcePool?.name || 'Court booking'}
                      </span>
                      <span className="shrink-0 text-[10px] font-bold font-mono uppercase px-2 py-0.5 rounded-full border" style={badge.style}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono" style={{ color: 'var(--color-neutral-600)' }}>
                      {start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                      {' · '}
                      {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {' - '}
                      {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
        </div>

        <div className="p-6 rounded-2xl space-y-4" style={{ background: 'var(--color-neutral-100)', border: '1px solid var(--color-neutral-300)' }}>
          <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-accent-100)', color: 'var(--color-accent-700)' }}>
            <User className="h-5 w-5" />
          </div>
          <h3 className="text-lg" style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, color: 'var(--color-text)' }}>Profile Details</h3>
          <div className="text-xs space-y-2 font-mono" style={{ color: 'var(--color-neutral-600)' }}>
            <div className="flex justify-between">
              <span>Signed in as:</span>
              <span style={{ color: 'var(--color-text)' }}>{formatUserContact(user)}</span>
            </div>
            <div className="flex justify-between">
              <span>Account type:</span>
              <span style={{ color: 'var(--color-accent-700)' }}>{user?.roles?.[0] || 'member'}</span>
            </div>
          </div>
        </div>

        <div className="p-6 rounded-2xl space-y-4" style={{ background: 'var(--color-neutral-100)', border: '1px solid var(--color-neutral-300)' }}>
          <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-accent-100)', color: 'var(--color-accent-700)' }}>
            <Phone className="h-5 w-5" />
          </div>
          <h3 className="text-lg" style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, color: 'var(--color-text)' }}>Support & Info</h3>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-neutral-600)' }}>
            If you have any feedback or require front desk support, reach out using the in-app chat or call our Coimbatore venue manager directly.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Route protection wrapper. Redirects unauthenticated users to /login.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <RefreshCw className="h-8 w-8 animate-spin" style={{ color: 'var(--color-accent-700)' }} />
      </div>
    );
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
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
            <Layout />
          </ProtectedRoute>
        } 
      >
        <Route path="/" element={<MainDashboard />} />
        <Route path="/branches" element={<BranchSelect />} />
        <Route path="/branches/:branchId" element={<BranchDashboard />} />
        <Route path="/branches/:branchId/about" element={<BranchAbout />} />
        <Route path="/branches/:branchId/book/:poolId" element={<CourtBooking />} />
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
