import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Link, Outlet, useNavigate } from 'react-router-dom';
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
import { AlertTriangle, Calendar, CheckCircle, Clock, User, LogOut, ArrowRight, Activity, MapPin, Phone, RefreshCw } from 'lucide-react';
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
 * Shared Layout wrapper containing navbar, footer, and PwaInstallPrompt.
 */
function Layout() {
  const { tenant } = useTenant();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-surface-alt text-ink flex flex-col">
      {/* Header / Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-edge bg-surface-header backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-3 group">
            {tenant?.logo ? (
              <img src={tenant.logo} alt={tenant.appName} className="h-8 w-auto object-contain rounded" />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/20 flex items-center justify-center text-[var(--brand-primary)]">
                <span className="font-extrabold text-sm">{tenant?.appName?.[0]?.toUpperCase()}</span>
              </div>
            )}
            <span className="font-bold text-lg tracking-wider uppercase font-outfit group-hover:text-[var(--brand-primary)] transition-colors">
              {tenant?.appName}
            </span>
          </Link>

          <div className="flex items-center space-x-4">
            <Link to="/bookings/my" className="text-xs text-ink-muted hover:text-ink transition-colors font-semibold" id="nav-my-bookings-btn">
              My Bookings
            </Link>
            <div className="flex items-center space-x-2 bg-surface-mint px-3 py-1.5 rounded-full border border-edge text-xs text-ink-muted">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
              <span>{user?.roles?.join(', ') || 'member'}</span>
            </div>
            <button
              onClick={logout}
              className="p-2 rounded-full bg-surface-mint hover:bg-red-50 text-ink-muted hover:text-red-700 border border-edge transition-all"
              title="Logout"
              id="logout-btn"
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
      <footer className="py-6 border-t border-edge bg-surface-alt text-center text-xs text-ink-muted font-medium">
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

  const upcomingBadge = (status: string) => {
    if (status === 'HELD') return { label: 'Payment pending', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
    if (status === 'CHECKED_IN') return { label: 'Checked in', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
    return { label: 'Confirmed', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
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
      <section className="bg-surface-mint p-6 rounded-2xl border border-edge space-y-4" id="member-session-card">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-[var(--brand-primary)] font-bold">Member Attendance</p>
            <h3 className="text-xl font-extrabold font-outfit text-ink">Today&apos;s Member Session</h3>
          </div>
          <div className="h-10 w-10 bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/20 rounded-xl flex items-center justify-center text-[var(--brand-primary)]">
            <Clock className="h-5 w-5" />
          </div>
        </div>

        {memberSessionLoading ? (
          <div className="flex items-center gap-2 text-sm text-ink-muted"><RefreshCw className="h-4 w-4 animate-spin" />Loading today&apos;s session</div>
        ) : null}

        {memberSessionError ? (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertTriangle className="h-4 w-4" />{memberSessionError}
          </div>
        ) : null}

        {memberSession?.state === 'HAS_SESSION' ? (
          <div className="space-y-4">
            <div className="grid gap-2 text-sm text-ink-muted">
              <div className="flex justify-between gap-4"><span>Slot</span><span className="text-ink font-semibold">{poolName}</span></div>
              <div className="flex justify-between gap-4"><span>Time</span><span className="text-ink font-semibold">{windowStart ? windowStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : memberSession.assignment?.startTime}</span></div>
              {memberSession.cutoffTime ? <div className="flex justify-between gap-4"><span>Confirm before</span><span className="text-ink font-semibold">{new Date(memberSession.cutoffTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div> : null}
            </div>
            {booking?.memberAttendanceConfirmedAt ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <CheckCircle className="h-4 w-4" />Attendance confirmed
              </div>
            ) : booking?.status === 'RELEASED_NO_SHOW' ? (
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4" />Confirmation cutoff passed
              </div>
            ) : (
              <button
                className="w-full rounded-2xl bg-[var(--brand-primary)] px-5 py-3 font-bold text-white disabled:opacity-60"
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
          <p className="text-sm text-ink-muted">No recurring member session is scheduled for you today.</p>
        ) : null}
        {memberSession?.state === 'NO_ACTIVE_ASSIGNMENT' ? (
          <p className="text-sm text-ink-muted">No active recurring member assignment is linked to this account.</p>
        ) : null}
        {memberSession?.state === 'SUBSCRIPTION_INACTIVE' ? (
          <p className="text-sm text-amber-800">Your recurring slot is paused because the subscription is not active.</p>
        ) : null}
        {memberSession?.state === 'WINDOW_NOT_FOUND' ? (
          // F-178: no longer a single cause (F-170/F-172 route two more into this state), and the
          // server doesn't distinguish them at this state — see resolveTodayMemberAssignment in
          // slot-engine's index.ts. Neutral copy, matching the admin attendance view's identical
          // 'Window not found' answer to the same ambiguity (index.ts:797).
          <p className="text-sm text-amber-800">No session found for today.</p>
        ) : null}
      </section>
    );
  };

  return (
    <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      {/* Hero content */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-tr from-surface-mint to-surface p-8 border border-edge shadow-2xl">
        <div className="absolute right-0 bottom-0 translate-x-1/4 translate-y-1/4 opacity-10">
          <Activity className="h-96 w-96 text-[var(--brand-primary)]" />
        </div>
        
        <div className="relative max-w-lg space-y-4">
          <div className="inline-flex items-center space-x-1 bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/20 text-[var(--brand-primary)] px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider font-outfit">
            <MapPin className="h-3.5 w-3.5" />
            <span>{tenant?.name}</span>
          </div>
          <h2 className="text-4xl font-extrabold tracking-tight font-outfit md:text-5xl">
            Welcome back to <span className="text-[var(--brand-primary)]">{tenant?.appName}</span>
          </h2>
          <p className="text-ink-muted text-sm md:text-base leading-relaxed font-medium">
            Coimbatore's premium court booking platform. Find slots, book courts, and manage your matches.
          </p>
          <div className="pt-2 flex flex-wrap gap-4">
            <button
              onClick={handleBookNow}
              className="py-3 px-6 rounded-2xl bg-[var(--brand-primary)] hover:opacity-95 text-white font-semibold flex items-center space-x-2 transition-all shadow-lg shadow-[var(--brand-primary)]/20"
              id="book-court-dashboard-btn"
            >
              <span>Book Court Now</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => navigate('/bookings/my')}
              className="py-3 px-6 rounded-2xl bg-surface-mint hover:bg-edge text-ink border border-edge-strong font-semibold transition-all"
              id="view-my-bookings-btn"
            >
              View My Bookings
            </button>
          </div>
        </div>
      </div>

      {renderMemberSessionCard()}

      {/* Dashboard Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface-mint p-6 rounded-2xl border border-edge space-y-4">
          <div className="h-10 w-10 bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/20 rounded-xl flex items-center justify-center text-[var(--brand-primary)]">
            <Calendar className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-bold font-outfit text-ink">Upcoming Slots</h3>

          {upcomingLoading ? (
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />Loading your upcoming slots
            </div>
          ) : upcomingError ? (
            <p className="text-xs text-red-700" id="upcoming-slots-error">{upcomingError}</p>
          ) : upcomingSlots.length === 0 ? (
            <p className="text-xs text-ink-muted" id="upcoming-slots-empty">
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
                    className="rounded-xl border border-edge bg-surface p-3 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-ink truncate">
                        {b.window.resourcePool?.name || 'Court booking'}
                      </span>
                      <span className={`shrink-0 text-[10px] font-bold font-mono uppercase px-2 py-0.5 rounded-full border ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-ink-muted font-mono">
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
                  className="block text-[11px] font-semibold text-[var(--brand-primary)] hover:underline pt-1"
                  id="upcoming-slots-view-all"
                >
                  View all {upcomingSlots.length} upcoming slots
                </Link>
              )}
            </div>
          )}
        </div>

        <div className="bg-surface-mint p-6 rounded-2xl border border-edge space-y-4">
          <div className="h-10 w-10 bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/20 rounded-xl flex items-center justify-center text-[var(--brand-primary)]">
            <User className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-bold font-outfit text-ink">Profile Details</h3>
          <div className="text-xs text-ink-muted space-y-2 font-mono">
            <div className="flex justify-between">
              <span>Signed in as:</span>
              <span className="text-ink">{formatUserContact(user)}</span>
            </div>
            <div className="flex justify-between">
              <span>Account type:</span>
              <span className="text-[var(--brand-primary)]">{user?.roles?.[0] || 'member'}</span>
            </div>
          </div>
        </div>

        <div className="bg-surface-mint p-6 rounded-2xl border border-edge space-y-4">
          <div className="h-10 w-10 bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/20 rounded-xl flex items-center justify-center text-[var(--brand-primary)]">
            <Phone className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-bold font-outfit text-ink">Support & Info</h3>
          <p className="text-xs text-ink-muted leading-relaxed">
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
      <div className="h-screen w-screen bg-surface-alt flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-[var(--brand-primary)]" />
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
      <TenantProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </TenantProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
