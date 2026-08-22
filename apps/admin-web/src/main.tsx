import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { z } from 'zod';
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CalendarDays,
  Copy,
  LayoutDashboard,
  Link as LinkIcon,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { apiRequest, AuthProvider, TenantProvider, useAuth, useTenant } from '@badminton/ui-shared';
import './styles.css';

type Branch = {
  id: string;
  name: string;
  status: string;
  workingDays?: string[];
  workingHoursStart?: string | null;
  workingHoursEnd?: string | null;
};

type BookingRule = {
  id: string;
  resourcePoolId: string;
  guestAccessCutoffMinutes: number;
  lowOccupancyThresholdPct: number;
};

type ResourcePool = {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  allocationMode: string;
  capacity: number;
  minOccupancy: number;
  minBookingDurationMinutes: number;
  pricingMode: 'FLAT' | 'PER_PERSON';
  defaultRate: string;
  bookingRules?: BookingRule[];
};

type AvailabilitySlot = {
  window: {
    id: string;
    startTime: string;
    endTime: string;
    resourceId?: string | null;
    capacity: number;
    updatedAt?: string;
    pricingMode?: 'FLAT' | 'PER_PERSON' | null;
    price?: string | null;
  };
  remainingCapacity: number;
};

type AvailabilityPattern = {
  id: string;
  resourcePoolId: string;
  daysOfWeek: string;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  capacity: number;
  pricingMode?: 'FLAT' | 'PER_PERSON' | null;
  price?: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
};

type AvailabilityOverride = {
  id: string;
  resourcePoolId: string;
  date: string;
  type: 'CLOSED' | 'MODIFIED';
  startTime?: string | null;
  endTime?: string | null;
  slotDurationMinutes?: number | null;
  capacity?: number | null;
  pricingMode?: 'FLAT' | 'PER_PERSON' | null;
  price?: string | null;
  reason?: string | null;
};

type UserLookupResult = {
  id: string;
  phone: string;
  userType: string;
};

type MemberAssignment = {
  id: string;
  userId: string;
  resourcePoolId: string;
  daysOfWeek: string;
  startTime: string;
  status: string;
  resourcePool?: ResourcePool;
  member?: UserLookupResult | null;
};

type AdminBooking = {
  id: string;
  tenantId: string;
  branchId: string;
  resourcePoolId: string;
  windowId: string;
  userId: string;
  status: string;
  price?: string | null;
  refundAmount?: string | null;
  window?: AvailabilitySlot['window'] & { resourcePool?: ResourcePool };
};

type RefundPreview = {
  bookingId: string;
  originalPrice: number;
  refundAmount: number;
  refundPercent: number;
};

type OccupancySummary = {
  totalCapacity: number;
  confirmedSeats: number;
  occupancyPercentage: number;
};

type BranchGuestOccupancy = OccupancySummary & {
  resourcePoolId: string;
  resourcePoolName: string;
};

type MemberAttendanceRow = {
  memberPhone: string;
  resourcePoolName: string;
  startTime: string;
  endTime: string | null;
  cutoffTime: string | null;
  status: 'CONFIRMED' | 'PENDING_CONFIRMATION' | 'PAST_CUTOFF' | 'RELEASED_NO_SHOW' | 'SUBSCRIPTION_INACTIVE' | 'WINDOW_NOT_FOUND';
  statusLabel: string;
};

type ApiError = Error & { code?: string; statusCode?: number };

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: true,
    },
  },
});

// SCREEN-002: the server rejects a duration that does not divide a day (INVALID_DURATION), but
// neither of these schemas checked it, so the only feedback was a round-trip error banner. Both
// pool and pattern durations carry the rule, so it lives in one place.
const dividesADay = (minutes: number) => 1440 % minutes === 0;
const DIVIDES_A_DAY_MESSAGE = 'Must divide evenly into 24 hours (e.g. 30, 60, 90, 120)';

const poolSchema = z.object({
  name: z.string().min(1),
  capacity: z.coerce.number().int().min(1),
  minOccupancy: z.coerce.number().int().min(1),
  minBookingDurationMinutes: z.coerce.number().int().positive().refine(dividesADay, DIVIDES_A_DAY_MESSAGE),
  pricingMode: z.enum(['FLAT', 'PER_PERSON']),
  defaultRate: z.coerce.number().min(0),
}).refine((v) => v.capacity >= v.minOccupancy, {
  // Mirrors the server's INVALID_OCCUPANCY cross-field rule so the wizard cannot submit a pool
  // the server will refuse.
  message: 'Capacity must be greater than or equal to minimum occupancy',
  path: ['capacity'],
});

const ruleSchema = z.object({
  guestAccessCutoffMinutes: z.coerce.number().int().min(0),
  lowOccupancyThresholdPct: z.coerce.number().int().min(0).max(100),
});

const branchScheduleSchema = z.object({
  workingHoursStart: z.string().regex(/^\d{2}:\d{2}$/),
  workingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/),
});

