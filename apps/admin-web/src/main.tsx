import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { z } from 'zod';
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  Copy,
  LayoutDashboard,
  Link as LinkIcon,
  LogOut,
  RefreshCw,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  Users,
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

type MemberAssignment = {
  id: string;
  userId: string;
  resourcePoolId: string;
  daysOfWeek: string;
  startTime: string;
  status: string;
  resourcePool?: ResourcePool;
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

const roleCanAdmin = (roles: string[] = []) => roles.includes('owner') || roles.some((role) => role.startsWith('branch_manager:'));

const branchScopes = (roles: string[] = []) => roles
  .filter((role) => role.startsWith('branch_manager:'))
  .map((role) => role.split(':')[1])
  .filter(Boolean);

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
  const navItems = [
    { to: '/', label: 'Overview', icon: LayoutDashboard },
    { to: '/resources', label: 'Resources', icon: SlidersHorizontal },
    { to: '/assignments', label: 'Assignments', icon: Users },
    { to: '/occupancy', label: 'Low Occupancy', icon: CalendarClock },
    { to: '/negotiated', label: 'Negotiated', icon: LinkIcon },
    { to: '/refunds', label: 'Refunds', icon: Banknote },
  ];
  return (
    <div className="app-shell">
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
              <label key={field}>{field}<input value={poolDraft[field] || ''} onChange={(event) => setPoolDraft((draft) => ({ ...draft, [field]: event.target.value }))} /></label>
            ))}
            <label>pricingMode<select value={poolDraft.pricingMode || 'FLAT'} onChange={(event) => setPoolDraft((draft) => ({ ...draft, pricingMode: event.target.value }))}><option>FLAT</option><option>PER_PERSON</option></select></label>
            <button className="primary-btn" disabled={savePool.isPending} onClick={() => savePool.mutate()}>
              {savePool.isPending ? <RefreshCw className="spin" size={16} /> : <Save size={16} />}
              {savePool.isPending ? 'Saving...' : 'Save pool'}
            </button>
            <MutationFeedback error={savePool.error} successMessage={savePool.isSuccess ? 'Resource pool saved.' : undefined} />
            <label>guestAccessCutoffMinutes<input value={ruleDraft.guestAccessCutoffMinutes || ''} onChange={(event) => setRuleDraft((draft) => ({ ...draft, guestAccessCutoffMinutes: event.target.value }))} /></label>
            <label>lowOccupancyThresholdPct<input value={ruleDraft.lowOccupancyThresholdPct || ''} onChange={(event) => setRuleDraft((draft) => ({ ...draft, lowOccupancyThresholdPct: event.target.value }))} /></label>
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
  const [resourcePoolId, setResourcePoolId] = useState('');
  const [form, setForm] = useState({ userId: '', daysOfWeek: '1,2,3,4,5', startTime: '10:00' });
  const assignments = useQuery({
    queryKey: ['assignments', resourcePoolId],
    queryFn: () => api.get<MemberAssignment[]>(`/slot-engine/member-group-assignments${resourcePoolId ? `?resourcePoolId=${resourcePoolId}` : ''}`),
  });
  const create = useMutation({
    mutationFn: () => api.post<MemberAssignment>('/slot-engine/member-group-assignments', { ...form, resourcePoolId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments'] }),
  });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch<MemberAssignment>(`/slot-engine/member-group-assignments/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments'] }),
  });
  return (
    <main className="content-grid two">
      <section className="panel">
        <h2>Create Assignment</h2>
        <div className="form-grid compact">
          <label>Resource pool ID<input value={resourcePoolId} onChange={(event) => setResourcePoolId(event.target.value)} /></label>
          <label>User ID<input value={form.userId} onChange={(event) => setForm((draft) => ({ ...draft, userId: event.target.value }))} /></label>
          <label>Days<input value={form.daysOfWeek} onChange={(event) => setForm((draft) => ({ ...draft, daysOfWeek: event.target.value }))} /></label>
          <label>Start<input value={form.startTime} onChange={(event) => setForm((draft) => ({ ...draft, startTime: event.target.value }))} /></label>
          <button className="primary-btn" disabled={create.isPending} onClick={() => create.mutate()}><Users size={16} />Assign member</button>
          <ErrorBanner error={create.error || assignments.error} />
        </div>
      </section>
      <section className="panel">
        <h2>Assignments</h2>
        <div className="table-list">
          {(assignments.data || []).map((assignment) => (
            <div className="table-row" key={assignment.id}>
              <div><strong>{assignment.userId}</strong><span>{assignment.resourcePool?.name || assignment.resourcePoolId} | {assignment.daysOfWeek} {assignment.startTime}</span></div>
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
  const [poolId, setPoolId] = useState('');
  const [windowId, setWindowId] = useState('');
  const occupancy = useQuery({
    queryKey: ['occupancy', poolId],
    enabled: !!poolId,
    queryFn: () => api.get<{ totalCapacity: number; confirmedSeats: number; occupancyPercentage: number }>(`/slot-engine/resource-pools/${poolId}/occupancy`),
  });
  const release = useMutation({
    mutationFn: () => api.post(`/slot-engine/resource-pools/${poolId}/windows/${windowId}/release`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['occupancy', poolId] }),
  });
  return (
    <main className="content-grid two">
      <section className="panel">
        <h2>Low Occupancy</h2>
        <label>Resource pool ID<input value={poolId} onChange={(event) => setPoolId(event.target.value)} /></label>
        {occupancy.data && (
          <div className="metric-card alert">
            <span>{occupancy.data.confirmedSeats} of {occupancy.data.totalCapacity} confirmed</span>
            <strong>{occupancy.data.occupancyPercentage}%</strong>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Manual Release</h2>
        <label>Window ID<input value={windowId} onChange={(event) => setWindowId(event.target.value)} /></label>
        <button className="primary-btn" disabled={!poolId || !windowId || release.isPending} onClick={() => release.mutate()}><CalendarClock size={16} />Release to guests</button>
        <ErrorBanner error={release.error} />
      </section>
    </main>
  );
}

function NegotiatedPage() {
  const api = useAdminApi();
  const [form, setForm] = useState({
    tenantId: '',
    branchId: '',
    resourcePoolId: '',
    resourceId: '',
    windowId: '',
    userId: '',
    negotiatedPrice: '',
    coPlayers: '',
    description: '',
  });
  const [result, setResult] = useState<any>(null);
  const submit = useMutation({
    mutationFn: () => {
      const idempotencyKey = crypto.randomUUID();
      return api.post('/payment/payment-links/negotiated', {
        ...form,
        negotiatedPrice: Number(form.negotiatedPrice),
        coPlayers: form.coPlayers.split(',').map((phone) => phone.trim()).filter(Boolean),
        resourceId: form.resourceId || undefined,
      }, { 'Idempotency-Key': idempotencyKey });
    },
    onSuccess: setResult,
  });
  return (
    <main className="content-grid two">
      <section className="panel">
        <h2>Negotiated Booking</h2>
        <div className="form-grid compact">
          {Object.keys(form).map((field) => <label key={field}>{field}<input value={form[field as keyof typeof form]} onChange={(event) => setForm((draft) => ({ ...draft, [field]: event.target.value }))} /></label>)}
          <button className="primary-btn" disabled={submit.isPending} onClick={() => submit.mutate()}><LinkIcon size={16} />Create payment link</button>
          <ErrorBanner error={submit.error} />
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
  const [form, setForm] = useState({ bookingId: '', overrideAmount: '', reason: '' });
  const [confirmed, setConfirmed] = useState(false);
  const refund = useMutation({
    mutationFn: () => api.post('/payment/refunds/override', {
      bookingId: form.bookingId,
      overrideAmount: Number(form.overrideAmount),
      reason: form.reason,
    }),
  });
  return (
    <main className="content-grid two">
      <section className="panel">
        <h2>Manual Refund Override</h2>
        <div className="form-grid compact">
          <label>Booking ID<input value={form.bookingId} onChange={(event) => setForm((draft) => ({ ...draft, bookingId: event.target.value }))} /></label>
          <label>Override amount<input value={form.overrideAmount} onChange={(event) => setForm((draft) => ({ ...draft, overrideAmount: event.target.value }))} /></label>
          <label>Reason<input value={form.reason} onChange={(event) => setForm((draft) => ({ ...draft, reason: event.target.value }))} /></label>
          <label className="check-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />Confirm this bypasses tiered calculation</label>
          <button className="primary-btn danger" disabled={!confirmed || refund.isPending} onClick={() => refund.mutate()}><Banknote size={16} />Issue override</button>
          <ErrorBanner error={refund.error} />
          {refund.data ? <div className="success-box">Refund override recorded.</div> : null}
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
