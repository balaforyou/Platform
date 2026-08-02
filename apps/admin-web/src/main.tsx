import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { z } from 'zod';
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  Copy,
  LayoutDashboard,
  Link as LinkIcon,
  LogOut,
  Menu,
  RefreshCw,
  Save,
  ShieldAlert,
  SlidersHorizontal,
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

type ApiError = Error & { code?: string; statusCode?: number };

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: true,
    },
  },
});

const poolSchema = z.object({
  name: z.string().min(1),
  capacity: z.coerce.number().int().min(1),
  minOccupancy: z.coerce.number().int().min(1),
  minBookingDurationMinutes: z.coerce.number().int().positive(),
  pricingMode: z.enum(['FLAT', 'PER_PERSON']),
  defaultRate: z.coerce.number().min(0),
});

const ruleSchema = z.object({
  guestAccessCutoffMinutes: z.coerce.number().int().min(0),
  lowOccupancyThresholdPct: z.coerce.number().int().min(0).max(100),
});

const branchScheduleSchema = z.object({
  workingHoursStart: z.string().regex(/^\d{2}:\d{2}$/),
  workingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/),
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
  { value: '0', label: 'Sun' },
];

function timeToMinutes(value?: string | null) {
  const [hours = '0', minutes = '0'] = (value || '00:00').split(':');
  return Number(hours) * 60 + Number(minutes);
}

function minutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
  const minutes = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function assignmentStartTimes(branch?: Branch, pool?: ResourcePool) {
  const start = timeToMinutes(branch?.workingHoursStart || '06:00');
  const end = timeToMinutes(branch?.workingHoursEnd || '22:00');
  const step = pool?.minBookingDurationMinutes || 60;
  const latestStart = end - step;
  const slots: string[] = [];
  for (let minute = start; minute <= latestStart; minute += step) {
    slots.push(minutesToTime(minute));
  }
  return slots;
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
  const branches = useBranches();
  const active = branches.data?.filter((branch) => branch.status === 'ACTIVE').length || 0;
  return (
    <main className="page-grid">
      <section className="metric-card"><span>Branches</span><strong>{branches.data?.length || 0}</strong></section>
      <section className="metric-card"><span>Active</span><strong>{active}</strong></section>
      <section className="metric-card"><span>Workflows</span><strong>5</strong></section>
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
        <select value={selectedPool?.id || ''} onChange={(event) => setSelectedPoolId(event.target.value)}>
          {(pools.data || []).map((pool) => <option value={pool.id} key={pool.id}>{pool.name}</option>)}
        </select>
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

function AssignmentsPage() {
  const api = useAdminApi();
  const qc = useQueryClient();
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const [resourcePoolId, setResourcePoolId] = useState('');
  const pools = usePools(branchId);
  const selectedBranch = branches.data?.find((branch) => branch.id === branchId);
  const selectedPool = pools.data?.find((pool) => pool.id === resourcePoolId);
  const startTimes = assignmentStartTimes(selectedBranch, selectedPool);
  const [selectedUser, setSelectedUser] = useState<UserLookupResult | null>(null);
  const [form, setForm] = useState({ daysOfWeek: ['1', '2', '3', '4', '5'], startTime: '10:00' });

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
          </div>
          <button className="primary-btn" disabled={create.isPending || !selectedUser || !resourcePoolId || form.daysOfWeek.length === 0} onClick={() => create.mutate()}>
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
              <div><strong>{formatMemberContact(assignment.member)}</strong><span>{assignment.resourcePool?.name || assignment.resourcePoolId} | {assignment.daysOfWeek} {assignment.startTime}</span></div>
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