const patternSchema = z.object({
  daysOfWeek: z.string().min(1),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  slotDurationMinutes: z.coerce.number().int().positive().refine(dividesADay, DIVIDES_A_DAY_MESSAGE),
  capacity: z.coerce.number().int().positive(),
  pricingMode: z.enum(['FLAT', 'PER_PERSON']).optional(),
  price: z.coerce.number().min(0).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

const overrideSchema = z.object({
  fromDate: z.string().min(1),
  toDate: z.string().min(1),
  type: z.enum(['CLOSED', 'MODIFIED']),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  slotDurationMinutes: z.coerce.number().int().positive().optional(),
  capacity: z.coerce.number().int().positive().optional(),
  pricingMode: z.enum(['FLAT', 'PER_PERSON']).optional(),
  price: z.coerce.number().min(0).optional(),
  reason: z.string().optional(),
});

const resourcePoolFieldLabels: Record<string, string> = {
  name: 'Pool Name',
  capacity: 'Capacity',
  minOccupancy: 'Min. Occupancy',
  minBookingDurationMinutes: 'Min. Booking Duration (minutes)',
  defaultRate: 'Default Rate (\u20b9)',
  pricingMode: 'Pricing Mode',
  guestAccessCutoffMinutes: 'Guest Access Cutoff (minutes)',
  lowOccupancyThresholdPct: 'Low-Occupancy Threshold (%)',
};

const roleCanAdmin = (roles: string[] = []) => roles.includes('owner') || roles.some((role) => role.startsWith('branch_manager:'));

const branchScopes = (roles: string[] = []) => roles
  .filter((role) => role.startsWith('branch_manager:'))
  .map((role) => role.split(':')[1])
  .filter(Boolean);

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

const weekdayOptions = [
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' },
  { value: '7', label: 'Sun' },
];

function formatDaysOfWeek(daysOfWeek: string) {
  return daysOfWeek
    .split(',')
    .map((day) => {
      const trimmed = day.trim();
      return weekdayOptions.find((option) => option.value === trimmed)?.label || trimmed;
    })
    .join(', ');
}

function formatTimeRange(startTime?: string | null, endTime?: string | null) {
  if (!startTime || !endTime) return 'Closed';
  return `${startTime} - ${endTime}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function timeToMinutes(value?: string | null) {
  const [hours = '0', minutes = '0'] = (value || '00:00').split(':');
  return Number(hours) * 60 + Number(minutes);
}

function minutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
  const minutes = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

// F-171: mirrors `patternBoundaries` in `services/slot-engine/src/index.ts`. F-169 validates a
// declared startTime against exactly these boundaries, so any divergence between the two
// implementations shows up as a button the server rejects on submit. Change them together.
function patternBoundaries(pattern: AvailabilityPattern) {
  const start = timeToMinutes(pattern.startTime);
  const end = timeToMinutes(pattern.endTime);
  const boundaries: number[] = [];
  for (let cursor = start; cursor < end; cursor += pattern.slotDurationMinutes) {
    boundaries.push(cursor);
  }
  return boundaries;
}

// F-171: start times are derived from the pool's own ACTIVE availability patterns, NOT from
// branch working hours. The two are unrelated by construction — working hours are a
// branch-level display range, while patterns are what generation actually steps through — so
// the old version could offer a time F-169 now rejects with START_TIME_NOT_ALIGNED.
//
// This is an INTERSECTION across the selected weekdays, not a union: F-169 rejects the whole
// assignment if any single selected day misaligns, so a union would put back exactly the
// buttons the server refuses. An empty result is a legitimate outcome (patterns disagree
// across the chosen days, or a chosen day has no ACTIVE pattern), and the caller reports it.
function assignmentStartTimes(patterns: AvailabilityPattern[] | undefined, daysOfWeek: string[]) {
  if (!patterns || daysOfWeek.length === 0) return [];
  const active = patterns.filter((pattern) => pattern.status === 'ACTIVE');
  const dayBoundarySets = daysOfWeek.map((day) => {
    const forDay = active.filter((pattern) => (
      pattern.daysOfWeek.split(',').map((entry) => entry.trim()).includes(day)
    ));
    const minutes = new Set<number>();
    for (const pattern of forDay) {
      for (const boundary of patternBoundaries(pattern)) minutes.add(boundary);
    }
    return minutes;
  });
  const [first, ...rest] = dayBoundarySets;
  return [...first]
    .filter((minute) => rest.every((set) => set.has(minute)))
    .sort((a, b) => a - b)
    .map(minutesToTime);
}

function formatMemberContact(member?: UserLookupResult | null) {
  return member?.phone || 'Phone not available';
}

function useAdminApi() {
  const { accessToken } = useAuth();
  return useMemo(() => ({
    get: <T,>(path: string) => apiRequest<T>(path, { token: accessToken }),
    post: <T,>(path: string, body?: unknown, headers?: HeadersInit) => apiRequest<T>(path, {
      method: 'POST',
      token: accessToken,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    patch: <T,>(path: string, body: unknown) => apiRequest<T>(path, {
      method: 'PATCH',
      token: accessToken,
      body: JSON.stringify(body),
    }),
    put: <T,>(path: string, body: unknown) => apiRequest<T>(path, {
      method: 'PUT',
      token: accessToken,
      body: JSON.stringify(body),
    }),
    delete: <T,>(path: string) => apiRequest<T>(path, {
      method: 'DELETE',
      token: accessToken,
    }),
  }), [accessToken]);
}

function LoginScreen() {
  const { tenant } = useTenant();
  const { requestOtp, verifyOtp, verifyGoogleMock, isAuthenticated } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('owner@example.com');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const submitOtpRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await requestOtp(phone);
      setOtpSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const submitOtpVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await verifyOtp(phone, code);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const submitGoogle = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await verifyGoogleMock(email);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand-mark">{tenant?.appName?.[0] ?? 'A'}</div>
        <h1>{tenant?.appName || tenant?.name} Admin</h1>
        <p>{tenant?.name}</p>
        {error && <div className="inline-error"><AlertTriangle size={16} />{error}</div>}
        <form onSubmit={otpSent ? submitOtpVerify : submitOtpRequest} className="form-grid">
          <label>
            Mobile number
            <input value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="9999999999" />
          </label>
          {otpSent && (
            <label>
              OTP
              <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" />
            </label>
          )}
          <button className="primary-btn" disabled={loading} type="submit">
            {loading ? <RefreshCw size={16} className="spin" /> : null}
            {otpSent ? 'Verify OTP' : 'Send OTP'}
          </button>
        </form>
        <form onSubmit={submitGoogle} className="form-grid dev-login">
          <label>
            Dev Google email
            <input value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <button className="secondary-btn" disabled={loading} type="submit">Use Mock Google</button>
        </form>
      </section>
    </main>
  );
}

function Unauthorized() {
  const { logout, user } = useAuth();
  return (
    <main className="center-state">
      <ShieldAlert size={40} />
      <h1>Unauthorized</h1>
      <p>This account is signed in but does not have owner or branch manager access.</p>
      <code>{user?.roles?.join(', ') || 'no admin roles'}</code>
      <button className="secondary-btn" onClick={logout}>Sign out</button>
    </main>
  );
}

function RequireAdmin() {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return <main className="center-state"><RefreshCw className="spin" />Loading session</main>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!roleCanAdmin(user?.roles || [])) return <Unauthorized />;
  return <Outlet />;
}

function Shell() {
  const { tenant } = useTenant();
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isMobileNavOpen, setMobileNavOpen] = useState(false);
  const navItems = [
    { to: '/', label: 'Overview', icon: LayoutDashboard },
    { to: '/resources', label: 'Resources', icon: SlidersHorizontal },
    { to: '/scheduling', label: 'Scheduling', icon: CalendarDays },
    { to: '/assignments', label: 'Assignments', icon: Users },
    { to: '/occupancy', label: 'Low Occupancy', icon: CalendarClock },
    { to: '/negotiated', label: 'Negotiated', icon: LinkIcon },
    { to: '/refunds', label: 'Refunds', icon: Banknote },
  ];
  const currentSection = navItems.find((item) => item.to === location.pathname)?.label || 'Admin Console';
  const closeMobileNav = () => setMobileNavOpen(false);

  return (
    <div className="app-shell">
      <header className="mobile-nav-bar">
        <div className="mobile-tenant">
          <div className="brand-mark small">{tenant?.appName?.[0] ?? 'A'}</div>
          <div>
            <strong>{tenant?.appName || 'Admin'}</strong>
            <span>{currentSection}</span>
          </div>
        </div>
        <button
          className="mobile-menu-btn"
          type="button"
          aria-label={isMobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={isMobileNavOpen}
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          {isMobileNavOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>
      {isMobileNavOpen ? <button className="mobile-nav-backdrop" aria-label="Close navigation menu" onClick={closeMobileNav} /> : null}
      <aside className={`mobile-nav-drawer ${isMobileNavOpen ? 'open' : ''}`} aria-hidden={!isMobileNavOpen}>
        <div className="tenant-block">
          <div className="brand-mark small">{tenant?.appName?.[0] ?? 'A'}</div>
          <div>
            <strong>{tenant?.appName || 'Admin'}</strong>
            <span>{tenant?.subdomain}</span>
          </div>
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return <Link key={item.to} to={item.to} onClick={closeMobileNav}><Icon size={17} />{item.label}</Link>;
          })}
        </nav>
        <button className="ghost-btn" onClick={logout}><LogOut size={16} />Sign out</button>
      </aside>
      <aside className="sidebar">
        <div className="tenant-block">
          <div className="brand-mark small">{tenant?.appName?.[0] ?? 'A'}</div>
          <div>
            <strong>{tenant?.appName || 'Admin'}</strong>
            <span>{tenant?.subdomain}</span>
          </div>
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return <Link key={item.to} to={item.to}><Icon size={17} />{item.label}</Link>;
          })}
        </nav>
        <button className="ghost-btn" onClick={logout}><LogOut size={16} />Sign out</button>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <h1>Admin Console</h1>
            <p>{user?.roles?.join(', ')}</p>
          </div>
        </header>
        <Outlet />
      </div>
    </div>
  );
}

function useBranches() {
  const api = useAdminApi();
  const { tenant } = useTenant();
  const { user } = useAuth();
  const scopes = branchScopes(user?.roles || []);
  return useQuery({
    queryKey: ['branches', tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const branches = await api.get<Branch[]>(`/tenant/tenants/${tenant?.id}/branches?includeDraft=true`);
      return user?.roles?.includes('owner') ? branches : branches.filter((branch) => scopes.includes(branch.id));
    },
  });
}

function usePools(branchId?: string) {
  const api = useAdminApi();
  return useQuery({
    queryKey: ['pools', branchId],
    enabled: !!branchId,
    queryFn: () => api.get<ResourcePool[]>(`/slot-engine/branches/${branchId}/resource-pools`),
  });
}

function useAvailability(poolId?: string, date?: string) {
  const api = useAdminApi();
  return useQuery({
    queryKey: ['availability', poolId, date],
    enabled: !!poolId && !!date,
    queryFn: () => api.get<AvailabilitySlot[]>(`/slot-engine/resource-pools/${poolId}/availability?date=${date}`),
  });
}

function formatWindow(slot: AvailabilitySlot) {
  const start = new Date(slot.window.startTime);
  const end = new Date(slot.window.endTime);
  return `${start.toLocaleString()} - ${end.toLocaleTimeString()} (${slot.remainingCapacity} open)`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatMemberAttendanceWindow(row: MemberAttendanceRow) {
  if (!row.endTime) return `Assigned start ${row.startTime}`;
  return `${formatDateTime(row.startTime)} - ${formatDateTime(row.endTime)}`;
}

function formatBookingWindow(booking: AdminBooking) {
  if (!booking.window) return booking.id;
  const start = new Date(booking.window.startTime);
  const end = new Date(booking.window.endTime);
  return `${start.toLocaleString()} - ${end.toLocaleTimeString()}`;
}

function UserLookup({
  value,
  onResolved,
}: {
  value: UserLookupResult | null;
  onResolved: (user: UserLookupResult | null) => void;
}) {
  const api = useAdminApi();
  const { tenant } = useTenant();
  const [phone, setPhone] = useState('');
  const lookup = useMutation({
    mutationFn: () => api.get<UserLookupResult>(`/identity/users/lookup?tenantId=${tenant?.id}&phone=${encodeURIComponent(phone)}`),
    onSuccess: onResolved,
    onError: () => onResolved(null),
  });

  return (
    <div className="lookup-box">
      <label>Member phone<input value={phone} maxLength={13} onChange={(event) => setPhone(event.target.value.replace(/[^\d+]/g, '').slice(0, 13))} placeholder="9999999999" /></label>
      <button className="secondary-btn" disabled={!phone || lookup.isPending} onClick={() => lookup.mutate()}>
        {lookup.isPending ? <RefreshCw className="spin" size={16} /> : <Users size={16} />}
        {lookup.isPending ? 'Looking up...' : 'Lookup member'}
      </button>
      {value ? <div className="success-box">Using {value.phone} ({value.userType})</div> : null}
      <MutationFeedback error={lookup.error} />
    </div>
  );
}

function ErrorBanner({ error }: { error: unknown }) {
  if (!error) return null;
  const err = error as ApiError;
  return <div className="inline-error"><AlertTriangle size={16} />{err.message}</div>;
}

function MutationFeedback({ error, successMessage }: { error: unknown; successMessage?: string }) {
  if (error) return <ErrorBanner error={error} />;
  if (successMessage) return <div className="success-box">{successMessage}</div>;
  return null;
}

function BranchSelector({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const branches = useBranches();
  if (branches.isLoading) return <span className="muted">Loading branches...</span>;
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select branch</option>
      {(branches.data || []).map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}
    </select>
  );
}

function Overview() {
  const api = useAdminApi();
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const [date, setDate] = useState(todayIsoDate());
  const active = branches.data?.filter((branch) => branch.status === 'ACTIVE').length || 0;
  const selectedBranch = branches.data?.find((branch) => branch.id === branchId);
  const occupancy = useQuery({
    queryKey: ['branch-guest-occupancy', branchId, date],
    enabled: !!branchId,
    queryFn: () => api.get<BranchGuestOccupancy[]>(`/slot-engine/branches/${branchId}/guest-occupancy?date=${date}`),
  });
  const memberAttendance = useQuery({
    queryKey: ['branch-member-attendance', branchId, date],
    enabled: !!branchId,
    queryFn: () => api.get<MemberAttendanceRow[]>(`/slot-engine/branches/${branchId}/member-attendance?date=${date}`),
  });

  React.useEffect(() => {
    if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id);
  }, [branchId, branches.data]);

  return (
    <main className="overview-stack">
      <section className="page-grid">
        <div className="metric-card"><span>Branches</span><strong>{branches.data?.length || 0}</strong></div>
        <div className="metric-card"><span>Active</span><strong>{active}</strong></div>
        <div className="metric-card"><span>Workflows</span><strong>5</strong></div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Guest Occupancy</h2>
            <p className="muted">Confirmed guest slots by court for the selected branch and date.</p>
          </div>
          {(occupancy.isFetching || memberAttendance.isFetching) && <RefreshCw className="spin" size={18} />}
        </div>
        <div className="form-grid compact">
          <label>Branch<select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
            <option value="">Select branch</option>
            {(branches.data || []).map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}
          </select></label>
          <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        </div>
        <MutationFeedback error={branches.error || occupancy.error || memberAttendance.error} />
        {!branchId && <p className="empty-state">Select a branch to view guest occupancy.</p>}
        {branchId && occupancy.data?.length === 0 && (
          <p className="empty-state">{selectedBranch?.name || 'This branch'} has no resource pools configured yet.</p>
        )}
        {!!occupancy.data?.length && (
          <div className="occupancy-list">
            {occupancy.data.map((pool) => (
              <div className="occupancy-row" key={pool.resourcePoolId}>
                <div>
                  <strong>{pool.resourcePoolName}</strong>
                  <span>{pool.confirmedSeats} of {pool.totalCapacity} guest slots confirmed</span>
                </div>
                <div className="occupancy-meter" aria-label={`${pool.occupancyPercentage}% occupied`}>
                  <span style={{ width: `${Math.min(pool.occupancyPercentage, 100)}%` }} />
                </div>
                <strong className="occupancy-value">{pool.totalCapacity > 0 ? `${pool.occupancyPercentage}%` : 'No windows'}</strong>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Member Attendance</h2>
            <p className="muted">Members whose confirmation windows are open or already past cutoff.</p>
          </div>
        </div>
        {branchId && memberAttendance.data?.length === 0 && (
          <p className="empty-state">No member attendance windows are currently open for this branch.</p>
        )}
        {!!memberAttendance.data?.length && (
          <div className="attendance-list">
            {memberAttendance.data.map((row) => (
              <div className="attendance-row" key={`${row.memberPhone}-${row.resourcePoolName}-${row.startTime}`}>
                <div>
                  <strong>{row.memberPhone}</strong>
                  <span>{row.resourcePoolName}</span>
                </div>
                <div>
                  <strong>{formatMemberAttendanceWindow(row)}</strong>
                  <span>{row.cutoffTime ? `Cutoff ${formatDateTime(row.cutoffTime)}` : 'Assigned window missing'}</span>
                </div>
                <span className={`status-pill attendance-${row.status.toLowerCase().replace(/_/g, '-')}`}>{row.statusLabel}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function ResourcesPage() {
  const api = useAdminApi();
  const qc = useQueryClient();
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const [selectedPoolId, setSelectedPoolId] = useState('');
  const pools = usePools(branchId);
  const selectedBranch = branches.data?.find((branch) => branch.id === branchId);
  const selectedPool = pools.data?.find((pool) => pool.id === selectedPoolId) || pools.data?.[0];
  const [branchDraft, setBranchDraft] = useState({ workingHoursStart: '', workingHoursEnd: '' });
  const [poolDraft, setPoolDraft] = useState<Record<string, string>>({});
  const [ruleDraft, setRuleDraft] = useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id);
  }, [branchId, branches.data]);

  React.useEffect(() => {
    if (selectedBranch) {
      setBranchDraft({
        workingHoursStart: selectedBranch.workingHoursStart || '',
        workingHoursEnd: selectedBranch.workingHoursEnd || '',
      });
    }
  }, [selectedBranch?.id, selectedBranch?.workingHoursStart, selectedBranch?.workingHoursEnd]);

  React.useEffect(() => {
    if (selectedPool) {
      setSelectedPoolId(selectedPool.id);
      setPoolDraft({
        name: selectedPool.name,
        capacity: String(selectedPool.capacity),
        minOccupancy: String(selectedPool.minOccupancy),
        minBookingDurationMinutes: String(selectedPool.minBookingDurationMinutes),
        pricingMode: selectedPool.pricingMode,
        defaultRate: String(selectedPool.defaultRate),
      });
      const rule = selectedPool.bookingRules?.[0];
      setRuleDraft({
        guestAccessCutoffMinutes: String(rule?.guestAccessCutoffMinutes ?? 120),
        lowOccupancyThresholdPct: String(rule?.lowOccupancyThresholdPct ?? ''),
      });
    }
  }, [selectedPool?.id]);

  const savePool = useMutation({
    mutationFn: async () => {
      if (!selectedPool) throw new Error('Select a resource pool');
      const parsed = poolSchema.parse(poolDraft);
      return api.patch<ResourcePool>(`/slot-engine/resource-pools/${selectedPool.id}`, parsed);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pools', branchId] }),
  });

  const saveRule = useMutation({
    mutationFn: async () => {
      if (!selectedPool) throw new Error('Select a resource pool');
      const parsed = ruleSchema.parse(ruleDraft);
      return api.put<BookingRule>(`/slot-engine/resource-pools/${selectedPool.id}/booking-rule`, parsed);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pools', branchId] }),
  });

  const saveBranch = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error('Select a branch');
      return api.patch<Branch>(`/tenant/branches/${branchId}`, branchScheduleSchema.parse(branchDraft));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branches'] }),
  });

  return (
    <main className="content-grid two">
      <section className="panel">
        <h2>Branch Schedule</h2>
        <BranchSelector value={branchId} onChange={(id) => { setBranchId(id); setSelectedPoolId(''); }} />
        <div className="form-row">
          <label>Opens<input value={branchDraft.workingHoursStart} placeholder="06:00" onChange={(event) => setBranchDraft((draft) => ({ ...draft, workingHoursStart: event.target.value }))} /></label>
          <label>Closes<input value={branchDraft.workingHoursEnd} placeholder="22:00" onChange={(event) => setBranchDraft((draft) => ({ ...draft, workingHoursEnd: event.target.value }))} /></label>
          <button className="secondary-btn" disabled={saveBranch.isPending || !branchId} onClick={() => saveBranch.mutate()}>
            {saveBranch.isPending ? <RefreshCw className="spin" size={16} /> : <Save size={16} />}
            {saveBranch.isPending ? 'Saving...' : 'Save hours'}
          </button>
        </div>
        <MutationFeedback error={saveBranch.error} successMessage={saveBranch.isSuccess ? 'Branch schedule saved.' : undefined} />
      </section>
      <section className="panel">
        <h2>Resource Pools</h2>
        {/* SCREEN-002 / F-031: an empty <select> previously rendered as a silent dead control —
            nothing to pick, no explanation, and no way to create the first pool from anywhere in
            the app. This closes F-031's Resources half by making the empty state the entry point
            to the onboarding wizard. */}
        {!pools.isLoading && (pools.data || []).length === 0 ? (
          <div className="form-grid compact">
            <p className="empty-state">This branch has no court pools yet.</p>
            <Link className="primary-btn" to="/resources/new" id="create-first-pool-btn">
              <Plus size={16} />Create your first court pool
            </Link>
          </div>
        ) : (
          <select value={selectedPool?.id || ''} onChange={(event) => setSelectedPoolId(event.target.value)}>
            {(pools.data || []).map((pool) => <option value={pool.id} key={pool.id}>{pool.name}</option>)}
          </select>
        )}
        {selectedPool && (
          <div className="form-grid compact">
            {['name', 'capacity', 'minOccupancy', 'minBookingDurationMinutes', 'defaultRate'].map((field) => (
              <label key={field}>{resourcePoolFieldLabels[field]}<input value={poolDraft[field] || ''} onChange={(event) => setPoolDraft((draft) => ({ ...draft, [field]: event.target.value }))} /></label>
            ))}
            <label>{resourcePoolFieldLabels.pricingMode}<select value={poolDraft.pricingMode || 'FLAT'} onChange={(event) => setPoolDraft((draft) => ({ ...draft, pricingMode: event.target.value }))}><option>FLAT</option><option>PER_PERSON</option></select></label>
            <button className="primary-btn" disabled={savePool.isPending} onClick={() => savePool.mutate()}>
              {savePool.isPending ? <RefreshCw className="spin" size={16} /> : <Save size={16} />}
              {savePool.isPending ? 'Saving...' : 'Save pool'}
            </button>
            <MutationFeedback error={savePool.error} successMessage={savePool.isSuccess ? 'Resource pool saved.' : undefined} />
            <label>{resourcePoolFieldLabels.guestAccessCutoffMinutes}<input value={ruleDraft.guestAccessCutoffMinutes || ''} onChange={(event) => setRuleDraft((draft) => ({ ...draft, guestAccessCutoffMinutes: event.target.value }))} /></label>
            <label>{resourcePoolFieldLabels.lowOccupancyThresholdPct}<input value={ruleDraft.lowOccupancyThresholdPct || ''} onChange={(event) => setRuleDraft((draft) => ({ ...draft, lowOccupancyThresholdPct: event.target.value }))} /></label>
            <button className="secondary-btn" disabled={saveRule.isPending} onClick={() => saveRule.mutate()}>
              {saveRule.isPending ? <RefreshCw className="spin" size={16} /> : <Save size={16} />}
              {saveRule.isPending ? 'Saving...' : 'Save rule'}
            </button>
            <MutationFeedback error={saveRule.error} successMessage={saveRule.isSuccess ? 'Booking rule saved.' : undefined} />
          </div>
        )}
      </section>
    </main>
  );
}

function SchedulingPage() {
  const api = useAdminApi();
  const qc = useQueryClient();
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const pools = usePools(branchId);
  const [poolId, setPoolId] = useState('');
  const selectedPool = pools.data?.find((pool) => pool.id === poolId);
  const [selectedPatternId, setSelectedPatternId] = useState('');
  const [selectedOverrideId, setSelectedOverrideId] = useState('');
  const [previewDate, setPreviewDate] = useState(todayIsoDate());
  const [patternDraft, setPatternDraft] = useState<Record<string, string>>({
    daysOfWeek: '2,4',
    startTime: '18:00',
    endTime: '22:00',
    slotDurationMinutes: '60',
    capacity: '4',
    pricingMode: '',
    price: '',
    status: 'ACTIVE',
  });
  const [overrideDraft, setOverrideDraft] = useState<Record<string, string>>({
    fromDate: todayIsoDate(),
    toDate: todayIsoDate(),
    type: 'CLOSED',
    startTime: '18:00',
    endTime: '20:00',
    slotDurationMinutes: '60',
    capacity: '4',
    pricingMode: '',
    price: '',
    reason: '',
  });

  React.useEffect(() => {
    if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id);
  }, [branchId, branches.data]);

  React.useEffect(() => {
    if (!poolId && pools.data?.[0]) setPoolId(pools.data[0].id);
  }, [poolId, pools.data]);

  const patterns = useQuery({
    queryKey: ['availability-patterns', poolId],
    enabled: !!poolId,
    queryFn: () => api.get<AvailabilityPattern[]>(`/slot-engine/resource-pools/${poolId}/availability-patterns`),
  });

  const overrides = useQuery({
    queryKey: ['availability-overrides', poolId],
    enabled: !!poolId,
    queryFn: () => api.get<AvailabilityOverride[]>(`/slot-engine/resource-pools/${poolId}/availability-overrides`),
  });

  const preview = useAvailability(poolId, previewDate);

  React.useEffect(() => {
    if (!selectedPatternId) return;
    const pattern = patterns.data?.find((item) => item.id === selectedPatternId);
    if (!pattern) return;
    setPatternDraft({
      daysOfWeek: pattern.daysOfWeek,
      startTime: pattern.startTime,
      endTime: pattern.endTime,
      slotDurationMinutes: String(pattern.slotDurationMinutes),
      capacity: String(pattern.capacity),
      pricingMode: pattern.pricingMode || '',
      price: pattern.price ? String(pattern.price) : '',
      status: pattern.status,
    });
  }, [selectedPatternId, patterns.data]);

  React.useEffect(() => {
    if (!selectedOverrideId) return;
    const override = overrides.data?.find((item) => item.id === selectedOverrideId);
    if (!override) return;
    const date = override.date.slice(0, 10);
    setOverrideDraft({
      fromDate: date,
      toDate: date,
      type: override.type,
      startTime: override.startTime || '18:00',
      endTime: override.endTime || '20:00',
      slotDurationMinutes: override.slotDurationMinutes ? String(override.slotDurationMinutes) : '60',
      capacity: override.capacity ? String(override.capacity) : '4',
      pricingMode: override.pricingMode || '',
      price: override.price ? String(override.price) : '',
      reason: override.reason || '',
    });
  }, [selectedOverrideId, overrides.data]);

  const savePattern = useMutation({
    mutationFn: () => {
      if (!poolId) throw new Error('Select a resource pool');
      const parsed = patternSchema.parse({
        ...patternDraft,
        pricingMode: patternDraft.pricingMode || undefined,
        price: patternDraft.price || undefined,
      });
      if ((parsed.pricingMode && parsed.price === undefined) || (!parsed.pricingMode && parsed.price !== undefined)) {
        throw new Error('Pricing mode and price must be set together');
      }
      const path = `/slot-engine/resource-pools/${poolId}/availability-patterns${selectedPatternId ? `/${selectedPatternId}` : ''}`;
      return selectedPatternId
        ? api.patch<AvailabilityPattern>(path, parsed)
        : api.post<AvailabilityPattern>(path, parsed);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['availability-patterns', poolId] });
      qc.invalidateQueries({ queryKey: ['availability', poolId, previewDate] });
    },
  });

  const deletePattern = useMutation({
    mutationFn: () => {
      if (!poolId || !selectedPatternId) throw new Error('Select a pattern');
      return api.delete<AvailabilityPattern>(`/slot-engine/resource-pools/${poolId}/availability-patterns/${selectedPatternId}`);
    },
    onSuccess: () => {
      setSelectedPatternId('');
      qc.invalidateQueries({ queryKey: ['availability-patterns', poolId] });
    },
  });

  const saveOverride = useMutation({
    mutationFn: () => {
      if (!poolId) throw new Error('Select a resource pool');
      const parsed = overrideSchema.parse({
        ...overrideDraft,
        startTime: overrideDraft.type === 'MODIFIED' ? overrideDraft.startTime : undefined,
        endTime: overrideDraft.type === 'MODIFIED' ? overrideDraft.endTime : undefined,
        slotDurationMinutes: overrideDraft.type === 'MODIFIED' ? overrideDraft.slotDurationMinutes : undefined,
        capacity: overrideDraft.type === 'MODIFIED' ? overrideDraft.capacity : undefined,
        pricingMode: overrideDraft.type === 'MODIFIED' && overrideDraft.pricingMode ? overrideDraft.pricingMode : undefined,
        price: overrideDraft.type === 'MODIFIED' && overrideDraft.price ? overrideDraft.price : undefined,
        reason: overrideDraft.reason || undefined,
      });
      if (parsed.type === 'MODIFIED' && ((parsed.pricingMode && parsed.price === undefined) || (!parsed.pricingMode && parsed.price !== undefined))) {
        throw new Error('Pricing mode and price must be set together');
      }
      if (selectedOverrideId) {
        const { fromDate: _fromDate, toDate: _toDate, ...singleDatePayload } = parsed;
        return api
          .patch<AvailabilityOverride>(`/slot-engine/resource-pools/${poolId}/availability-overrides/${selectedOverrideId}`, singleDatePayload)
          .then((override) => [override]);
      }
      return api.post<AvailabilityOverride[]>(`/slot-engine/resource-pools/${poolId}/availability-overrides`, parsed);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['availability-overrides', poolId] });
      qc.invalidateQueries({ queryKey: ['availability', poolId, previewDate] });
    },
  });

  const deleteOverride = useMutation({
    mutationFn: () => {
      if (!poolId || !selectedOverrideId) throw new Error('Select an override');
      return api.delete<AvailabilityOverride>(`/slot-engine/resource-pools/${poolId}/availability-overrides/${selectedOverrideId}`);
    },
    onSuccess: () => {
      setSelectedOverrideId('');
      qc.invalidateQueries({ queryKey: ['availability-overrides', poolId] });
    },
  });

  const toggleDay = (day: string) => {
    const days = patternDraft.daysOfWeek.split(',').map((item) => item.trim()).filter(Boolean);
    const next = days.includes(day) ? days.filter((item) => item !== day) : [...days, day];
    setPatternDraft((draft) => ({ ...draft, daysOfWeek: next.sort().join(',') }));
  };

  return (
    <main className="overview-stack scheduling-page">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Scheduling</h2>
            <p className="muted">Manage recurring availability and date-specific changes for resource pools.</p>
          </div>
          {(patterns.isFetching || overrides.isFetching || preview.isFetching) ? <RefreshCw className="spin" size={18} /> : null}
        </div>
        <div className="form-grid compact">
          <label>Branch<select value={branchId} onChange={(event) => { setBranchId(event.target.value); setPoolId(''); setSelectedPatternId(''); setSelectedOverrideId(''); }}>
            <option value="">Select branch</option>
            {(branches.data || []).map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}
          </select></label>
          <label>Resource pool<select value={poolId} onChange={(event) => { setPoolId(event.target.value); setSelectedPatternId(''); setSelectedOverrideId(''); }}>
            <option value="">Select pool</option>
            {(pools.data || []).map((pool) => <option value={pool.id} key={pool.id}>{pool.name}</option>)}
          </select></label>
        </div>
        <MutationFeedback error={branches.error || pools.error} />
      </section>

      <main className="content-grid two">
        <section className="panel" id="scheduling-pattern-panel">
          <div className="panel-header">
            <div>
              <h2>Recurring Pattern</h2>
              <p className="muted">Create or update a weekly availability rule.</p>
            </div>
            <button className="secondary-btn" onClick={() => { setSelectedPatternId(''); setPatternDraft({ daysOfWeek: '2,4', startTime: '18:00', endTime: '22:00', slotDurationMinutes: '60', capacity: '4', pricingMode: '', price: '', status: 'ACTIVE' }); }}>New</button>
          </div>
          <div className="form-grid compact">
            <label>Existing pattern<select value={selectedPatternId} onChange={(event) => setSelectedPatternId(event.target.value)}>
              <option value="">New pattern</option>
              {(patterns.data || []).map((pattern) => (
                <option key={pattern.id} value={pattern.id}>{formatDaysOfWeek(pattern.daysOfWeek)} {formatTimeRange(pattern.startTime, pattern.endTime)} | {pattern.status}</option>
              ))}
            </select></label>
            <div className="check-group">
              <span className="field-label">Weekdays</span>
              {weekdayOptions.map((day) => (
                <label className="check-row inline-check" key={day.value}>
                  <input type="checkbox" checked={patternDraft.daysOfWeek.split(',').includes(day.value)} onChange={() => toggleDay(day.value)} />
                  {day.label}
                </label>
              ))}
            </div>
            <label>Start time<input value={patternDraft.startTime} onChange={(event) => setPatternDraft((draft) => ({ ...draft, startTime: event.target.value }))} /></label>
            <label>End time<input value={patternDraft.endTime} onChange={(event) => setPatternDraft((draft) => ({ ...draft, endTime: event.target.value }))} /></label>
            <label>Slot duration<input value={patternDraft.slotDurationMinutes} onChange={(event) => setPatternDraft((draft) => ({ ...draft, slotDurationMinutes: event.target.value }))} /></label>
            <label>Capacity<input value={patternDraft.capacity} onChange={(event) => setPatternDraft((draft) => ({ ...draft, capacity: event.target.value }))} /></label>
            <label>Status<select value={patternDraft.status} onChange={(event) => setPatternDraft((draft) => ({ ...draft, status: event.target.value }))}><option>ACTIVE</option><option>SUSPENDED</option></select></label>
            <label>Pricing mode<select value={patternDraft.pricingMode} onChange={(event) => setPatternDraft((draft) => ({ ...draft, pricingMode: event.target.value }))}><option value="">Use pool default</option><option value="FLAT">Flat</option><option value="PER_PERSON">Per person</option></select></label>
            <label>Price override<input value={patternDraft.price} onChange={(event) => setPatternDraft((draft) => ({ ...draft, price: event.target.value }))} /></label>
            <button className="primary-btn" disabled={!poolId || savePattern.isPending} onClick={() => savePattern.mutate()}>{savePattern.isPending ? <RefreshCw className="spin" size={16} /> : <Save size={16} />}{selectedPatternId ? 'Update pattern' : 'Create pattern'}</button>
            <button className="secondary-btn" disabled={!selectedPatternId || deletePattern.isPending} onClick={() => deletePattern.mutate()}>Delete pattern</button>
          </div>
          <MutationFeedback error={patterns.error || savePattern.error || deletePattern.error} successMessage={savePattern.isSuccess ? 'Pattern saved.' : deletePattern.isSuccess ? 'Pattern deleted.' : undefined} />
        </section>

        <section className="panel" id="scheduling-override-panel">
          <div className="panel-header">
            <div>
              <h2>Date Override</h2>
              <p className="muted">Close dates or replace generated slots for a specific range.</p>
            </div>
            <button className="secondary-btn" onClick={() => { setSelectedOverrideId(''); setOverrideDraft({ fromDate: todayIsoDate(), toDate: todayIsoDate(), type: 'CLOSED', startTime: '18:00', endTime: '20:00', slotDurationMinutes: '60', capacity: '4', pricingMode: '', price: '', reason: '' }); }}>New</button>
          </div>
          <div className="form-grid compact">
            <label>Existing override<select value={selectedOverrideId} onChange={(event) => setSelectedOverrideId(event.target.value)}>
              <option value="">New override</option>
              {(overrides.data || []).map((override) => (
                <option key={override.id} value={override.id}>{formatDate(override.date)} | {override.type === 'CLOSED' ? 'Closed' : formatTimeRange(override.startTime, override.endTime)}</option>
              ))}
            </select></label>
            <label>From date<input type="date" value={overrideDraft.fromDate} disabled={!!selectedOverrideId} onChange={(event) => setOverrideDraft((draft) => ({ ...draft, fromDate: event.target.value, toDate: draft.toDate || event.target.value }))} /></label>
            <label>To date<input type="date" value={overrideDraft.toDate} disabled={!!selectedOverrideId} onChange={(event) => setOverrideDraft((draft) => ({ ...draft, toDate: event.target.value }))} /></label>
            <label>Type<select value={overrideDraft.type} onChange={(event) => setOverrideDraft((draft) => ({ ...draft, type: event.target.value }))}><option value="CLOSED">Closed</option><option value="MODIFIED">Modified</option></select></label>
            <label>Reason<input value={overrideDraft.reason} onChange={(event) => setOverrideDraft((draft) => ({ ...draft, reason: event.target.value }))} /></label>
            {overrideDraft.type === 'MODIFIED' ? (
              <>
                <label>Start time<input value={overrideDraft.startTime} onChange={(event) => setOverrideDraft((draft) => ({ ...draft, startTime: event.target.value }))} /></label>
                <label>End time<input value={overrideDraft.endTime} onChange={(event) => setOverrideDraft((draft) => ({ ...draft, endTime: event.target.value }))} /></label>
                <label>Slot duration<input value={overrideDraft.slotDurationMinutes} onChange={(event) => setOverrideDraft((draft) => ({ ...draft, slotDurationMinutes: event.target.value }))} /></label>
                <label>Capacity<input value={overrideDraft.capacity} onChange={(event) => setOverrideDraft((draft) => ({ ...draft, capacity: event.target.value }))} /></label>
                <label>Pricing mode<select value={overrideDraft.pricingMode} onChange={(event) => setOverrideDraft((draft) => ({ ...draft, pricingMode: event.target.value }))}><option value="">Use pool default</option><option value="FLAT">Flat</option><option value="PER_PERSON">Per person</option></select></label>
                <label>Price override<input value={overrideDraft.price} onChange={(event) => setOverrideDraft((draft) => ({ ...draft, price: event.target.value }))} /></label>
              </>
            ) : null}
            <button className="primary-btn" disabled={!poolId || saveOverride.isPending} onClick={() => saveOverride.mutate()}>{saveOverride.isPending ? <RefreshCw className="spin" size={16} /> : <Save size={16} />}{selectedOverrideId ? 'Update override' : 'Create override'}</button>
            <button className="secondary-btn" disabled={!selectedOverrideId || deleteOverride.isPending} onClick={() => deleteOverride.mutate()}>Delete override</button>
          </div>
          <MutationFeedback error={overrides.error || saveOverride.error || deleteOverride.error} successMessage={saveOverride.isSuccess ? 'Override saved.' : deleteOverride.isSuccess ? 'Override deleted.' : undefined} />
        </section>
      </main>

      <section className="panel" id="scheduling-preview-panel">
        <div className="panel-header">
          <div>
            <h2>Availability Preview</h2>
            <p className="muted">Uses the live availability endpoint for the selected pool and date.</p>
          </div>
        </div>
        <div className="form-grid compact">
          <label>Preview date<input type="date" value={previewDate} onChange={(event) => setPreviewDate(event.target.value)} /></label>
        </div>
        <MutationFeedback error={preview.error} />
        {preview.isFetching ? <p className="empty-state">Loading availability...</p> : null}
        {preview.isSuccess && preview.data.length === 0 ? <p className="empty-state">No bookable slots for this date.</p> : null}
        {!!preview.data?.length ? (
          <div className="preview-list">
            {preview.data.map((slot) => (
              <div className="preview-row" key={slot.window.id}>
                <strong>{new Date(slot.window.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(slot.window.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
                <span>{slot.remainingCapacity} available of {slot.window.capacity}</span>
                <span>{slot.window.pricingMode || selectedPool?.pricingMode || 'FLAT'} | ₹{Number(slot.window.price ?? selectedPool?.defaultRate ?? 0)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}

// SCREEN-002 — Branch Court Onboarding Wizard.
//
// Closes F-098: standing up a bookable branch was only possible through internal-key API calls via
// scripts/provision-tenant.mjs, because no admin UI existed. Five steps take a branch from nothing
// to genuinely bookable — pool, courts, booking rule, availability pattern — ending on real
// generated slots rather than a success message.
//
// Built against the frozen v4 spec (docs/screen_002_branch_court_onboarding_wizard.md). Reuses the
// existing visual language exactly: form-grid compact, primary-btn/secondary-btn with a spinning
// RefreshCw, label-wrapped inputs, and a single MutationFeedback banner per step. Per the spec,
// per-field error display is deliberately NOT introduced here — no form in this app has it, and a
// wizard is not the place to fork the convention.
const WIZARD_STEPS = ['Court Type', 'Pool Details', 'Courts', 'Booking Rules', 'Scheduling'];

function OnboardingWizardPage() {
  const api = useAdminApi();
  const qc = useQueryClient();
  const branches = useBranches();
  const [step, setStep] = useState(1);
  const [branchId, setBranchId] = useState('');
  const [allocationMode, setAllocationMode] = useState<'FIXED_INSTANCE' | 'POOLED' | ''>('');
  const [pool, setPool] = useState<ResourcePool | null>(null);
  const [courtNames, setCourtNames] = useState<string[]>(['']);
  const [clientError, setClientError] = useState<string | null>(null);

  const [poolForm, setPoolForm] = useState({
    name: '', capacity: '1', minOccupancy: '1',
    minBookingDurationMinutes: '60', pricingMode: 'FLAT', defaultRate: '100',
  });
  const [ruleForm, setRuleForm] = useState({
    guestOpenWindowDays: '7', memberWindowDays: '30', gracePeriodMinutes: '30',
    guestAccessCutoffMinutes: '120', lowOccupancyThresholdPct: '50', prepaymentRequired: true,
  });

  React.useEffect(() => {
    if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id);
  }, [branchId, branches.data]);

  const isFixed = allocationMode === 'FIXED_INSTANCE';

  const createPool = useMutation({
    mutationFn: () => {
      // capacity is meaningless for FIXED_INSTANCE — generation forces one window per resource —
      // so it is not collected in that mode and is sent as 1 rather than as a hidden stale value.
      const parsed = poolSchema.parse({
        ...poolForm,
        capacity: isFixed ? '1' : poolForm.capacity,
      });
      return api.post<ResourcePool>('/slot-engine/resource-pools', {
        branchId, allocationMode, ...parsed,
      });
    },
    onSuccess: (created) => {
      setPool(created);
      qc.invalidateQueries({ queryKey: ['pools'] });
      setStep(3);
    },
  });

  const addCourts = useMutation({
    mutationFn: async () => {
      const names = courtNames.map((n) => n.trim()).filter(Boolean);
      // Caught here rather than server-side so the message names the duplicate. The database
      // enforces this too (SCREEN-002's unique index) — this is the friendly half, not the guard.
      const dupes = names.filter((n, i) => names.indexOf(n) !== i);
      if (dupes.length) throw new Error(`Court names must be unique within a pool. Repeated: ${[...new Set(dupes)].join(', ')}`);
      for (const name of names) {
        await api.post(`/slot-engine/resource-pools/${pool!.id}/resources`, { name });
      }
      return names.length;
    },
    onSuccess: () => setStep(4),
  });

  const saveRule = useMutation({
    mutationFn: async () => {
      const body = {
        resourcePoolId: pool!.id,
        guestOpenWindowDays: Number(ruleForm.guestOpenWindowDays),
        memberWindowDays: Number(ruleForm.memberWindowDays),
        gracePeriodMinutes: Number(ruleForm.gracePeriodMinutes),
        guestAccessCutoffMinutes: Number(ruleForm.guestAccessCutoffMinutes),
        lowOccupancyThresholdPct: Number(ruleForm.lowOccupancyThresholdPct),
        prepaymentRequired: ruleForm.prepaymentRequired,
      };
      // Idempotency: F-067's unique index makes a second POST return 409 BOOKING_RULE_EXISTS.
      // Without this, any failure at step 5 would permanently brick re-entry at step 4 — the
      // admin could never get past a step they had already completed. Detect and switch to PUT.
      //
      // Read through the branch listing rather than a per-pool GET: there is no
      // GET /resource-pools/:id route, and this one already returns bookingRules (and resources),
      // which is exactly where ResourcesPage and OccupancyPage read the current rule from.
      const branchPools = await api.get<ResourcePool[]>(`/slot-engine/branches/${branchId}/resource-pools`);
      const fresh = (branchPools || []).find((p) => p.id === pool!.id);
      const hasRule = (fresh?.bookingRules?.length ?? 0) > 0;
      return hasRule
        ? api.put(`/slot-engine/resource-pools/${pool!.id}/booking-rule`, body)
        : api.post('/slot-engine/booking-rules', body);
    },
    onSuccess: () => setStep(5),
  });

  const anyError = clientError || createPool.error || addCourts.error || saveRule.error;

  return (
    <main className="content-grid">
      <section className="panel">
        <h2>Set Up Courts for a Branch</h2>
        <div className="table-list">
          {WIZARD_STEPS.map((label, idx) => (
            <div className="table-row" key={label}>
              <div>
                <strong>{idx + 1}. {label}</strong>
                <span>{step > idx + 1 ? 'Done' : step === idx + 1 ? 'In progress' : 'Not started'}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        {step === 1 && (
          <>
            <h2>1. Court Type</h2>
            <div className="form-grid compact">
              <label>Branch<select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">Select branch</option>
                {(branches.data || []).map((b) => <option value={b.id} key={b.id}>{b.name}</option>)}
              </select></label>
              <label className="check-row">
                <input type="radio" name="mode" checked={allocationMode === 'FIXED_INSTANCE'}
                  onChange={() => setAllocationMode('FIXED_INSTANCE')} />
                Fixed Courts — each court is booked individually by name.
              </label>
              <label className="check-row">
                <input type="radio" name="mode" checked={allocationMode === 'POOLED'}
                  onChange={() => setAllocationMode('POOLED')} />
                Shared Pool — guests book a seat, and courts are assigned by staff.
              </label>
              <p className="muted">
                This cannot be changed later. Switching court type means deleting the pool and starting again.
              </p>
              <button className="primary-btn" disabled={!allocationMode || !branchId} onClick={() => setStep(2)}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2>2. Pool Details</h2>
            <div className="form-grid compact">
              <label>Pool Name<input value={poolForm.name}
                onChange={(e) => setPoolForm({ ...poolForm, name: e.target.value })} /></label>
              {!isFixed && (
                <label>Capacity<input type="number" value={poolForm.capacity}
                  onChange={(e) => setPoolForm({ ...poolForm, capacity: e.target.value })} /></label>
              )}
              <label>Min. Occupancy<input type="number" value={poolForm.minOccupancy}
                onChange={(e) => setPoolForm({ ...poolForm, minOccupancy: e.target.value })} /></label>
              <label>Min. Booking Duration (min)<input type="number" value={poolForm.minBookingDurationMinutes}
                onChange={(e) => setPoolForm({ ...poolForm, minBookingDurationMinutes: e.target.value })} /></label>
              <label>Pricing Mode<select value={poolForm.pricingMode}
                onChange={(e) => setPoolForm({ ...poolForm, pricingMode: e.target.value })}>
                <option value="FLAT">Flat</option>
                <option value="PER_PERSON">Per Person</option>
              </select></label>
              <label>Default Rate (₹)<input type="number" value={poolForm.defaultRate}
                onChange={(e) => setPoolForm({ ...poolForm, defaultRate: e.target.value })} /></label>
              <button className="primary-btn" id="wizard-create-pool" disabled={createPool.isPending}
                onClick={() => { setClientError(null); try { createPool.mutate(); } catch (e: any) { setClientError(e.message); } }}>
                {createPool.isPending ? <RefreshCw className="spin" size={16} /> : <SlidersHorizontal size={16} />}
                {createPool.isPending ? 'Creating…' : 'Create Pool'}
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2>3. Courts</h2>
            <div className="form-grid compact">
              <p className="muted">
                {isFixed
                  ? 'Each court is booked individually, so every court needs a name.'
                  : 'Shared pools can still name their courts, so staff know which court a guest was given.'}
              </p>
              {courtNames.map((name, idx) => (
                <div className="lookup-box" key={idx}>
                  <label>Court {idx + 1}<input value={name} placeholder="e.g. Court 1"
                    onChange={(e) => setCourtNames(courtNames.map((v, i) => (i === idx ? e.target.value : v)))} /></label>
                  {courtNames.length > 1 && (
                    <button className="secondary-btn" onClick={() => setCourtNames(courtNames.filter((_, i) => i !== idx))}>
                      <Trash2 size={16} />Remove
                    </button>
                  )}
                </div>
              ))}
              <button className="secondary-btn" onClick={() => setCourtNames([...courtNames, ''])}>
                <Plus size={16} />Add another court
              </button>
              <button className="primary-btn" id="wizard-add-courts" disabled={addCourts.isPending || (isFixed && !courtNames.some((n) => n.trim()))}
                onClick={() => addCourts.mutate()}>
                {addCourts.isPending ? <RefreshCw className="spin" size={16} /> : <Plus size={16} />}
                {isFixed ? 'Add Courts & Continue' : 'Add courts (optional for shared pools)'}
              </button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2>4. Booking Rules</h2>
            <div className="form-grid compact">
              <label>Guest Open Window (days)<input type="number" value={ruleForm.guestOpenWindowDays}
                onChange={(e) => setRuleForm({ ...ruleForm, guestOpenWindowDays: e.target.value })} /></label>
              <label>Member Booking Window (days)<input type="number" value={ruleForm.memberWindowDays}
                onChange={(e) => setRuleForm({ ...ruleForm, memberWindowDays: e.target.value })} /></label>

              <h3>Member Confirmation Window</h3>
              <p className="muted">How many minutes before the session starts must a member confirm attendance?</p>
              <label>Minutes<input type="number" value={ruleForm.gracePeriodMinutes}
                onChange={(e) => setRuleForm({ ...ruleForm, gracePeriodMinutes: e.target.value })} /></label>

              <h3>Staff Alerts</h3>
              <p className="muted">
                How many minutes before the session should staff be notified if it looks under-booked,
                so there&apos;s time to fill it?
              </p>
              <label>Low-Occupancy Alert Lead Time (min)<input type="number" value={ruleForm.guestAccessCutoffMinutes}
                onChange={(e) => setRuleForm({ ...ruleForm, guestAccessCutoffMinutes: e.target.value })} /></label>
              <label>Low-Occupancy Threshold (%)<input type="number" value={ruleForm.lowOccupancyThresholdPct}
                onChange={(e) => setRuleForm({ ...ruleForm, lowOccupancyThresholdPct: e.target.value })} /></label>
              <label className="check-row">
                <input type="checkbox" checked={ruleForm.prepaymentRequired}
                  onChange={(e) => setRuleForm({ ...ruleForm, prepaymentRequired: e.target.checked })} />
                Prepayment Required
              </label>
              <button className="primary-btn" id="wizard-set-rules" disabled={saveRule.isPending} onClick={() => saveRule.mutate()}>
                {saveRule.isPending ? <RefreshCw className="spin" size={16} /> : <CalendarClock size={16} />}
                Set Booking Rules
              </button>
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <h2>5. Scheduling</h2>
            <p className="muted">
              Add the weekly pattern for <strong>{pool?.name}</strong>. The preview below shows the real
              slots this generates — that is the confirmation the branch is bookable.
            </p>
          </>
        )}

        <MutationFeedback error={anyError} />
      </section>

      {/* Step 5 IS SchedulingPage (FLOW-025), reused rather than rebuilt — including its live
          availability preview, which serves as the closing confirmation. */}
      {step === 5 && <SchedulingPage />}
    </main>
  );
}

function AssignmentsPage() {
  const api = useAdminApi();
  const qc = useQueryClient();
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const [resourcePoolId, setResourcePoolId] = useState('');
  const pools = usePools(branchId);
  const [selectedUser, setSelectedUser] = useState<UserLookupResult | null>(null);
  const [form, setForm] = useState({ daysOfWeek: ['1', '2', '3', '4', '5'], startTime: '10:00' });

  // F-171: same endpoint and cache key SchedulingPage already uses, so the two panels share
  // one cached result rather than introducing a second source of pattern truth.
  const patterns = useQuery({
    queryKey: ['availability-patterns', resourcePoolId],
    enabled: !!resourcePoolId,
    queryFn: () => api.get<AvailabilityPattern[]>(`/slot-engine/resource-pools/${resourcePoolId}/availability-patterns`),
  });
  // Recomputed on every daysOfWeek change, not just branch/pool — the valid set shrinks and
  // grows as days are toggled.
  const startTimes = assignmentStartTimes(patterns.data, form.daysOfWeek);
  const noSharedStartTime = !!resourcePoolId && !patterns.isLoading && !patterns.error
    && form.daysOfWeek.length > 0 && startTimes.length === 0;

  React.useEffect(() => {
    if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id);
  }, [branchId, branches.data]);

  React.useEffect(() => {
    if (!resourcePoolId && pools.data?.[0]) setResourcePoolId(pools.data[0].id);
  }, [resourcePoolId, pools.data]);

  React.useEffect(() => {
    if (startTimes.length > 0 && !startTimes.includes(form.startTime)) {
      setForm((draft) => ({ ...draft, startTime: startTimes[0] }));
    }
  }, [form.startTime, startTimes]);

  const assignments = useQuery({
    queryKey: ['assignments', resourcePoolId],
    enabled: !!resourcePoolId,
    queryFn: () => api.get<MemberAssignment[]>(`/slot-engine/member-group-assignments${resourcePoolId ? `?resourcePoolId=${resourcePoolId}` : ''}`),
  });
  const create = useMutation({
    mutationFn: () => {
      if (!selectedUser) throw new Error('Lookup a member phone first');
      if (!resourcePoolId) throw new Error('Select a resource pool');
      return api.post<MemberAssignment>('/slot-engine/member-group-assignments', {
        resourcePoolId,
        userId: selectedUser.id,
        daysOfWeek: form.daysOfWeek.join(','),
        startTime: form.startTime,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments'] }),
  });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch<MemberAssignment>(`/slot-engine/member-group-assignments/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments'] }),
  });
  return (
    <main className="content-grid two">
      <section className="panel">
        <h2>Assign Member to Recurring Slot</h2>
        <div className="form-grid compact">
          <label>Branch<select value={branchId} onChange={(event) => { setBranchId(event.target.value); setResourcePoolId(''); }}>
            <option value="">Select branch</option>
            {(branches.data || []).map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}
          </select></label>
          <label>Resource pool<select value={resourcePoolId} onChange={(event) => setResourcePoolId(event.target.value)}>
            <option value="">Select pool</option>
            {(pools.data || []).map((pool) => <option value={pool.id} key={pool.id}>{pool.name}</option>)}
          </select></label>
          <UserLookup value={selectedUser} onResolved={setSelectedUser} />
          <div className="check-group">
            {weekdayOptions.map((day) => (
              <label className="check-row" key={day.value}>
                <input
                  type="checkbox"
                  checked={form.daysOfWeek.includes(day.value)}
                  onChange={(event) => setForm((draft) => ({
                    ...draft,
                    daysOfWeek: event.target.checked ? [...draft.daysOfWeek, day.value] : draft.daysOfWeek.filter((value) => value !== day.value),
                  }))}
                />
                {day.label}
              </label>
            ))}
          </div>
          <div className="time-slot-section">
            <span className="field-label">Start time</span>
            <div className="time-slot-grid">
              {startTimes.map((time) => (
                <button
                  type="button"
                  className={`time-slot ${form.startTime === time ? 'active' : ''}`}
                  key={time}
                  onClick={() => setForm((draft) => ({ ...draft, startTime: time }))}
                >
                  {time}
                </button>
              ))}
            </div>
            {/* F-171: a pattern-derived set can legitimately be empty, unlike the old
                working-hours range. Explain it and disable the action rather than leaving an
                empty grid and inviting a doomed click (same shape as F-031). */}
            {noSharedStartTime && (
              <MutationFeedback error={{ message: "No shared start time for these days — check each day's availability pattern." }} />
            )}
          </div>
          <button className="primary-btn" disabled={create.isPending || !selectedUser || !resourcePoolId || form.daysOfWeek.length === 0 || noSharedStartTime} onClick={() => create.mutate()}>
            {create.isPending ? <RefreshCw className="spin" size={16} /> : <Users size={16} />}
            {create.isPending ? 'Assigning...' : 'Assign member'}
          </button>
          <MutationFeedback error={create.error || assignments.error} successMessage={create.isSuccess ? 'Member assignment created.' : undefined} />
        </div>
      </section>
      <section className="panel">
        <h2>Assignments</h2>
        <div className="table-list">
          {(assignments.data || []).map((assignment) => (
            <div className="table-row" key={assignment.id}>
              <div><strong>{formatMemberContact(assignment.member)}</strong><span>{assignment.resourcePool?.name || assignment.resourcePoolId} | {formatDaysOfWeek(assignment.daysOfWeek)} {assignment.startTime}</span></div>
              <button className="secondary-btn" onClick={() => update.mutate({ id: assignment.id, status: assignment.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })}>{assignment.status}</button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function OccupancyPage() {
  const api = useAdminApi();
  const qc = useQueryClient();
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const pools = usePools(branchId);
  const [poolId, setPoolId] = useState('');
  const selectedPool = pools.data?.find((pool) => pool.id === poolId);
  const selectedRule = selectedPool?.bookingRules?.[0];
  const [date, setDate] = useState(todayIsoDate());
  const availability = useAvailability(poolId, date);
  const [windowId, setWindowId] = useState('');
  const selectedWindow = availability.data?.find((slot) => slot.window.id === windowId)?.window;

  React.useEffect(() => {
    if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id);
  }, [branchId, branches.data]);

  React.useEffect(() => {
    if (!poolId && pools.data?.[0]) setPoolId(pools.data[0].id);
  }, [poolId, pools.data]);

  const occupancy = useQuery({
    queryKey: ['occupancy', poolId, date],
    enabled: !!poolId,
    queryFn: () => api.get<OccupancySummary>(`/slot-engine/resource-pools/${poolId}/occupancy?date=${date}`),
  });
  const release = useMutation({
    mutationFn: () => {
      if (!selectedWindow?.updatedAt) throw new Error('Select a fresh availability window before release');
      return api.post(`/slot-engine/resource-pools/${poolId}/windows/${windowId}/release`, {
        expectedUpdatedAt: selectedWindow.updatedAt,
        pricingMode: selectedPool?.pricingMode,
        price: Number(selectedPool?.defaultRate || 0),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['occupancy', poolId, date] });
      qc.invalidateQueries({ queryKey: ['availability', poolId, date] });
    },
  });
  return (
    <main className="content-grid two">
      <section className="panel">
        <h2>Low Occupancy</h2>
        <div className="form-grid compact">
          <label>Branch<select value={branchId} onChange={(event) => { setBranchId(event.target.value); setPoolId(''); setWindowId(''); }}>
            <option value="">Select branch</option>
            {(branches.data || []).map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}
          </select></label>
          <label>Resource pool<select value={poolId} onChange={(event) => { setPoolId(event.target.value); setWindowId(''); }}>
            <option value="">Select pool</option>
            {(pools.data || []).map((pool) => <option value={pool.id} key={pool.id}>{pool.name}</option>)}
          </select></label>
          <label>Date<input type="date" value={date} onChange={(event) => { setDate(event.target.value); setWindowId(''); }} /></label>
        </div>
        {occupancy.data && (
          <div className="metric-card alert">
            <span>{occupancy.data.confirmedSeats} of {occupancy.data.totalCapacity} confirmed</span>
            <strong>{occupancy.data.occupancyPercentage}%</strong>
            <span>Threshold {selectedRule?.lowOccupancyThresholdPct ?? 'not set'}%</span>
            <span>Guest cutoff {selectedRule?.guestAccessCutoffMinutes ?? 120} min</span>
          </div>
        )}
        <MutationFeedback error={occupancy.error || availability.error} />
      </section>
      <section className="panel">
        <h2>Manual Release</h2>
        <div className="form-grid compact">
          <label>Availability window<select value={windowId} onChange={(event) => setWindowId(event.target.value)}>
            <option value="">Select window</option>
            {(availability.data || []).map((slot) => <option value={slot.window.id} key={slot.window.id}>{formatWindow(slot)}</option>)}
          </select></label>
          {selectedWindow ? <div className="muted">Last fetched {new Date(selectedWindow.updatedAt || '').toLocaleString()}</div> : null}
          <button className="primary-btn" disabled={!poolId || !windowId || release.isPending} onClick={() => release.mutate()}>
            {release.isPending ? <RefreshCw className="spin" size={16} /> : <CalendarClock size={16} />}
            {release.isPending ? 'Releasing...' : 'Release to guests'}
          </button>
          <MutationFeedback error={release.error} successMessage={release.isSuccess ? 'Window released to guests.' : undefined} />
        </div>
      </section>
    </main>
  );
}

function NegotiatedPage() {
  const api = useAdminApi();
  const { tenant } = useTenant();
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const pools = usePools(branchId);
  const [resourcePoolId, setResourcePoolId] = useState('');
  const [bookingDate, setBookingDate] = useState(todayIsoDate());
  const availability = useAvailability(resourcePoolId, bookingDate);
  const [form, setForm] = useState({
    windowId: '',
    negotiatedPrice: '',
    coPlayers: '',
    description: '',
  });
  const [selectedUser, setSelectedUser] = useState<UserLookupResult | null>(null);
  const [result, setResult] = useState<any>(null);

  React.useEffect(() => {
    if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id);
  }, [branchId, branches.data]);

  React.useEffect(() => {
    if (!resourcePoolId && pools.data?.[0]) setResourcePoolId(pools.data[0].id);
  }, [resourcePoolId, pools.data]);

  const submit = useMutation({
    mutationFn: () => {
      if (!tenant?.id) throw new Error('Tenant context is required');
      if (!selectedUser) throw new Error('Lookup a member phone first');
      if (!branchId || !resourcePoolId || !form.windowId) throw new Error('Select branch, pool, and window');
      const idempotencyKey = crypto.randomUUID();
      return api.post('/payment/payment-links/negotiated', {
        tenantId: tenant.id,
        branchId,
        resourcePoolId,
        ...form,
        userId: selectedUser.id,
        negotiatedPrice: Number(form.negotiatedPrice),
        coPlayers: form.coPlayers.split(',').map((phone) => phone.trim()).filter(Boolean),
      }, { 'Idempotency-Key': idempotencyKey });
    },
    onSuccess: setResult,
  });
  return (
    <main className="content-grid two">
      <section className="panel">
        <h2>Negotiated Booking</h2>
        <div className="form-grid compact">
          <label>Branch<select value={branchId} onChange={(event) => { setBranchId(event.target.value); setResourcePoolId(''); setForm((draft) => ({ ...draft, windowId: '' })); }}>
            <option value="">Select branch</option>
            {(branches.data || []).map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}
          </select></label>
          <label>Resource pool<select value={resourcePoolId} onChange={(event) => { setResourcePoolId(event.target.value); setForm((draft) => ({ ...draft, windowId: '' })); }}>
            <option value="">Select pool</option>
            {(pools.data || []).map((pool) => <option value={pool.id} key={pool.id}>{pool.name}</option>)}
          </select></label>
          <label>Date<input type="date" value={bookingDate} onChange={(event) => { setBookingDate(event.target.value); setForm((draft) => ({ ...draft, windowId: '' })); }} /></label>
          <label>Availability window<select value={form.windowId} onChange={(event) => setForm((draft) => ({ ...draft, windowId: event.target.value }))}>
            <option value="">Select window</option>
            {(availability.data || []).map((slot) => <option value={slot.window.id} key={slot.window.id}>{formatWindow(slot)}</option>)}
          </select></label>
          <UserLookup value={selectedUser} onResolved={setSelectedUser} />
          <label>Negotiated price<input value={form.negotiatedPrice} onChange={(event) => setForm((draft) => ({ ...draft, negotiatedPrice: event.target.value }))} /></label>
          <label>Co-player phones<input value={form.coPlayers} onChange={(event) => setForm((draft) => ({ ...draft, coPlayers: event.target.value }))} /></label>
          <label>Description<input value={form.description} onChange={(event) => setForm((draft) => ({ ...draft, description: event.target.value }))} /></label>
          {availability.isSuccess && availability.data.length === 0 ? <div className="inline-error">No available windows for this pool/date.</div> : null}
          <button className="primary-btn" disabled={submit.isPending || !selectedUser || !form.windowId || !form.negotiatedPrice} onClick={() => submit.mutate()}>
            {submit.isPending ? <RefreshCw className="spin" size={16} /> : <LinkIcon size={16} />}
            {submit.isPending ? 'Creating...' : 'Create payment link'}
          </button>
          <MutationFeedback error={submit.error || availability.error} successMessage={submit.isSuccess ? 'Negotiated booking and payment link created.' : undefined} />
        </div>
      </section>
      <section className="panel">
        <h2>Payment Link</h2>
        {result?.paymentLink ? (
          <div className="result-box">
            <strong>{result.paymentLink.shortUrl}</strong>
            <button className="secondary-btn" onClick={() => navigator.clipboard.writeText(result.paymentLink.shortUrl)}><Copy size={16} />Copy</button>
            <span>Booking: {result.booking?.id}</span>
          </div>
        ) : <p className="muted">Create a negotiated booking to generate a shareable link.</p>}
      </section>
    </main>
  );
}

function RefundsPage() {
  const api = useAdminApi();
  const [selectedUser, setSelectedUser] = useState<UserLookupResult | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [form, setForm] = useState({ overrideAmount: '275', reason: 'Admin goodwill override' });
  const [confirmed, setConfirmed] = useState(false);
  const bookings = useQuery({
    queryKey: ['refund-bookings', selectedUser?.id],
    enabled: !!selectedUser,
    queryFn: () => api.get<AdminBooking[]>(`/slot-engine/bookings/admin?userId=${selectedUser?.id}&status=CANCELLED`),
  });
  const selectedBooking = bookings.data?.find((booking) => booking.id === selectedBookingId);
  const preview = useQuery({
    queryKey: ['refund-preview', selectedBookingId],
    enabled: !!selectedBookingId,
    queryFn: () => api.get<RefundPreview>(`/slot-engine/bookings/${selectedBookingId}/cancel-preview`),
  });
  const refund = useMutation({
    mutationFn: () => api.post('/payment/refunds/override', {
      bookingId: selectedBookingId,
      overrideAmount: Number(form.overrideAmount),
      reason: form.reason,
    }),
  });
  return (
    <main className="content-grid two">
      <section className="panel">
        <h2>Manual Refund Override</h2>
        <div className="form-grid compact">
          <UserLookup value={selectedUser} onResolved={(user) => { setSelectedUser(user); setSelectedBookingId(''); }} />
          {bookings.isLoading ? <span className="muted full-row">Loading cancelled bookings...</span> : null}
          {bookings.data?.length === 0 ? <div className="inline-error">No cancelled refundable bookings found for this member.</div> : null}
          {(bookings.data || []).map((booking) => (
            <button
              type="button"
              className={`select-row ${selectedBookingId === booking.id ? 'active' : ''}`}
              key={booking.id}
              onClick={() => setSelectedBookingId(booking.id)}
            >
              <strong>{booking.window?.resourcePool?.name || booking.resourcePoolId}</strong>
              <span>{formatBookingWindow(booking)} | Paid ₹{Number(booking.price || 0)}</span>
              <code>{booking.id}</code>
            </button>
          ))}
          {selectedBooking && preview.data ? (
            <div className="result-box">
              <span>Calculated tiered refund</span>
              <strong>₹{preview.data.refundAmount} ({preview.data.refundPercent}%)</strong>
              <span>Booking price ₹{preview.data.originalPrice}</span>
            </div>
          ) : null}
          {selectedBooking ? (
            <>
              <label>Override amount<input value={form.overrideAmount} onChange={(event) => setForm((draft) => ({ ...draft, overrideAmount: event.target.value }))} /></label>
              <label>Reason<input value={form.reason} onChange={(event) => setForm((draft) => ({ ...draft, reason: event.target.value }))} /></label>
              <label className="check-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />Confirm this bypasses tiered calculation</label>
              <button className="primary-btn danger" disabled={!confirmed || refund.isPending} onClick={() => refund.mutate()}>
                {refund.isPending ? <RefreshCw className="spin" size={16} /> : <Banknote size={16} />}
                {refund.isPending ? 'Issuing...' : 'Issue override'}
              </button>
            </>
          ) : null}
          <MutationFeedback error={refund.error || bookings.error || preview.error} successMessage={refund.isSuccess ? 'Refund override recorded.' : undefined} />
          {refund.data ? <pre className="evidence-box">{JSON.stringify(refund.data, null, 2)}</pre> : null}
        </div>
      </section>
    </main>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route element={<RequireAdmin />}>
        <Route element={<Shell />}>
          <Route index element={<Overview />} />
          <Route path="/resources" element={<ResourcesPage />} />
          {/* SCREEN-002: launched from ResourcesPage rather than the nav — it is a task you start
              from where the gap is felt, not a standing destination. */}
          <Route path="/resources/new" element={<OnboardingWizardPage />} />
          <Route path="/scheduling" element={<SchedulingPage />} />
          <Route path="/assignments" element={<AssignmentsPage />} />
          <Route path="/occupancy" element={<OccupancyPage />} />
          <Route path="/negotiated" element={<NegotiatedPage />} />
          <Route path="/refunds" element={<RefundsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find the root element to mount React application.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <TenantProvider>
        <AuthProvider>
          <BrowserRouter basename="/admin">
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </TenantProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
